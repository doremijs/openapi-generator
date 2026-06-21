/**
 * Stream utilities for handling Server-Sent Events (SSE) and streaming responses.
 *
 * Compatible with all common SSE variants out of the box:
 * - Standard SSE (W3C spec): text/event-stream
 * - OpenAI / Anthropic / AI API streaming
 * - CRLF / LF / CR line endings
 * - Multiple `data:` lines per event
 * - Comment lines (`: ...`)
 * - UTF-8 BOM
 *
 * ## Quick Start
 *
 * ### Callback style (simplest)
 * ```ts
 * const res = await fetch('/api/stream')
 * await processStream(res, {
 *   onData: (chunk) => console.log('received:', chunk),
 *   onComplete: () => console.log('done')
 * })
 * ```
 *
 * ### Iterator style (more control)
 * ```ts
 * const res = await fetch('/api/stream')
 * for await (const event of iterateStream(res)) {
 *   if (event.data) setText(prev => prev + event.data)
 * }
 * ```
 *
 * ### Collect all (for short streams)
 * ```ts
 * const chunks = await accumulateStream(res)
 * ```
 */

// ── Core types ──

/**
 * Parsed SSE event with data automatically parsed as JSON.
 * This is what `iterateStream` and `processStream` yield.
 */
export interface SSEEventWithJSON<T = any> {
  /** Optional event type from `event:` field */
  event?: string
  /** Parsed JSON data, or null if the data field contains non-JSON (e.g. `[DONE]`) */
  data: T
  /** Optional event ID from `id:` field */
  id?: string
  /** Raw event block text for debugging */
  raw?: string
}

/**
 * Options for reading an SSE stream
 */
export type StreamReadOptions = {
  /**
   * How to handle events with non-JSON data (plain text like `[DONE]`).
   * - `'include-as-null'` (default): yield the event with `data: null`
   * - `'skip'`: silently drop non-JSON events
   * @default 'include-as-null'
   */
  nonJSONBehavior?: 'include-as-null' | 'skip'

  /**
   * Custom strings that signal end-of-stream (e.g. `["[DONE]", "[END]"]`).
   * These are matched against the raw `data:` field value.
   * When matched, the stream stops processing (no more events yielded).
   * @default ["[DONE]"]
   */
  terminationMarkers?: string[] | false

  /**
   * Whether to append remaining data when the stream ends without a
   * trailing blank line (practical compatibility with non-compliant servers).
   * @default true
   */
  processPartialEnding?: boolean
}

/**
 * Callbacks for `processStream`
 */
export type StreamCallbacks<TData> = {
  onData?: (chunk: TData, event: SSEEventWithJSON<TData>) => void
  onError?: (error: Error) => void
  onComplete?: () => void
}

// ── Internal: TextDecoder ──

const decoder = new TextDecoder()

// ── Internal: SSEEvent (parsed shape, not directly exported) ──

interface ParsedSSEEvent {
  data: string
  event?: string
  id?: string
  retry?: number
}

// ── Internal: SSEParser ──

/**
 * SSE Parser — internal implementation.
 * Handles all standard SSE line ending and field parsing.
 */
export class SSEParser {
  private buffer = ''
  private bomSkipped = false

  private normalizeLineEndings(text: string): string {
    text = text.replace(/\r\n/g, '\n')
    text = text.replace(/\r/g, '\n')
    return text
  }

  /**
   * Feed raw chunk, returns completed event blocks.
   */
  parse(chunk: string): string[] {
    if (!this.bomSkipped) {
      if (chunk.charCodeAt(0) === 0xFEFF) {
        chunk = chunk.slice(1)
      }
      this.bomSkipped = true
    }

    this.buffer += this.normalizeLineEndings(chunk)

    // Guard against unbounded buffer growth (malicious/misconfigured server)
    if (this.buffer.length > 1_048_576) {
      throw new Error(
        'SSE buffer overflow: the stream has produced more than 1MB of data ' +
        'without a blank line terminator. This may indicate a misconfigured server.'
      )
    }

    const events: string[] = []

    while (true) {
      const splitIndex = this.buffer.indexOf('\n\n')
      if (splitIndex === -1) break

      const eventBlock = this.buffer.slice(0, splitIndex)
      this.buffer = this.buffer.slice(splitIndex + 2)

      const trimmed = eventBlock.trim()
      if (trimmed) {
        events.push(trimmed)
      }
    }

    return events
  }

  getRemaining(): string {
    return this.buffer
  }

  reset(): void {
    this.buffer = ''
    this.bomSkipped = false
  }
}

// ── Internal: Event parsing ──

/**
 * Parse a single SSE event block. Returns null if no data field present.
 * Implements W3C SSE field parsing.
 */
function parseEventBlock(eventBlock: string): ParsedSSEEvent | null {
  const lines = eventBlock.split('\n')
  const result: ParsedSSEEvent = { data: '' }
  let hasData = false

  for (const line of lines) {
    if (line === '') continue
    if (line.startsWith(':')) continue

    const colonIndex = line.indexOf(':')
    let field: string
    let value: string

    if (colonIndex === -1) {
      field = line
      value = ''
    } else {
      field = line.slice(0, colonIndex)
      value = line.slice(colonIndex + 1)
      if (value.startsWith(' ')) {
        value = value.slice(1)
      }
    }

    switch (field) {
      case 'data':
        hasData = true
        if (result.data === '') {
          result.data = value
        } else {
          result.data += '\n' + value
        }
        break
      case 'event':
        result.event = value
        break
      case 'id':
        if (value.indexOf('\0') === -1) {
          result.id = value
        }
        break
      case 'retry': {
        const num = parseInt(value, 10)
        if (!isNaN(num) && num >= 0) {
          result.retry = num
        }
        break
      }
    }
  }

  if (!hasData) return null

  if (result.data.endsWith('\n')) {
    result.data = result.data.slice(0, -1)
  }

  return result
}

/**
 * Parse an SSE event block and attempt JSON parse on data.
 */
function parseEventBlockAsJSON<T = any>(eventBlock: string): SSEEventWithJSON<T | null> | null {
  const event = parseEventBlock(eventBlock)
  if (!event) return null

  let data: T | null = null
  try {
    data = JSON.parse(event.data) as T
  } catch {
    // Non-JSON data (e.g. "[DONE]") — leave data as null
  }

  return {
    event: event.event,
    data,
    id: event.id,
    raw: eventBlock
  }
}

// ── Internal: Stream reading ──

/**
 * Read raw byte chunks from a stream as strings.
 * Low-level utility — most users should use `iterateStream` or `processStream`.
 */
export async function* readStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return
      yield decoder.decode(value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }
}

async function getResponseBody(response: Response): Promise<ReadableStream<Uint8Array>> {
  if (!response.body) {
    throw new Error(
      'Response body is null or not readable. ' +
      'Ensure the response comes from a streaming endpoint ' +
      'and was not already consumed.'
    )
  }
  return response.body
}

// ── Internal: Core SSE stream iterator ──

async function* readSSEChunks<T = unknown>(
  stream: ReadableStream<Uint8Array>,
  options: StreamReadOptions = {}
): AsyncGenerator<SSEEventWithJSON<T | null>> {
  const {
    nonJSONBehavior = 'include-as-null',
    terminationMarkers = ['[DONE]'],
    processPartialEnding = true
  } = options

  const parser = new SSEParser()
  let terminated = false

  for await (const chunk of readStream(stream)) {
    if (terminated) return

    const eventBlocks = parser.parse(chunk)

    for (const eventBlock of eventBlocks) {
      if (terminated) return

      const event = parseEventBlockAsJSON<T>(eventBlock)
      if (!event) continue

      // Handle termination markers
      if (terminationMarkers && event.data === null) {
        // Check if the raw data field matches a termination marker
        const parsed = parseEventBlock(eventBlock)
        if (parsed && terminationMarkers.includes(parsed.data)) {
          terminated = true
          return
        }
      }

      // Handle non-JSON behavior
      if (event.data === null) {
        if (nonJSONBehavior === 'skip') continue
        // 'include-as-null' or 'include': yield with data=null
      }

      yield event
    }
  }

  // Handle remaining data when stream ends
  if (processPartialEnding && !terminated) {
    const remaining = parser.getRemaining().trim()
    if (remaining) {
      const event = parseEventBlockAsJSON<T>(remaining)
      if (event) {
        // Check termination on remaining
        if (terminationMarkers && event.data === null) {
          const parsed = parseEventBlock(remaining)
          if (parsed && terminationMarkers.includes(parsed.data)) {
            return
          }
        }
        if (event.data !== null || nonJSONBehavior !== 'skip') {
          yield event
        }
      }
    }
  }
}

/**
 * Check if a string is an SSE end-of-stream marker like `[DONE]`.
 * (Used by OpenAI and compatible APIs)
 */
export function isTerminationMarker(data: unknown): data is string {
  return typeof data === 'string' && data === '[DONE]'
}

// ── Public API ──

/**
 * Process a streaming Response with callbacks.
 *
 * @example
 * ```ts
 * await processStream(response, {
 *   onData: (chunk) => console.log('chunk:', chunk),
 *   onComplete: () => console.log('done')
 * })
 * ```
 */
export async function processStream<TData = unknown>(
  response: Response,
  callbacks: StreamCallbacks<TData>,
  options?: StreamReadOptions
): Promise<void> {
  const stream = await getResponseBody(response)
  try {
    for await (const event of readSSEChunks<TData>(stream, options)) {
      if (event.data !== null && event.data !== undefined) {
        callbacks.onData?.(event.data as TData, event as SSEEventWithJSON<TData>)
      }
    }
    callbacks.onComplete?.()
  } catch (error) {
    callbacks.onError?.(error as Error)
  }
}

/**
 * Create an async iterator from a streaming Response.
 * Compatible with `for await...of`.
 *
 * @example
 * ```ts
 * for await (const event of iterateStream(response)) {
 *   if (event.data) {
 *     setText(prev => prev + event.data)
 *   }
 * }
 * ```
 */
export async function* iterateStream<T = unknown>(
  response: Response,
  options?: StreamReadOptions
): AsyncGenerator<SSEEventWithJSON<T | null>> {
  const stream = await getResponseBody(response)
  yield* readSSEChunks<T>(stream, options)
}

/**
 * Accumulate all stream data into an array.
 * Useful for short streams where you want all results at once.
 *
 * @example
 * ```ts
 * const chunks = await accumulateStream(response)
 * ```
 */
export async function accumulateStream<T = unknown>(
  response: Response,
  options?: StreamReadOptions
): Promise<T[]> {
  const chunks: T[] = []
  for await (const event of iterateStream<T>(response, options)) {
    if (event.data !== null && event.data !== undefined) {
      chunks.push(event.data as T)
    }
  }
  return chunks
}

/**
 * Parse a raw SSE event block (text between blank lines) into a structured event.
 * Useful for debugging or custom processing.
 *
 * @example
 * ```ts
 * const event = parseSSEEvent('data: {"text":"hello"}\nevent: message')
 * // { data: '{"text":"hello"}', event: 'message' }
 * ```
 */
export function parseSSEEvent(eventBlock: string): {
  data: string
  event?: string
  id?: string
} | null {
  const result = parseEventBlock(eventBlock)
  if (!result) return null
  return {
    data: result.data,
    event: result.event,
    id: result.id
  }
}

/**
 * Parse an SSE event block and attempt JSON parse on the data.
 *
 * @example
 * ```ts
 * const parsed = parseSSEEventAsJSON('data: {"text":"hello"}')
 * if (parsed) console.log(parsed.data.text) // 'hello'
 * ```
 */
export function parseSSEEventAsJSON<T = any>(eventBlock: string): SSEEventWithJSON<T | null> | null {
  return parseEventBlockAsJSON<T>(eventBlock)
}

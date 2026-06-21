/**
 * Stream utilities for handling Server-Sent Events (SSE) and streaming responses
 */

const decoder = new TextDecoder()

/**
 * SSE event type
 */
export interface SSEEvent {
  type?: string
  data: string
  raw?: string
}

export interface SSEEventWithJSON<T = any> {
  type?: string
  data: T
  raw?: string
}

/**
 * SSE Parser for correctly handling Server-Sent Events format
 * Events are separated by \n\n
 */
export class SSEParser {
  private buffer = ''

  /**
   * Parse SSE stream data, returns complete event array
   */
  parse(chunk: string): string[] {
    this.buffer += chunk
    const events: string[] = []

    // SSE events are separated by \n\n
    while (true) {
      const splitIndex = this.buffer.indexOf('\n\n')
      if (splitIndex === -1) break

      const event = this.buffer.slice(0, splitIndex).trim()
      this.buffer = this.buffer.slice(splitIndex + 2)

      if (event) {
        events.push(event)
      }
    }

    return events
  }

  /**
   * Get unprocessed remaining data
   */
  getRemaining(): string {
    return this.buffer
  }

  /**
   * Reset parser
   */
  reset(): void {
    this.buffer = ''
  }
}

/**
 * Parse single SSE event
 * Extract event: and data: fields
 */
export function parseSSEEvent(eventText: string): SSEEvent | null {
  const lines = eventText.split('\n')
  let type: string | undefined
  let data: string | undefined
  let raw = eventText

  for (const line of lines) {
    if (line.startsWith('event:')) {
      type = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      data = line.slice(5).trim()
    }
  }

  if (!data) return null

  return { type, data, raw }
}

/**
 * Parse SSE event data as JSON
 */
export function parseSSEEventAsJSON<T = any>(eventText: string): SSEEventWithJSON<T | null> | null {
  const event = parseSSEEvent(eventText)
  if (!event) return null

  let data: T | null  = null
  try {
    data = JSON.parse(event.data) as T
  } catch {
    //
  }
  return { type: event.type, data, raw: event.raw }
}

/**
 * Read stream using async iterator
 * Compatible with standard ReadableStream
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

/**
 * Read SSE stream and auto-parse events
 * Returns parsed event iterator
 */
export async function* readSSEStream<T = unknown>(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<SSEEventWithJSON<T | null>> {
  const parser = new SSEParser()
  const reader = stream.getReader()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        // Handle remaining data
        const remaining = parser.getRemaining().trim()
        if (remaining) {
          const event = parseSSEEventAsJSON<T>(remaining)
          if (event) yield event
        }
        return
      }

      const chunk = decoder.decode(value, { stream: true })
      const eventTexts = parser.parse(chunk)

      for (const eventText of eventTexts) {
        const event = parseSSEEventAsJSON<T>(eventText)
        if (event) {
          yield event
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Stream callback handler type
 */
export interface StreamCallbacks<TData, TTransformed> {
  onData?: (chunk: TData, chunks: TData[]) => TTransformed | void
  onError?: (error: Error) => void
  onComplete?: () => void
}

/**
 * Process stream with callbacks
 */
export async function processSSEStream<TData = unknown, TTransformed = TData>(
  stream: ReadableStream<Uint8Array>,
  callbacks: StreamCallbacks<TData, TTransformed>
): Promise<TTransformed | undefined> {
  const chunks: TData[] = []
  let result: TTransformed | undefined

  try {
    for await (const event of readSSEStream<TData>(stream)) {
      if (event.data !== undefined) {
        chunks.push(event.data as TData)
        const transformed = callbacks.onData?.(event.data as TData, chunks)
        if (transformed !== undefined) {
          result = transformed as TTransformed
        }
      }
    }
    callbacks.onComplete?.()
    return result
  } catch (error) {
    callbacks.onError?.(error as Error)
    throw error
  }
}

/**
 * Accumulate all stream data into an array
 */
export async function accumulateSSEStream<T = unknown>(stream: ReadableStream<Uint8Array>): Promise<Array<T | null>> {
  const chunks: Array<T | null> = []
  for await (const event of readSSEStream<T>(stream)) {
    if (event.data !== undefined) {
      chunks.push(event.data)
    }
  }
  return chunks
}

/**
 * Options for processing stream responses
 */
export type StreamOptions<TData = unknown, TTransformed = void> = {
  /**
   * Callback when a chunk of data is received
   */
  onData?: (chunk: TData | null, chunks: Array<TData | null>) => TTransformed | void

  /**
   * Callback when an error occurs
   */
  onError?: (error: Error) => void

  /**
   * Callback when stream completes
   */
  onComplete?: () => void
}

function getResponseBody(response: Response): ReadableStream<Uint8Array> {
  if (!response.body) {
    throw new Error('Response body is null')
  }
  return response.body
}

/**
 * Process a streaming response from fetch
 *
 * @example
 * ```ts
 * const response = await client.post('/api/stream', { body: data })
 * await processStream(response, {
 *   onData: (chunk) => console.log(chunk)
 * })
 * ```
 */
export async function processStream<TData = unknown, TTransformed = void>(
  response: Response,
  options: StreamOptions<TData, TTransformed>
): Promise<TTransformed | undefined> {
  return processSSEStream<TData | null, TTransformed>(getResponseBody(response), options)
}

/**
 * Accumulate all stream data into an array
 *
 * @example
 * ```ts
 * const response = await client.post('/api/stream', { body: data })
 * const chunks = await accumulateStream(response)
 * ```
 */
export async function accumulateStream<T = unknown>(response: Response): Promise<Array<T | null>> {
  return accumulateSSEStream<T>(getResponseBody(response))
}

/**
 * Create an async iterator from a streaming response
 *
 * @example
 * ```ts
 * const response = await client.post('/api/stream', { body: data })
 * for await (const event of iterateStream(response)) {
 *   console.log(event.data)
 * }
 * ```
 */
export async function* iterateStream<T = unknown>(
  response: Response
): AsyncGenerator<SSEEventWithJSON<T | null>> {
  yield* readSSEStream<T>(getResponseBody(response))
}

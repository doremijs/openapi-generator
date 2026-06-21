/**
 * Stream utilities tests
 */

import { describe, test, expect } from 'bun:test'
import {
  SSEParser,
  parseSSEEvent,
  parseSSEEventAsJSON,
  readStream,
  processStream,
  iterateStream,
  accumulateStream,
  isTerminationMarker
} from './stream'

// ── SSEParser ──

describe('SSEParser', () => {
  test('should parse single SSE event with LF', () => {
    const parser = new SSEParser()
    const events = parser.parse('data: hello\n\n')
    expect(events).toEqual(['data: hello'])
  })

  test('should parse single SSE event with CRLF', () => {
    const parser = new SSEParser()
    const events = parser.parse('data: hello\r\n\r\n')
    expect(events).toEqual(['data: hello'])
  })

  test('should parse single SSE event with CR', () => {
    const parser = new SSEParser()
    const events = parser.parse('data: hello\r\r')
    expect(events).toEqual(['data: hello'])
  })

  test('should parse multiple SSE events', () => {
    const parser = new SSEParser()
    const events = parser.parse('data: hello\n\ndata: world\n\n')
    expect(events).toEqual(['data: hello', 'data: world'])
  })

  test('should handle incomplete events (buffered)', () => {
    const parser = new SSEParser()
    const events1 = parser.parse('data: hello')
    expect(events1).toEqual([])
    expect(parser.getRemaining()).toBe('data: hello')

    const events2 = parser.parse('\n\ndata: world\n\n')
    expect(events2).toEqual(['data: hello', 'data: world'])
  })

  test('should handle multiple consecutive blank lines', () => {
    const parser = new SSEParser()
    const events = parser.parse('data: first\n\n\n\n\ndata: second\n\n')
    expect(events).toEqual(['data: first', 'data: second'])
  })

  test('should skip BOM at start', () => {
    const parser = new SSEParser()
    const bom = '\uFEFF'
    const events = parser.parse(`${bom}data: hello\n\n`)
    expect(events).toEqual(['data: hello'])
  })

  test('should reset buffer and BOM flag', () => {
    const parser = new SSEParser()
    parser.parse('data: test')
    parser.reset()
    expect(parser.getRemaining()).toBe('')
    const bom = '\uFEFF'
    const events = parser.parse(`${bom}data: hello\n\n`)
    expect(events).toEqual(['data: hello'])
  })

  test('should handle mixed CRLF and LF in same chunk', () => {
    const parser = new SSEParser()
    const events = parser.parse('data: hello\r\n\r\ndata: world\n\n')
    expect(events).toEqual(['data: hello', 'data: world'])
  })

  test('should handle chunk arriving in multiple parts', () => {
    const parser = new SSEParser()
    expect(parser.parse('data: hello')).toEqual([])
    expect(parser.parse(' world\n\n')).toEqual(['data: hello world'])
  })
})

// ── parseSSEEvent ──

describe('parseSSEEvent', () => {
  test('should parse simple data event', () => {
    const event = parseSSEEvent('data: hello world')
    expect(event).toEqual({
      data: 'hello world'
    })
  })

  test('should parse event with type', () => {
    const event = parseSSEEvent('event: message\ndata: hello')
    expect(event).toEqual({
      event: 'message',
      data: 'hello'
    })
  })

  test('should return null for event without data', () => {
    const event = parseSSEEvent('event: message')
    expect(event).toBeNull()
  })

  test('should handle multiple data lines (concatenated with newline)', () => {
    const event = parseSSEEvent('data: line1\ndata: line2\ndata: line3')
    expect(event).toEqual({
      data: 'line1\nline2\nline3'
    })
  })

  test('should handle data: with empty value', () => {
    const event = parseSSEEvent('data:')
    expect(event).toEqual({
      data: ''
    })
  })

  test('should handle data without space after colon', () => {
    const event = parseSSEEvent('data:hello world')
    expect(event).toEqual({
      data: 'hello world'
    })
  })

  test('should handle id field', () => {
    const event = parseSSEEvent('id: 12345\ndata: hello')
    expect(event).toEqual({
      id: '12345',
      data: 'hello'
    })
  })

  test('should ignore comment lines (starting with :)', () => {
    const event = parseSSEEvent(': comment\ndata: hello\n: another comment')
    expect(event).toEqual({
      data: 'hello'
    })
  })

  test('should handle line without colon (field name only, empty value)', () => {
    const event = parseSSEEvent('data: hello\ndata\ndata: world')
    expect(event).toEqual({
      data: 'hello\n\nworld'
    })
  })

  test('should handle OpenAI-like streaming events', () => {
    const raw = 'data: {"id":"abc","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hello"}}]}'
    const event = parseSSEEvent(raw)
    expect(event).not.toBeNull()
    expect(event!.data).toContain('"Hello"')
    const parsed = JSON.parse(event!.data)
    expect(parsed.choices[0].delta.content).toBe('Hello')
  })

  test('should handle event with all fields', () => {
    const event = parseSSEEvent('event: completion\nid: msg_123\ndata: {"text":"hello"}')
    expect(event).toEqual({
      event: 'completion',
      id: 'msg_123',
      data: '{"text":"hello"}'
    })
  })
})

// ── parseSSEEventAsJSON ──

describe('parseSSEEventAsJSON', () => {
  test('should parse JSON data', () => {
    const event = parseSSEEventAsJSON('data: {"text":"hello"}')
    expect(event).toEqual({
      event: undefined,
      data: { text: 'hello' },
      id: undefined,
      raw: 'data: {"text":"hello"}'
    })
  })

  test('should return null data for [DONE] marker (invalid JSON)', () => {
    const event = parseSSEEventAsJSON('data: [DONE]')
    expect(event).not.toBeNull()
    expect(event!.data).toBeNull()
    expect(event!.raw).toBe('data: [DONE]')
  })

  test('should return null data for non-JSON plain text', () => {
    const event = parseSSEEventAsJSON('data: hello world')
    expect(event).not.toBeNull()
    expect(event!.data).toBeNull()
  })

  test('should handle error event data', () => {
    const event = parseSSEEventAsJSON('event: error\ndata: {"code":500,"message":"Internal server error"}')
    expect(event).not.toBeNull()
    expect(event!.event).toBe('error')
    expect(event!.data).toEqual({ code: 500, message: 'Internal server error' })
  })

  test('should return null for event without data field', () => {
    const event = parseSSEEventAsJSON('event: ping')
    expect(event).toBeNull()
  })
})

// ── readStream ──

describe('readStream', () => {
  test('should read stream chunks', async () => {
    const encoder = new TextEncoder()
    const chunks = ['hello', ' ', 'world']

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk))
        }
        controller.close()
      }
    })

    const results: string[] = []
    for await (const data of readStream(stream)) {
      results.push(data)
    }

    expect(results).toEqual(chunks)
  })

  test('should handle empty stream', async () => {
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.close()
      }
    })

    const results: string[] = []
    for await (const data of readStream(stream)) {
      results.push(data)
    }

    expect(results).toEqual([])
  })
})

// ── iterateStream ──

describe('iterateStream (parsed SSE)', () => {
  test('should parse SSE stream with JSON data', async () => {
    const encoder = new TextEncoder()
    const sseData = 'data: {"text":"hello"}\n\ndata: {"text":"world"}\n\n'

    const response = new Response(
      new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode(sseData))
          controller.close()
        }
      }),
      { status: 200 }
    )

    const results: any[] = []
    for await (const event of iterateStream(response)) {
      results.push(event)
    }

    expect(results).toHaveLength(2)
    expect(results[0].data).toEqual({ text: 'hello' })
    expect(results[1].data).toEqual({ text: 'world' })
  })

  test('should handle CRLF in SSE stream', async () => {
    const encoder = new TextEncoder()
    const response = new Response(
      new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode('data: {"msg":"first"}\r\n\r\ndata: {"msg":"second"}\r\n\r\n'))
          controller.close()
        }
      }),
      { status: 200 }
    )

    const results: any[] = []
    for await (const event of iterateStream(response)) {
      results.push(event)
    }

    expect(results).toHaveLength(2)
    expect(results[0].data.msg).toBe('first')
    expect(results[1].data.msg).toBe('second')
  })

  test('should handle [DONE] marker (termination)', async () => {
    const encoder = new TextEncoder()
    const response = new Response(
      new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode('data: {"text":"hello"}\n\ndata: [DONE]\n\n'))
          controller.close()
        }
      }),
      { status: 200 }
    )

    // Default behavior: [DONE] terminates the stream
    const results: any[] = []
    for await (const event of iterateStream(response)) {
      results.push(event)
    }

    // Only the first event should be yielded, [DONE] terminates
    expect(results).toHaveLength(1)
    expect(results[0].data).toEqual({ text: 'hello' })
  })

  test('should handle [DONE] with nonJSONBehavior=include-as-null', async () => {
    const encoder = new TextEncoder()
    const response = new Response(
      new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode('data: {"text":"hello"}\n\ndata: [DONE]\n\n'))
          controller.close()
        }
      }),
      { status: 200 }
    )

    // With include-as-null, [DONE] termination still works (it's checked first)
    const results: any[] = []
    for await (const event of iterateStream(response, { nonJSONBehavior: 'include-as-null' })) {
      results.push(event)
    }

    expect(results).toHaveLength(1)
  })

  test('should handle [DONE] with custom terminationMarkers=false (no termination)', async () => {
    const encoder = new TextEncoder()
    const response = new Response(
      new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode('data: {"text":"hello"}\n\ndata: [DONE]\n\n'))
          controller.close()
        }
      }),
      { status: 200 }
    )

    const results: any[] = []
    for await (const event of iterateStream(response, { terminationMarkers: false })) {
      results.push(event)
    }

    // [DONE] is yielded as an event with null data
    expect(results).toHaveLength(2)
    expect(results[0].data).toEqual({ text: 'hello' })
    expect(results[1].data).toBeNull()
  })

  test('should handle events with event type', async () => {
    const encoder = new TextEncoder()
    const response = new Response(
      new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode('event: ping\ndata: {"time":123}\n\nevent: message\ndata: {"text":"hi"}\n\n'))
          controller.close()
        }
      }),
      { status: 200 }
    )

    const results: any[] = []
    for await (const event of iterateStream(response)) {
      results.push(event)
    }

    expect(results).toHaveLength(2)
    expect(results[0].event).toBe('ping')
    expect(results[0].data.time).toBe(123)
    expect(results[1].event).toBe('message')
    expect(results[1].data.text).toBe('hi')
  })

  test('should handle error events', async () => {
    const encoder = new TextEncoder()
    const response = new Response(
      new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode('event: error\ndata: {"code":401,"message":"Unauthorized"}\n\n'))
          controller.close()
        }
      }),
      { status: 200 }
    )

    const results: any[] = []
    for await (const event of iterateStream(response)) {
      results.push(event)
    }

    expect(results).toHaveLength(1)
    expect(results[0].event).toBe('error')
    expect(results[0].data.code).toBe(401)
  })

  test('should handle OpenAI streaming format', async () => {
    const encoder = new TextEncoder()

    const chunk1 = 'data: {"choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n'
    const chunk2 = 'data: {"choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n'
    const chunk3 = 'data: {"choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}\n\n'
    const chunk4 = 'data: [DONE]\n\n'

    const response = new Response(
      new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode(chunk1 + chunk2 + chunk3 + chunk4))
          controller.close()
        }
      }),
      { status: 200 }
    )

    const results: any[] = []
    for await (const event of iterateStream(response)) {
      results.push(event)
    }

    expect(results).toHaveLength(3) // [DONE] terminates
    expect(results[0].data.choices[0].delta.role).toBe('assistant')
    expect(results[1].data.choices[0].delta.content).toBe('Hello')
    expect(results[2].data.choices[0].delta.content).toBe(' world')
  })

  test('should handle comment lines in stream', async () => {
    const encoder = new TextEncoder()
    const response = new Response(
      new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode(': comment\ndata: {"value":1}\n\n: another\ndata: {"value":2}\n\n'))
          controller.close()
        }
      }),
      { status: 200 }
    )

    const results: any[] = []
    for await (const event of iterateStream(response)) {
      results.push(event)
    }

    expect(results).toHaveLength(2)
    expect(results[0].data.value).toBe(1)
    expect(results[1].data.value).toBe(2)
  })

  test('should handle stream ending with incomplete event', async () => {
    const encoder = new TextEncoder()
    const response = new Response(
      new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode('data: {"text":"hello"}\n\n'))
          controller.enqueue(encoder.encode('data: incomplete'))
          controller.close()
        }
      }),
      { status: 200 }
    )

    const results: any[] = []
    for await (const event of iterateStream(response)) {
      results.push(event)
    }

    // Partial ending: the incomplete event is processed and yielded with null data
    expect(results).toHaveLength(2)
    expect(results[0].data.text).toBe('hello')
    expect(results[1].data).toBeNull() // 'incomplete' can't be parsed as JSON
  })

  test('should handle chunks split across multiple reads', async () => {
    const encoder = new TextEncoder()
    const response = new Response(
      new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode('data: {"tex'))
          await new Promise(r => setTimeout(r, 10))
          controller.enqueue(encoder.encode('t":"hello"}\n\n'))
          controller.enqueue(encoder.encode('data: {"tex'))
          await new Promise(r => setTimeout(r, 10))
          controller.enqueue(encoder.encode('t":"world"}\n\n'))
          controller.close()
        }
      }),
      { status: 200 }
    )

    const results: any[] = []
    for await (const event of iterateStream(response)) {
      results.push(event)
    }

    expect(results).toHaveLength(2)
    expect(results[0].data.text).toBe('hello')
    expect(results[1].data.text).toBe('world')
  })

  test('should skip non-JSON events with nonJSONBehavior=skip', async () => {
    const encoder = new TextEncoder()
    const response = new Response(
      new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode('data: {"text":"hello"}\n\ndata: plain text\n\n'))
          controller.close()
        }
      }),
      { status: 200 }
    )

    const results: any[] = []
    for await (const event of iterateStream(response, {
      nonJSONBehavior: 'skip',
      terminationMarkers: false
    })) {
      results.push(event)
    }

    // plain text is skipped
    expect(results).toHaveLength(1)
    expect(results[0].data.text).toBe('hello')
  })
})

// ── processStream ──

describe('processStream', () => {
  test('should process stream with onData callback', async () => {
    const encoder = new TextEncoder()
    const response = new Response(
      new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode('data: {"value":1}\n\ndata: {"value":2}\n\n'))
          controller.close()
        }
      }),
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
    )

    const received: any[] = []
    await processStream(response, {
      onData: (chunk) => received.push(chunk),
      onComplete: () => received.push('__done__')
    })

    expect(received).toEqual([{ value: 1 }, { value: 2 }, '__done__'])
  })

  test('should handle stream with no data events', async () => {
    const encoder = new TextEncoder()
    const response = new Response(
      new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode(': just a comment\n\n'))
          controller.close()
        }
      }),
      { status: 200 }
    )

    const received: any[] = []
    await processStream(response, {
      onData: (chunk) => received.push(chunk),
      onComplete: () => received.push('__done__')
    })

    expect(received).toEqual(['__done__'])
  })

  test('should throw on null response body', async () => {
    const response = new Response(null, { status: 200 }) as Response

    let error: Error | undefined
    try {
      await processStream(response, {
        onData: () => {},
        onComplete: () => {}
      })
    } catch (e) {
      error = e as Error
    }

    expect(error).toBeDefined()
    expect(error!.message).toContain('null')
  })

  test('should handle stream errors via onError callback', async () => {
    // Create stream that errors immediately (no data before error)
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.error(new Error('Stream failed'))
      }
    })

    const response = new Response(stream, { status: 200 }) as Response

    let errorCaught = false
    try {
      await processStream(response, {
        onData: () => {},
        onError: () => { errorCaught = true }
      })
    } catch {
      // Expected
    }
    expect(errorCaught).toBe(true)
  })
})

// ── accumulateStream ──

describe('accumulateStream', () => {
  test('should accumulate all stream data', async () => {
    const encoder = new TextEncoder()
    const response = new Response(
      new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode('data: {"id":1}\n\ndata: {"id":2}\n\ndata: {"id":3}\n\n'))
          controller.close()
        }
      }),
      { status: 200 }
    )

    const data = await accumulateStream<any>(response)
    expect(data).toHaveLength(3)
    expect(data[0].id).toBe(1)
    expect(data[1].id).toBe(2)
    expect(data[2].id).toBe(3)
  })
})

// ── isTerminationMarker ──

describe('isTerminationMarker', () => {
  test('should detect [DONE] marker', () => {
    expect(isTerminationMarker('[DONE]')).toBe(true)
  })

  test('should return false for non-[DONE] values', () => {
    expect(isTerminationMarker('hello')).toBe(false)
    expect(isTerminationMarker(123)).toBe(false)
    expect(isTerminationMarker(null)).toBe(false)
    expect(isTerminationMarker(undefined)).toBe(false)
    expect(isTerminationMarker({})).toBe(false)
  })
})

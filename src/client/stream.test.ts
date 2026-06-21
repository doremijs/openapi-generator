/**
 * Stream utilities tests
 */

import { describe, test, expect } from 'bun:test'
import {
  SSEParser,
  parseSSEEvent,
  parseSSEEventAsJSON,
  readStream,
  readSSEStream
} from './stream'

describe('SSEParser', () => {
  test('should parse single SSE event', () => {
    const parser = new SSEParser()
    const events = parser.parse('data: hello\n\n')
    expect(events).toEqual(['data: hello'])
  })

  test('should parse multiple SSE events', () => {
    const parser = new SSEParser()
    const events = parser.parse('data: hello\n\ndata: world\n\n')
    expect(events).toEqual(['data: hello', 'data: world'])
  })

  test('should handle incomplete events', () => {
    const parser = new SSEParser()
    const events = parser.parse('data: hello')
    expect(events).toEqual([])
    expect(parser.getRemaining()).toBe('data: hello')
  })

  test('should reset buffer', () => {
    const parser = new SSEParser()
    parser.parse('data: test')
    parser.reset()
    expect(parser.getRemaining()).toBe('')
  })
})

describe('parseSSEEvent', () => {
  test('should parse simple data event', () => {
    const event = parseSSEEvent('data: hello world')
    expect(event).toEqual({
      type: undefined,
      data: 'hello world',
      raw: 'data: hello world'
    })
  })

  test('should parse event with type', () => {
    const event = parseSSEEvent('event: message\ndata: hello')
    expect(event).toEqual({
      type: 'message',
      data: 'hello',
      raw: 'event: message\ndata: hello'
    })
  })

  test('should return null for event without data', () => {
    const event = parseSSEEvent('event: message')
    expect(event).toBeNull()
  })
})

describe('parseSSEEventAsJSON', () => {
  test('should parse JSON data', () => {
    const event = parseSSEEventAsJSON('data: {"text":"hello"}')
    expect(event).toEqual({
      type: undefined,
      data: { text: 'hello' },
      raw: 'data: {"text":"hello"}'
    })
  })

  test('should return null data for invalid JSON', () => {
    const event = parseSSEEventAsJSON('data: not json')
    expect(event).toEqual({
      type: undefined,
      data: null,
      raw: 'data: not json'
    })
  })
})

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
})

describe('readSSEStream', () => {
  test('should parse SSE stream', async () => {
    const encoder = new TextEncoder()
    const sseData = 'data: {"text":"hello"}\n\ndata: {"text":"world"}\n\n'

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode(sseData))
        controller.close()
      }
    })

    const results: any[] = []
    for await (const event of readSSEStream(stream)) {
      results.push(event)
    }

    expect(results).toHaveLength(2)
    expect(results[0].data).toEqual({ text: 'hello' })
  })
})

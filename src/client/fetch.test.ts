/**
 * Fetch client tests
 */

import { describe, test, expect } from 'bun:test'
import { createFetchClient } from './fetch'
import { processStream, iterateStream } from './stream'

describe('createFetchClient', () => {
  test('should create client with methods', () => {
    const client = createFetchClient()
    expect(typeof client.get).toBe('function')
    expect(typeof client.post).toBe('function')
    expect(typeof client.put).toBe('function')
    expect(typeof client.delete).toBe('function')
    expect(typeof client.patch).toBe('function')
    // stream should not be a method anymore
    expect(typeof (client as any).stream).toBe('undefined')
  })

  test('should handle GET request', async () => {
    const mockData = { message: 'hello' }
    const client = createFetchClient({
      fetchImpl: async () => {
        return new Response(JSON.stringify(mockData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
    })

    const result = await client.get('/api/test')
    expect(result.error).toBe(false)
    if (!result.error) {
      expect(result.data).toEqual(mockData)
    }
  })

  test('should handle POST request', async () => {
    const mockData = { id: 1 }
    const client = createFetchClient({
      fetchImpl: async (url, init) => {
        expect(url).toBe('/api/test')
        expect(init?.method).toBe('post')  // Method is lowercase
        expect(init?.body).toBe(JSON.stringify({ name: 'test' }))
        return new Response(JSON.stringify(mockData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
    })

    const result = await client.post('/api/test', {
      body: { name: 'test' }
    })
    expect(result.error).toBe(false)
  })

  test('should handle path parameters', async () => {
    const client = createFetchClient({
      fetchImpl: async (url) => {
        expect(url).toContain('/api/items/123')
        return new Response(null, { status: 200 })
      }
    })

    await client.get('/api/items/{id}', {
      params: { id: 123 }
    })
  })

  test('should handle query parameters', async () => {
    const client = createFetchClient({
      fetchImpl: async (url) => {
        expect(url).toContain('limit=10')
        return new Response(null, { status: 200 })
      }
    })

    await client.get('/api/items', {
      query: { limit: '10' }
    })
  })

  test('should handle custom headers', async () => {
    let capturedHeaders: HeadersInit | null = null
    const client = createFetchClient({
      fetchImpl: async (_url, init) => {
        capturedHeaders = init?.headers || null
        return new Response(null, { status: 200 })
      }
    })

    await client.get('/api/test', {
      headers: { 'X-Custom-Header': 'value' }
    })

    expect(capturedHeaders).toBeDefined()
  })

  test('should apply request interceptor', async () => {
    let interceptorCalled = false
    const client = createFetchClient({
      fetchImpl: async (url) => {
        expect(url).toContain('/modified')
        return new Response(null, { status: 200 })
      },
      requestInterceptor: async (request) => {
        interceptorCalled = true
        request.url = request.url.replace('/api/test', '/modified')
        return request
      }
    })

    await client.get('/api/test')
    expect(interceptorCalled).toBe(true)
  })

  test('should apply response interceptor', async () => {
    let interceptorCalled = false
    const client = createFetchClient({
      fetchImpl: async () => {
        return new Response(null, { status: 200 })
      },
      responseInterceptor: async () => {
        interceptorCalled = true
        return null
      }
    })

    await client.get('/api/test')
    expect(interceptorCalled).toBe(true)
  })

  test('should call error handler on request failure', async () => {
    let errorHandlerCalled = false
    const client = createFetchClient({
      fetchImpl: async () => {
        throw new Error('Network error')
      },
      errorHandler: () => {
        errorHandlerCalled = true
      }
    })

    const result = await client.get('/api/test')
    expect(result.error).toBe(true)
    expect(errorHandlerCalled).toBe(true)
  })

  test('should return response object', async () => {
    const client = createFetchClient({
      fetchImpl: async () => {
        return new Response(JSON.stringify({ data: 'test' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
    })

    const result = await client.get('/api/test')
    expect(result.error).toBe(false)
    if (!result.error) {
      expect(result.response).toBeInstanceOf(Response)
    }
  })
})

describe('Streaming with processStream', () => {
  test('should process streaming response from POST request', async () => {
    const encoder = new TextEncoder()
    const chunks = ['hello', 'world', 'test']

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        for (const chunk of chunks) {
          // Use JSON format for proper parsing
          controller.enqueue(encoder.encode(`data: "${chunk}"\n\n`))
        }
        controller.close()
      }
    })

    const client = createFetchClient({
      fetchImpl: async () => {
        return new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' }
        }) as Response
      }
    })

    const response = await client.post('/api/stream', {
      body: { query: 'test' }
    })

    expect(response.error).toBe(false)
    if (!response.error && response.response) {
      const receivedChunks: string[] = []
      await processStream(response.response, {
        onData: (chunk) => {
          receivedChunks.push(chunk)
        }
      })

      expect(receivedChunks).toEqual(chunks)
    }
  })

  test('should handle stream errors', async () => {
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(new TextEncoder().encode('data: test\n\n'))
        controller.error(new Error('Stream failed'))
      }
    })

    const client = createFetchClient({
      fetchImpl: async () => {
        return new Response(stream, { status: 200 }) as Response
      }
    })

    const response = await client.post('/api/stream', {
      body: { query: 'test' }
    })

    expect(response.error).toBe(false)
    if (!response.error && response.response) {
      let errorCaught = false
      try {
        await processStream(response.response, {
          onError: () => {
            errorCaught = true
          }
        })
      } catch {
        // Expected
      }
      expect(errorCaught).toBe(true)
    }
  })
})

describe('Streaming with iterateStream', () => {
  test('should iterate over streaming response', async () => {
    const encoder = new TextEncoder()
    const chunks = ['chunk1', 'chunk2', 'chunk3']

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        for (const chunk of chunks) {
          // Use JSON format for proper parsing
          controller.enqueue(encoder.encode(`data: "${chunk}"\n\n`))
        }
        controller.close()
      }
    })

    const client = createFetchClient({
      fetchImpl: async () => {
        return new Response(stream, { status: 200 }) as Response
      }
    })

    const response = await client.post('/api/stream')
    expect(response.error).toBe(false)

    if (!response.error && response.response) {
      const results: string[] = []
      for await (const event of iterateStream<string>(response.response)) {
        if (event.data) {
          results.push(event.data)
        }
      }

      expect(results).toEqual(chunks)
    }
  })
})

describe('Integration test pattern', () => {
  test('should demonstrate recommended streaming pattern', async () => {
    // This is the recommended pattern for streaming:
    // 1. Use client.post() to get a Response
    // 2. Pass the response to processStream() or iterateStream()

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode('data: {"text":"hello"}\n\n'))
        controller.enqueue(encoder.encode('data: {"text":"world"}\n\n'))
        controller.close()
      }
    })

    const client = createFetchClient({
      fetchImpl: async () => {
        return new Response(stream, { status: 200 }) as Response
      }
    })

    // Step 1: Make request
    const result = await client.post('/api/chat', {
      body: { message: 'hello' }
    })

    // Step 2: Process stream
    expect(result.error).toBe(false)
    if (!result.error && result.response) {
      const messages: any[] = []
      await processStream(result.response, {
        onData: (chunk) => {
          messages.push(chunk)
        },
        onComplete: () => {
          expect(messages.length).toBeGreaterThan(0)
        }
      })

      expect(messages.length).toBe(2)
      expect(messages[0].text).toBe('hello')
      expect(messages[1].text).toBe('world')
    }
  })
})

describe('Real API integration (TODO)', () => {
  test.todo('should stream from real AI API', async () => {
    // Recommended pattern for real API:
    const client = createFetchClient({
      requestInterceptor: async (request) => {
        // Add base URL
        request.url = 'https://api.example.com' + request.url
        // Add auth headers
        request.init.headers['Authorization'] = 'Bearer token'
        return request
      }
    })

    const result = await client.post('/api/chat', {
      body: {
        stream: true,
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }]
      }
    })

    if (!result.error && result.response) {
      await processStream(result.response, {
        onData: (chunk) => {
          console.log('Received:', chunk)
        }
      })
    }
  })
})

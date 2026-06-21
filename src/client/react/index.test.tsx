/**
 * React hooks tests
 */

import { describe, test, expect } from 'bun:test'
import type { MessageStatus, MessageInfo, StreamMessage, UseStreamChatOptions } from './index'

describe('React hooks - type definitions', () => {
  test('should have correct MessageStatus type', () => {
    const status: MessageStatus = 'idle'
    expect(status).toBe('idle')
  })

  test('should have correct MessageInfo type', () => {
    const message: MessageInfo<string> = {
      id: 1,
      status: 'success',
      data: 'test'
    }
    expect(message.data).toBe('test')
  })

  test('should have correct StreamMessage type', () => {
    const message: StreamMessage<string> = {
      chunk: 'test',
      chunks: ['test'],
      status: 'loading'
    }
    expect(message.chunk).toBe('test')
  })

  test('should have correct UseStreamChatOptions type', () => {
    const options: UseStreamChatOptions<any, any, any> = {
      service: async (params, signal) => {
        return new Response()
      },
      localTransform: (params) => ({ content: params }),
      streamTransform: ({ chunks }) => ({ content: chunks.join('') }),
      onComplete: (data) => {},
      onError: (error) => {}
    }

    expect(options.service).toBeInstanceOf(Function)
  })
})

describe('React hooks - integration (TODO)', () => {
  test.todo('useStreamChat should work with real streaming API', async () => {
    // This test requires React testing environment
    // Example with renderHook:
    //
    // import { renderHook, waitFor, act } from '@testing-library/react'
    //
    // const { result } = renderHook(() =>
    //   useStreamChat({
    //     service: async (params, signal) => {
    //       return await fetch('https://api.example.com/chat', {
    //         method: 'POST',
    //         headers: { 'Content-Type': 'application/json' },
    //         signal,
    //         body: JSON.stringify(params)
    //       })
    //     },
    //     localTransform: (params) => ({ role: 'user', content: params.message }),
    //     streamTransform: ({ chunks }) => ({
    //       role: 'assistant',
    //       content: chunks.map((c: any) => c.text || c).join('')
    //     })
    //   })
    // )
    //
    // await act(async () => {
    //   await result.current.send({ message: 'Hello' })
    // })
    //
    // await waitFor(() => {
    //   expect(result.current.isLoading).toBe(false)
    // })
    //
    // expect(result.current.messages.length).toBeGreaterThan(0)
  })

  test.todo('useStream should process streaming response', async () => {
    // This test requires React testing environment
  })
})

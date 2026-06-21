/**
 * React hook for streaming chat functionality
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { StreamCallbacks } from '../stream'
import { iterateStream, processStream } from '../stream'

export type MessageStatus = 'idle' | 'local' | 'loading' | 'updating' | 'success' | 'error' | 'aborted'

export type MessageInfo<TData> = {
  id: string | number
  status: MessageStatus
  data: TData
  chunks?: unknown[]
  error?: Error
  extraInfo?: Record<string, any>
}

export type StreamMessage<TChunk, TCurrent = TChunk> = {
  chunk: TChunk
  chunks: TChunk[]
  status: MessageStatus
  responseHeaders?: Headers
  originMessage?: TCurrent
}

export type UseStreamChatOptions<TQuery, TMessage, TChunk = unknown, TTransformed = TMessage> = {
  /**
   * Service function that makes the request and returns a Promise<Response>
   */
  service: (params: TQuery, signal: AbortSignal) => Promise<Response>

  /**
   * Transform local request params to initial message data
   */
  localTransform?: (params: TQuery) => TMessage

  /**
   * Transform stream chunk to message data
   */
  streamTransform?: (message: StreamMessage<TChunk, TMessage | TTransformed>) => TTransformed | undefined

  /**
   * Callback when stream completes
   */
  onComplete?: (finalData: TTransformed | TMessage) => void

  /**
   * Callback when stream errors
   */
  onError?: (error: Error) => void

  /**
   * Dependencies that trigger defaultMessages reload when changed
   */
  refreshDeps?: any[]

  /**
   * Default messages to load on mount (can be async)
   */
  defaultMessages?: TMessage[] | (() => Promise<TMessage[]>)

  /**
   * Callback when chat finishes
   */
  onFinishChat?: () => void
}

export type UseStreamChatReturn<TQuery, TMessage, TTransformed> = {
  messages: MessageInfo<TMessage | TTransformed>[]
  isLoading: boolean
  error: Error | null
  abort: () => void
  send: (params: TQuery) => Promise<void>
  clear: () => void
  setMessage: (id: string | number, message: Partial<Omit<MessageInfo<TMessage | TTransformed>, 'id'>>) => void
  refresh: () => Promise<void>
  isDefaultMessagesLoading: boolean
}

/**
 * React hook for streaming chat/AI responses
 *
 * @example
 * ```ts
 * import { createFetchClient } from '@doremijs/o2t/client'
 *
 * const { messages, isLoading, send, abort, setMessage, refresh } = useStreamChat({
 *   service: async (params, signal) => {
 *     return await fetch('/api/chat', {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify(params),
 *       signal
 *     })
 *   },
 *   localTransform: (params) => ({ role: 'user', content: params.message }),
 *   streamTransform: ({ chunks, responseHeaders }) => ({
 *     role: 'assistant',
 *     content: chunks.map((c: any) => c.text || c).join('')
 *   }),
 *   refreshDeps: [sessionId],
 *   defaultMessages: async () => loadHistory()
 * })
 * ```
 */
export function useStreamChat<TQuery = any, TMessage = any, TChunk = unknown, TTransformed = TMessage>(
  options: UseStreamChatOptions<TQuery, TMessage, TChunk, TTransformed>
): UseStreamChatReturn<TQuery, TMessage, TTransformed> {
  const abortControllerRef = useRef<AbortController | null>(null)
  const lastParamsRef = useRef<TQuery | null>(null)
  const [messages, setMessages] = useState<MessageInfo<TMessage | TTransformed>[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isDefaultMessagesLoading, setIsDefaultMessagesLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Load default messages on mount or when refreshDeps change
  const loadDefaultMessages = useCallback(async () => {
    if (!options.defaultMessages) return

    setIsDefaultMessagesLoading(true)
    try {
      const msgs = typeof options.defaultMessages === 'function'
        ? await (options.defaultMessages as () => Promise<TMessage[]>)()
        : options.defaultMessages

      setMessages(msgs.map((data, index) => ({
        id: `default-${index}`,
        status: 'success' as const,
        data
      })))
    } catch (err) {
      console.error('Failed to load default messages:', err)
    } finally {
      setIsDefaultMessagesLoading(false)
    }
  }, [options.defaultMessages])

  // Load default messages on mount
  useEffect(() => {
    loadDefaultMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reload when refreshDeps change
  useEffect(() => {
    if (options.refreshDeps && options.refreshDeps.length > 0) {
      loadDefaultMessages()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...(options.refreshDeps || [])])

  const abort = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setIsLoading(false)
    setMessages((prev) =>
      prev.map((msg) =>
        msg.status === 'loading' || msg.status === 'updating'
          ? { ...msg, status: 'aborted' as const }
          : msg
      )
    )
  }, [])

  const clear = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  const setMessage = useCallback((
    id: string | number,
    message: Partial<Omit<MessageInfo<TMessage | TTransformed>, 'id'>>
  ) => {
    setMessages((prev) => {
      const foundIndex = prev.findIndex((i) => i.id === id)
      if (foundIndex !== -1) {
        const newMessages = [...prev]
        newMessages[foundIndex] = { ...newMessages[foundIndex], ...message }
        return newMessages
      }
      return prev
    })
  }, [])

  const send = useCallback(async (params: TQuery) => {
    abortControllerRef.current = new AbortController()
    lastParamsRef.current = params
    setIsLoading(true)
    setError(null)

    // Add local message
    const localId = `local-${Date.now()}`
    const localMessage: MessageInfo<TMessage> = {
      id: localId,
      status: 'local',
      data: options.localTransform?.(params) ?? ({} as TMessage)
    }
    setMessages((prev) => [...prev, localMessage])

    // Add response message placeholder
    const responseId = `response-${Date.now()}`
    const responseMessage: MessageInfo<TMessage | TTransformed> = {
      id: responseId,
      status: 'loading',
      data: {} as TMessage,
      chunks: []
    }
    setMessages((prev) => [...prev, responseMessage])

    try {
      const response = await options.service(params, abortControllerRef.current.signal)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const chunks: TChunk[] = []
      let finalData: TMessage | TTransformed = responseMessage.data
      let originMessage: TMessage | TTransformed | undefined

      for await (const event of iterateStream<TChunk>(response)) {
        if (event.data === null) {
          continue
        }

        chunks.push(event.data)

        const streamMessage: StreamMessage<TChunk, TMessage | TTransformed> = {
          chunk: event.data,
          chunks: [...chunks],
          status: 'updating',
          responseHeaders: response.headers,
          originMessage
        }

        const transformed = options.streamTransform?.(streamMessage)
        if (transformed !== undefined) {
          originMessage = transformed
          finalData = transformed
        }

        setMessage(responseId, {
          status: 'updating',
          data: finalData,
          chunks: [...chunks]
        })
      }

      setMessage(responseId, {
        status: 'success',
        data: finalData,
        chunks: [...chunks]
      })

      options.onComplete?.(finalData)
      options.onFinishChat?.()
    } catch (err) {
      const error = err as Error
      if (error.name === 'AbortError') {
        setMessage(responseId, { status: 'aborted' })
      } else {
        setError(error)
        setMessage(responseId, { status: 'error', error })
        options.onError?.(error)
      }
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }, [options, setMessage])

  const refresh = useCallback(async () => {
    if (lastParamsRef.current === null) {
      throw new Error('Cannot refresh: no previous request')
    }
    await send(lastParamsRef.current)
  }, [send])

  return {
    messages,
    isLoading,
    error,
    abort,
    send,
    clear,
    setMessage,
    refresh,
    isDefaultMessagesLoading
  }
}

/**
 * Simpler hook for basic streaming without message management
 */
export function useStream<TData = any>() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const start = useCallback(
    async (
      fetcher: (signal: AbortSignal) => Promise<Response>,
      callbacks: StreamCallbacks<TData, TData>
    ) => {
      abortControllerRef.current = new AbortController()
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetcher(abortControllerRef.current.signal)
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        await processStream<TData>(response, {
          onData: (data, chunks) => {
            if (data !== null) {
              callbacks.onData?.(data, chunks.filter((item): item is TData => item !== null))
            }
          },
          onComplete: callbacks.onComplete,
          onError: callbacks.onError
        })
      } catch (err) {
        const error = err as Error
        if (error.name !== 'AbortError') {
          setError(error)
          callbacks.onError?.(error)
        }
      } finally {
        setIsLoading(false)
        abortControllerRef.current = null
      }
    },
    []
  )

  const abort = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setIsLoading(false)
  }, [])

  return {
    start,
    abort,
    isLoading,
    error
  }
}

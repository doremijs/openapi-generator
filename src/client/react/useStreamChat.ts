/**
 * React hook for streaming chat/AI responses with SSE
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SSEEventWithJSON } from '../stream'
import { iterateStream } from '../stream'

// ── Types ──

export type MessageStatus = 'idle' | 'local' | 'pending' | 'streaming' | 'success' | 'error' | 'aborted'

export type MessageInfo<TData> = {
  id: string | number
  status: MessageStatus
  data: TData
  chunks?: unknown[]
  error?: Error
  extraInfo?: Record<string, any>
}

export type StreamMessage<TChunk, TMessage = any, TTransformed = any> = {
  /** The latest data chunk */
  chunk: TChunk
  /** All chunks received so far */
  chunks: TChunk[]
  /** Current message status */
  status: Extract<MessageStatus, 'pending' | 'streaming'>
  /** Response headers from the fetch */
  responseHeaders?: Headers
  /** The previous message data (before current chunk) */
  previousMessage?: TMessage | TTransformed
}

export type UseStreamChatOptions<TQuery, TMessage, TChunk = unknown, TTransformed = TMessage> = {
  /**
   * Service function that makes the request and returns a Promise<Response>.
   * The signal is provided for aborting the request.
   */
  service: (params: TQuery, signal: AbortSignal) => Promise<Response>

  /**
   * Transform request params into the user's message data
   * (shown immediately when the message is sent).
   */
  localTransform?: (params: TQuery) => TMessage

  /**
   * Transform a stream chunk into the AI response message data.
   * Return `undefined` to skip updating the message for this chunk.
   * Return a value to update the message with the transformed data.
   */
  streamTransform?: (message: StreamMessage<TChunk, TMessage | TTransformed>) => TTransformed | undefined

  /**
   * Called when the stream receives its first data chunk
   */
  onStreamStart?: () => void

  /**
   * Called when the stream completes successfully with the final data.
   * `finalData` is the last value returned by `streamTransform`.
   */
  onComplete?: (finalData: TTransformed | TMessage) => void

  /**
   * Called when a stream error occurs
   */
  onError?: (error: Error) => void

  /**
   * Dependencies that trigger defaultMessages reload when changed.
   * Pass an empty array to disable auto-reload.
   */
  refreshDeps?: any[]

  /**
   * Default/initial messages to load on mount or when refreshDeps change.
   * Can be a static array or an async function.
   */
  defaultMessages?: TMessage[] | (() => Promise<TMessage[]>)

  /**
   * Called when the entire chat flow (send + stream) finishes,
   * regardless of success or error.
   */
  onFinishChat?: () => void
}

export type UseStreamChatReturn<TQuery, TMessage, TTransformed> = {
  /** All messages (user + AI responses) */
  messages: MessageInfo<TMessage | TTransformed>[]
  /** True while a request is in flight (including streaming) */
  isLoading: boolean
  /** True while the stream is actively receiving data */
  isStreaming: boolean
  /** Last error, if any */
  error: Error | null
  /** Abort the current stream */
  abort: () => void
  /** Send a new message */
  send: (params: TQuery) => Promise<void>
  /** Clear all messages */
  clear: () => void
  /** Update a specific message by id */
  setMessage: (id: string | number, patch: Partial<Omit<MessageInfo<TMessage | TTransformed>, 'id'>>) => void
  /** Re-send the last request with the same params */
  refresh: () => Promise<void>
  /** True while default messages are loading */
  isDefaultMessagesLoading: boolean
}

// ── Hook ──

/**
 * React hook for streaming chat/AI responses via SSE.
 *
 * Designed for LLM chat interfaces:
 * - Manages messages array (user + assistant)
 * - Handles streaming response with incremental updates
 * - Supports abort, refresh, history loading
 *
 * @example
 * ```tsx
 * import { useStreamChat } from '@doremijs/o2t/client/react'
 *
 * const { messages, isLoading, send, abort } = useStreamChat({
 *   service: async (params, signal) => {
 *     const res = await fetch('/api/chat', {
 *       method: 'POST',
 *       body: JSON.stringify(params),
 *       signal
 *     })
 *     return res
 *   },
 *   localTransform: (params) => ({
 *     role: 'user', content: params.message
 *   }),
 *   streamTransform: ({ chunks }) => ({
 *     role: 'assistant',
 *     content: chunks.join('')
 *   })
 * })
 * ```
 */
export function useStreamChat<TQuery = any, TMessage = any, TChunk = unknown, TTransformed = TMessage>(
  options: UseStreamChatOptions<TQuery, TMessage, TChunk, TTransformed>
): UseStreamChatReturn<TQuery, TMessage, TTransformed> {
  const abortControllerRef = useRef<AbortController | null>(null)
  const lastParamsRef = useRef<TQuery | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const [messages, setMessages] = useState<MessageInfo<TMessage | TTransformed>[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isDefaultMessagesLoading, setIsDefaultMessagesLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // ── Default messages loading ──

  const loadDefaultMessages = useCallback(async () => {
    const { defaultMessages } = optionsRef.current
    if (!defaultMessages) return

    setIsDefaultMessagesLoading(true)
    try {
      const msgs = typeof defaultMessages === 'function'
        ? await (defaultMessages as () => Promise<TMessage[]>)()
        : defaultMessages

      if (Array.isArray(msgs)) {
        setMessages(msgs.map((data, index) => ({
          id: `default-${index}`,
          status: 'success' as const,
          data
        })))
      }
    } catch (err) {
      console.error('Failed to load default messages:', err)
    } finally {
      setIsDefaultMessagesLoading(false)
    }
  }, [])

  // Load default messages on mount
  useEffect(() => {
    loadDefaultMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reload when refreshDeps change
  useEffect(() => {
    const deps = options.refreshDeps
    if (deps && deps.length > 0) {
      loadDefaultMessages()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.refreshDeps])

  // ── Abort ──

  const abort = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setIsLoading(false)
    setIsStreaming(false)
    setMessages((prev) =>
      prev.map((msg) =>
        msg.status === 'pending' || msg.status === 'streaming'
          ? { ...msg, status: 'aborted' as const }
          : msg
      )
    )
  }, [])

  // ── Clear ──

  const clear = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  // ── Set Message ──

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

  // ── Send ──

  const send = useCallback(async (params: TQuery) => {
    const { localTransform, streamTransform, onStreamStart, onComplete, onError, onFinishChat } = optionsRef.current

    abortControllerRef.current = new AbortController()
    lastParamsRef.current = params
    setIsLoading(true)
    setIsStreaming(false)
    setError(null)

    // Add local (user) message
    const localId = `local-${Date.now()}`
    const localMessage: MessageInfo<TMessage> = {
      id: localId,
      status: 'local',
      data: localTransform?.(params) ?? ({} as TMessage)
    }
    setMessages((prev) => [...prev, localMessage])

    // Add response message placeholder
    const responseId = `response-${Date.now()}`
    const responseMessage: MessageInfo<TMessage | TTransformed> = {
      id: responseId,
      status: 'pending',
      data: {} as TMessage,
      chunks: []
    }
    setMessages((prev) => [...prev, responseMessage])

    try {
      const response = await optionsRef.current.service(params, abortControllerRef.current.signal)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`)
      }

      if (!response.body) {
        throw new Error('Response body is null — the server did not return a stream')
      }

      const chunks: TChunk[] = []
      let finalData: TMessage | TTransformed = responseMessage.data
      let chunksCount = 0

      for await (const event of iterateStream<TChunk>(response)) {
        // Skip null data (non-JSON events like [DONE] are already handled by stream.ts)
        if (event.data === null || event.data === undefined) {
          continue
        }

        chunks.push(event.data)
        chunksCount++

        // First chunk? Mark as streaming
        if (chunksCount === 1) {
          setIsStreaming(true)
          setMessage(responseId, { status: 'streaming' })
          onStreamStart?.()
        }

        const streamMessage: StreamMessage<TChunk, TMessage | TTransformed> = {
          chunk: event.data,
          chunks: [...chunks],
          status: 'streaming',
          responseHeaders: response.headers,
          previousMessage: chunksCount === 1 ? undefined : finalData
        }

        const transformed = streamTransform?.(streamMessage)
        if (transformed !== undefined) {
          finalData = transformed
        }

        setMessage(responseId, {
          status: 'streaming',
          data: finalData,
          chunks: [...chunks]
        })
      }

      // Mark as success
      setIsStreaming(false)
      setMessage(responseId, {
        status: 'success',
        data: finalData,
        chunks: [...chunks]
      })

      onComplete?.(finalData)
      onFinishChat?.()
    } catch (err) {
      const error = err as Error
      setIsStreaming(false)

      if (error.name === 'AbortError') {
        setMessage(responseId, { status: 'aborted' })
      } else {
        setError(error)
        setMessage(responseId, { status: 'error', error })
        onError?.(error)
      }
      onFinishChat?.()
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }, [setMessage])

  // ── Refresh ──

  const refresh = useCallback(async () => {
    if (lastParamsRef.current === null) {
      throw new Error('Cannot refresh: no previous request. Call send() first.')
    }
    await send(lastParamsRef.current)
  }, [send])

  return {
    messages,
    isLoading,
    isStreaming,
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
 * Simpler hook for basic SSE streaming without chat message management.
 * Good for one-off streaming data consumption.
 *
 * @example
 * ```tsx
 * const { start, abort, isLoading } = useStream()
 * const handleClick = () => {
 *   start(async (signal) => {
 *     return fetch('/api/stream', { signal })
 *   }, {
 *     onData: (data) => console.log('Received:', data)
 *   })
 * }
 * ```
 */
export function useStream<TData = any>() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const start = useCallback(
    async (
      fetcher: (signal: AbortSignal) => Promise<Response>,
      callbacks: {
        onData?: (chunk: TData) => void
        onError?: (error: Error) => void
        onComplete?: () => void
      }
    ) => {
      abortControllerRef.current = new AbortController()
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetcher(abortControllerRef.current.signal)

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`)
        }

        if (!response.body) {
          throw new Error('Response body is null')
        }

        let chunksCount = 0
        for await (const event of iterateStream<TData>(response)) {
          if (event.data !== null && event.data !== undefined) {
            callbacks.onData?.(event.data as TData)
            chunksCount++
          }
        }
        callbacks.onComplete?.()
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

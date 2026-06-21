/**
 * useRequest hook - Request management with manual execution
 * Similar to ahooks useRequest but simplified
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export type UseRequestOptions<TData> = {
  /**
   * Manual execution - won't run automatically
   */
  manual?: boolean

  /**
   * Dependencies that trigger refresh when changed
   */
  refreshDeps?: any[]

  /**
   * onSuccess callback
   */
  onSuccess?: (data: TData) => void

  /**
   * onError callback
   */
  onError?: (error: Error) => void

  /**
   * onFinally callback
   */
  onFinally?: () => void
}

export type UseRequestReturn<TData, TParams extends any[]> = {
  loading: boolean
  error?: Error
  data?: TData
  run: (...args: TParams) => Promise<TData>
  runAsync: (...args: TParams) => Promise<TData>
  refresh: () => Promise<TData>
  mutate: (data: TData | ((oldData?: TData) => TData)) => void
}

/**
 * Request management hook
 *
 * @example
 * ```ts
 * const { data, loading, run, refresh } = useRequest(
 *   async (id: number) => {
 *     const response = await fetch(`/api/items/${id}`)
 *     return response.json()
 *   },
 *   {
 *     manual: true,
 *     onSuccess: (data) => console.log('Success:', data)
 *   }
 * )
 * ```
 */
export function useRequest<TData = any, TParams extends any[] = any[]>(
  service: (...args: TParams) => Promise<TData>,
  options: UseRequestOptions<TData> = {}
): UseRequestReturn<TData, TParams> {
  const { manual = false, refreshDeps = [], onSuccess, onError, onFinally } = options

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | undefined>()
  const [data, setData] = useState<TData | undefined>()

  // Track the last arguments for refresh
  const lastArgs = useRef<TParams | null>(null)
  const serviceRef = useRef(service)
  const onSuccessRef = useRef(onSuccess)
  const onErrorRef = useRef(onError)
  const onFinallyRef = useRef(onFinally)

  serviceRef.current = service
  onSuccessRef.current = onSuccess
  onErrorRef.current = onError
  onFinallyRef.current = onFinally

  const execute = useCallback(
    async (...args: TParams) => {
      lastArgs.current = args
      setLoading(true)
      setError(undefined)

      try {
        const result = await serviceRef.current(...args)
        setData(result)
        onSuccessRef.current?.(result)
        return result
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        setError(error)
        onErrorRef.current?.(error)
        throw error
      } finally {
        setLoading(false)
        onFinallyRef.current?.()
      }
    },
    []
  )

  const run = useCallback(
    (...args: TParams): Promise<TData> => {
      return execute(...args)
    },
    [execute]
  )

  const runAsync = useCallback(
    (...args: TParams): Promise<TData> => {
      return execute(...args)
    },
    [execute]
  )

  const refresh = useCallback((): Promise<TData> => {
    if (lastArgs.current === null) {
      throw new Error('Cannot refresh: no previous request')
    }
    return execute(...lastArgs.current)
  }, [execute])

  const mutate = useCallback((newData: TData | ((oldData?: TData) => TData)) => {
    setData((oldData) => {
      return typeof newData === 'function' ? (newData as (oldData?: TData) => TData)(oldData) : newData
    })
  }, [])

  useEffect(() => {
    if (manual) {
      return
    }

    void execute(...(refreshDeps as TParams))
  }, [manual, execute, ...refreshDeps])

  return {
    loading,
    error,
    data,
    run,
    runAsync,
    refresh,
    mutate
  }
}

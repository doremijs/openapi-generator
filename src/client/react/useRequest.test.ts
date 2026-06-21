/**
 * useRequest hook tests
 */

import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { JSDOM } from 'jsdom'
import { useRequest } from './useRequest'

beforeAll(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver
  })
})

afterEach(() => {
  cleanup()
})

describe('useRequest', () => {
  test('auto-runs once on mount when manual is false', async () => {
    let calls = 0

    const { result } = renderHook(() =>
      useRequest(async () => {
        calls += 1
        return 'loaded'
      })
    )

    await waitFor(() => {
      expect(result.current.data).toBe('loaded')
    })

    expect(calls).toBe(1)
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeUndefined()
  })

  test('re-runs when refreshDeps change', async () => {
    const seen: number[] = []

    const { result, rerender } = renderHook(
      ({ id }) =>
        useRequest(async (value: number) => {
          seen.push(value)
          return { id: value }
        }, {
          refreshDeps: [id]
        }),
      {
        initialProps: { id: 1 }
      }
    )

    await waitFor(() => {
      expect(result.current.data).toEqual({ id: 1 })
    })

    await act(async () => {
      rerender({ id: 2 })
    })

    await waitFor(() => {
      expect(result.current.data).toEqual({ id: 2 })
    })

    expect(seen).toEqual([1, 2])
  })

  test('refresh reuses the last run arguments', async () => {
    const calls: number[] = []

    const { result } = renderHook(() =>
      useRequest(async (id: number) => {
        calls.push(id)
        return { id }
      }, {
        manual: true
      })
    )

    await act(async () => {
      await result.current.run(7)
    })
    await act(async () => {
      await result.current.refresh()
    })

    expect(calls).toEqual([7, 7])
    expect(result.current.data).toEqual({ id: 7 })
  })

  test('mutate supports direct and functional updates', async () => {
    const { result } = renderHook(() =>
      useRequest(async () => ({ count: 1 }), {
        manual: true
      })
    )

    await act(async () => {
      await result.current.run()
    })
    act(() => {
      result.current.mutate({ count: 2 })
    })
    expect(result.current.data).toEqual({ count: 2 })

    act(() => {
      result.current.mutate((previous) => ({ count: (previous?.count ?? 0) + 1 }))
    })
    expect(result.current.data).toEqual({ count: 3 })
  })
})

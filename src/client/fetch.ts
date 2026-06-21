import type { ExternalOptions, HasAnyRequiredOption, MergedOptions, PromiseOr, ResponseType } from './share'
export type RequestInterceptorParams = { url: string; init: CustomFetchInit }

export type CustomFetchInit = Omit<RequestInit, 'headers'> & {
  headers: Record<string, string>
}

export type CreateFetchClientConfig = {
  /**
   * fetch provider, default to globalThis.fetch
   * Can be any function compatible with the fetch API
   */
  fetchImpl?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  /**
   * custom query serializer, default to URLSearchParams.toString()
   */
  querySerializer?: (query: any) => string
  /**
   * request timeout in milliseconds, default to 0 (no timeout)
   */
  requestTimeoutMs?: number
  /**
   * request interceptor
   */
  requestInterceptor?: (request: RequestInterceptorParams) => PromiseOr<RequestInterceptorParams | null | undefined>
  /**
   * response interceptor
   */
  responseInterceptor?: (request: RequestInterceptorParams, response: Response) => PromiseOr<Response | null | undefined>
  /**
   * custom error handler, default to console.error
   */
  errorHandler?: (request: RequestInterceptorParams, response: Response | null, error: Error | null) => void
}

export function createFetchClient<
  OpenApis extends {
    [method: string]: {
      [path: string]: {
        query: any
        params: any
        body: any
        headers: any
        response: any
      }
    }
  }
>(config: CreateFetchClientConfig = {}) {
  const fetchImpl = config.fetchImpl || globalThis.fetch

  function createMethod<M extends keyof OpenApis>(method: M) {
    return async <P extends keyof OpenApis[M]>(
      path: P,
      ...args: HasAnyRequiredOption<OpenApis[M][P]> extends true
        ? [options: MergedOptions<OpenApis[M][P]> & ExternalOptions]
        : [options?: MergedOptions<OpenApis[M][P]> & ExternalOptions]
    ): Promise<ResponseType<OpenApis[M][P]['response'], Response>> => {
      let url = path as string
      const options = args[0] || {}

      // Handle path parameters
      if ('params' in options && options.params) {
        for (const [key, value] of Object.entries(options.params)) {
          const v = encodeURIComponent(String(value))
          url = url.replace(`{${key}}`, v).replace(`:${key}`, v)
        }
      }

      // Handle query parameters
      if ('query' in options && options.query) {
        const queryString =
          config?.querySerializer?.(options.query) ||
          new URLSearchParams(options.query as Record<string, string>).toString()
        url += `?${queryString}`
      }

      // body
      let contentType: string | undefined
      let bodyData: string | FormData | undefined
      if ('body' in options) {
        if (!(options.body instanceof FormData)) {
          bodyData = JSON.stringify(options.body)
          contentType = 'application/json'
        } else {
          bodyData = options.body
        }
      }

      let fetchInit: CustomFetchInit = {
        method: method as string,
        headers: contentType ? { 'Content-Type': contentType } : {},
        body: bodyData,
        signal: 'signal' in options ? options.signal as AbortSignal : undefined,
        ...(typeof window !== 'undefined' ? ({ credentials: 'include', mode: 'cors' } as Partial<CustomFetchInit>) : {})
      }

      // headers
      if ('headers' in options && options.headers) {
        for (const [key, value] of Object.entries(options.headers)) {
          fetchInit.headers[key] = value
        }
      }

      // timeout
      let timeout: number | undefined
      const timeoutMs = (options as ExternalOptions).timeoutMs ?? config.requestTimeoutMs
      if (!(options as ExternalOptions).signal && timeoutMs && timeoutMs > 0) {
        const controller = new AbortController()
        // @ts-ignore
        timeout = setTimeout(() => controller.abort(), timeoutMs)
        fetchInit.signal = controller.signal
      }
      const requestParams: RequestInterceptorParams = { url, init: fetchInit }
      if (config.requestInterceptor) {
        const changedRequest = await config.requestInterceptor(requestParams)
        if (changedRequest) {
          // merge request
          url = changedRequest.url
          fetchInit = changedRequest.init
        }
      }
      try {
        let response = await fetchImpl(url, fetchInit)
        if (config.responseInterceptor) {
          const changedResponse = await config.responseInterceptor(requestParams, response)
          if (changedResponse) {
            response = changedResponse
          }
        }
        if (!response.ok) {
          config.errorHandler?.(requestParams, response, null)
          return { error: true, response, data: null }
        }
        const contentType = response.headers.get('content-type')
        if (contentType?.includes('application/json')) {
          return { error: false, data: await response.json(), response }
        }
        if (contentType?.includes('text/plain')) {
          return { error: false, data: await response.text(), response }
        }
        return { error: false, data: response, response }
      } catch (error) {
        (config.errorHandler || console.error)(requestParams, null, error as Error)
        return { error: true, data: null }
      } finally {
        if (timeout) {
          clearTimeout(timeout)
        }
      }
    }
  }

  return {
    get: createMethod('get'),
    post: createMethod('post'),
    put: createMethod('put'),
    delete: createMethod('delete'),
    patch: createMethod('patch')
  }
}

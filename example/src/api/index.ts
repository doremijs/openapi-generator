import { createFetchClient } from '@doremijs/o2t/client'
import type { OpenAPIs } from './schema'

export const client = createFetchClient<OpenAPIs>({
  requestTimeoutMs: 10000,
  requestInterceptor(request) {
    request.url = '/api' + request.url
    return request
  },
  async errorHandler(request, response, error) {
    console.error(request, response, error)
  }
})

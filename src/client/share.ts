export type PromiseOr<T> = T | Promise<T>

export type CommonHeaders = Record<string, any>

export type HasRequiredFields<T> = keyof T extends never // Check if the type has no keys (empty object case)
  ? false
  : { [K in keyof T]-?: {} extends Pick<T, K> ? false : true }[keyof T] extends false
    ? false
    : true

export type ApiOptions<Query = any, Params = any, Body = any, Headers = CommonHeaders> = {
  query?: Query
  params?: Params
  body?: Body
  headers?: Headers
}

export type OptionsType<T extends ApiOptions> = {
  query: T['query'] extends never ? never : T['query']
  params: T['params'] extends never ? never : T['params']
  body: T['body'] extends never ? never : T['body']
  headers: T['headers'] extends never ? never : T['headers']
}

export type RequiredOptions<T extends ApiOptions> = {
  [K in keyof OptionsType<T> as HasRequiredFields<NonNullable<OptionsType<T>[K]>> extends true
    ? K
    : never]: NonNullable<OptionsType<T>[K]>
}

export type OptionalOptions<T extends ApiOptions> = {
  [K in keyof OptionsType<T> as HasRequiredFields<NonNullable<OptionsType<T>[K]>> extends false
    ? K
    : never]?: OptionsType<T>[K]
}

export type MergedOptions<T extends ApiOptions> = RequiredOptions<T> & Partial<OptionalOptions<T>>

export type HasAnyRequiredOption<T extends ApiOptions> = [keyof RequiredOptions<T>] extends [never] ? false : true

export type ExternalOptions = { signal?: AbortSignal; timeoutMs?: number }

export type ResponseType<T, RawResponse> =
  | { error: true; response?: RawResponse; data: null }
  | { error: false; data: T; response?: RawResponse }

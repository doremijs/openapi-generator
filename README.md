# OpenAPI generator

This package generates easy-to-use and type-safe frontend API clients from OpenAPI specifications.

**Features:**
- **TypeScript schema generator** — generates full TypeScript types from OpenAPI 3 / Swagger 2 specs
- **Fetch client** — type-safe fetch-based HTTP client with interceptors
- **SSE streaming** — first-class Server-Sent Events support for AI/streaming APIs
- **React hooks** — `useStreamChat` for AI chat, `useRequest` for data fetching
- **Miniapp client** — WeChat miniapp client (`wx.request`)

## Installation

```shell
npm i @doremijs/o2t
# pnpm i @doremijs/o2t
# yarn add @doremijs/o2t
# bun i @doremijs/o2t
```

## Usage — Code Generation

1. Run `npx o2t init` to create a `o2t.config.mjs` configuration file, or create it manually:

```javascript
import { defineConfig } from '@doremijs/o2t'
export default defineConfig({
  specUrl: 'https://petstore.swagger.io/v2/swagger.json'
})
```

2. Run the generator:

```shell
npx o2t generate typescript
```

3. The generated code will be in the `src/api` directory.

4. Create `src/api/index.ts` and set up the client:

```typescript
import { createFetchClient } from '@doremijs/o2t/client'
import type { OpenAPIs } from './schema'

export const client = createFetchClient<OpenAPIs>({
  requestInterceptor(request) {
    const token = localStorage.getItem('access_token')
    if (!request.url.startsWith('/api/auth') && token) {
      request.init.headers.Authorization = `Bearer ${token}`
    }
    return request
  },
  responseInterceptor(request, response) {
    return response
  },
  errorHandler(request, response, error) {
    console.error(request, response, error)
  }
})
```

If you get an import error, set `compilerOptions.moduleResolution` to `bundler` and `compilerOptions.module` to `ESNext` in your `tsconfig.json`.

5. Make type-safe requests:

```typescript
const result = await client.get('/pet/{petId}', {
  params: { petId: 1 },
  query: { status: 'available' }
})
if (!result.error) {
  console.log(result.data)  // Fully typed!
}
```

## SSE Streaming

The package includes a production-grade SSE (Server-Sent Events) streaming engine, designed for AI chat APIs and real-time data.

### Quick Start

```typescript
import { createFetchClient } from '@doremijs/o2t/client'
import { processStream } from '@doremijs/o2t/client/stream'

const client = createFetchClient()

// 1. Make a request (streaming endpoint)
const result = await client.post('/api/chat', {
  body: { stream: true, model: 'gpt-4', messages: [...] }
})

// 2. Process the SSE stream
if (!result.error && result.response) {
  await processStream(result.response, {
    onData: (chunk) => console.log('Received:', chunk),
    onComplete: () => console.log('Stream complete')
  })
}
```

### Three Consumption Styles

| API | Style | When to use |
|---|---|---|
| `processStream(response, callbacks)` | Callback | Simplest — just need `onData`/`onError`/`onComplete` |
| `iterateStream(response)` | Async iterator | Need fine-grained control with `for await...of` |
| `accumulateStream(response)` | Collect all | Short streams where you want all results at once |

### Streaming with React

```typescript
import { useStreamChat } from '@doremijs/o2t/client/react'

function Chat() {
  const { messages, isLoading, send, abort } = useStreamChat({
    service: async (params, signal) => {
      const res = await fetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify(params),
        signal
      })
      return res
    },
    localTransform: (params) => ({
      role: 'user',
      content: params.message
    }),
    streamTransform: ({ chunks }) => ({
      role: 'assistant',
      content: chunks.map(c => c?.choices?.[0]?.delta?.content || '').join('')
    })
  })

  return (
    <div>
      {messages.map(msg => <div key={msg.id}>{msg.data.content}</div>)}
      <button onClick={() => send({ message: 'Hello' })}>Send</button>
      {isLoading && <button onClick={abort}>Stop</button>}
    </div>
  )
}
```

### Configuration Options

The stream engine handles all common SSE variants out of the box, but you can customize:

```typescript
// Skip non-JSON events (like [DONE] markers silently)
for await (const event of iterateStream(response, {
  nonJSONBehavior: 'skip',
})) { }

// Custom termination markers
await processStream(response, callbacks, {
  terminationMarkers: ['[END]', '[DONE]']
})

// Disable termination detection
const chunks = await accumulateStream(response, {
  terminationMarkers: false
})
```

### SSE Compatibility

The parser is fully compliant with the [W3C SSE specification](https://html.spec.whatwg.org/multipage/server-sent-events.html) and tested against:

- ✅ Standard SSE (`data: ...\n\n`)
- ✅ CRLF line endings (`\r\n\r\n`)
- ✅ Multiple `data:` lines per event
- ✅ `event:` / `id:` / `retry:` fields
- ✅ Comment lines (`: ...`)
- ✅ UTF-8 BOM
- ✅ OpenAI `[DONE]` termination marker
- ✅ Non-JSON data handling
- ✅ Error events (`event: error`)
- ✅ Cross-chunk boundaries (streaming split across multiple reads)

## Configuration

The `defineConfig` function accepts:

| Option | Type | Default | Description |
|---|---|---|---|
| `specUrl` | `string` | — | OpenAPI specification URL |
| `isVersion2` | `boolean` | auto | Force Swagger 2.0 mode |
| `outputDir` | `string` | `"src/api"` | Output directory for generated code |
| `tempFilePath` | `string` | `"node_modules/.o2t/openapi.json"` | Temporary file for downloaded spec |
| `preferUnknownType` | `'any' \| 'unknown'` | `"any"` | Type for unknown schemas |
| `customHeaders` | `Record<string, string>` | — | Custom headers for spec download |
| `basicAuth` | `{ username, password }` | — | Basic auth credentials |

## Development

```shell
bun install
```

Create `o2t.config.mjs`:

```javascript
import { defineConfig } from './src'
export default defineConfig({
  specUrl: 'https://generator.swagger.io/api/swagger.json'
})
```

Run in development mode:

```shell
bun dev generate typescript
```

### Testing

```shell
bun test                          # All tests
bun test:stream                   # SSE stream tests
bun test:fetch                    # Fetch client tests
bun test:react                    # React hooks tests
bun test:petstore                 # PetStore integration tests
```

### Example App

An example React + Vite app is available in the `example/` directory:

```shell
cd example
bun install
bun dev
```

Includes:
- AI chat with streaming responses (ChatPage)
- PetStore API demo (PetStorePage)
- Full type-safe integration

## CI/CD Publishing

This repository includes a GitHub Actions workflow at `.github/workflows/npm-publish.yml`.

It will publish the package to npm when all of the following are true:

- code is pushed to the `main` branch
- `package.json` or `.github/workflows/npm-publish.yml` changed in that push
- the `version` field in `package.json` is different from the version currently published on npm
- CI tests and build pass

The workflow uses npm trusted publishing with OIDC and runs:

```shell
npm publish --provenance --access public
```

To keep release publishing deterministic, CI uses the local test suite from `npm run test:ci`. The live PetStore integration tests remain available through `npm run test:petstore`.

### One-time npm setup

GitHub Actions trusted publishing also requires one manual setup step on npm:

1. Open the package page on npm
2. Go to `Settings` -> `Trusted Publisher`
3. Choose `GitHub Actions`
4. Configure:
   - owner: `doremijs`
   - repository: `openapi-generator`
   - workflow file: `npm-publish.yml`
   - branch: `main`

After that, as long as the version in `package.json` is newer than the version currently published on npm, pushes to `main` that touch `package.json` or the workflow file can trigger an authenticated publish without storing an npm access token in GitHub secrets.

## License

LGPL-3.0-or-later

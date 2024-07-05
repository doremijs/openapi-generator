# TypeScript API client generator

This package contains the TypeScript API client generator.

## Usage

1. Install the package:

```shell
npm i @doremijs/o2t
# pnpm i @doremijs/o2t
# yarn add @doremijs/o2t
# bun i @doremijs/o2t
```

2. Run command `npx o2t init` to create a `o2t.config.mjs` configuration file, or you can create the configuration file `o2t.config.mjs` in the root of your project by yourself. The configuration file should look like this:

```javascript
import { defineConfig } from '@doremijs/o2t'
export default defineConfig({
  specUrl: 'https://petstore.swagger.io/v2/swagger.json',
})
```

3. Run the generator:

```shell
npx o2t
```

4. The generated code will be in the `src/api` directory.

5. Create a ts file `src/api/index.ts`, and import the generated API client:

```typescript
import { createFetchClient } from '@doremijs/o2t/client'
import type { OpenAPIs } from './schema'

export const client = createFetchClient<OpenAPIs>({
  // ... other options
  // requestInterceptor and responseInterceptor are optional
  requestInterceptor(request) {
    return {
      ...request,
      headers: {
        ...request.headers ?? {},
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`
      }
    }
  },
  responseInterceptor(request, response) {
    // Handle response here
    return response
  }
})
```

6. Use the API client to make requests:

```typescript
const result = await client.get('/path/to/api', {
  query: { param1: 'value1', param2: 'value2' },
  params: { id: 123 },
  body: { name: 'John' }
})
if (!result.error) {
  console.log(result.data)
} else {
  console.log(result.message)
}
```

## Configuration

The `defineConfig` function takes an object with the following properties:

specUrl: string
  isVersion2?: boolean
  outputDir?: string
  tempFilePath?: string
  customHeaders?: Record<string, string>
  basicAuth?: {
    username: string
    password: string
  }

- `specUrl`: The URL of the OpenAPI specification file.
- `isVersion2`: Whether the OpenAPI specification is swagger version 2, you may not need to set this property as the generator will automatically detect the version of the specification.
- `outputDir`: The directory where the generated code will be saved. (default: `src/api`)
- `tempFilePath`: The path of the temporary file used to store the downloaded OpenAPI specification file. (default: `node_modules/.o2t/openapi.json`)
- `customHeaders`: Custom headers to be added to fetch the OpenAPI specification file. For example, you may need to add a token or a cookie to access the file.
- `basicAuth`: Basic authentication information to be added to fetch the OpenAPI specification file. For example, you may need to access a private API that requires authentication.

## Development

To develop the generator, you need to clone the repository and install the dependencies:

```shell
bun install
```

Then, create a configuration file `o2t.config.js` in the `packages/typescript` folder:

```javascript
import { defineConfig } from './src'

export default defineConfig({
  specUrl: 'https://generator.swagger.io/api/swagger.json'
})
```

To run the generator in development mode:

```shell
bun --cwd packages/typescript dev
```

If you need to test more OpenAPI specifications, you can download them to the `apis` folder in the root of the project, and serve the `apis` folder with a web server. For example:

```shell
npx http-server apis
```

Or try my `hs` tool:

```shell
curl hs.erguotou.me/install | bash
chmod +x hs
mv hs /usr/local/bin/hs
hs -f apis -m index
```

Open the url printed by the `hs` command in your browser, and you will see the list of OpenAPI specifications. Copy the URL of the specification you want to test, and change the `specUrl` property in the `o2t.config.js` file.
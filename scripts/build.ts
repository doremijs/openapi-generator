import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { transform } from '@swc/core'
import dts from 'bun-plugin-dts'

// ── 1. Build main CLI entry (bundled) ──

await Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  format: 'esm',
  target: 'node',
  plugins: [dts()],
})
await Bun.write('dist/index.mjs', await Bun.file('dist/index.js').text())
const { code: indexMinified } = await transform(await Bun.file('./dist/index.mjs').text(), {
  sourceMaps: false,
  minify: true,
})
await Bun.write('dist/index.js', indexMinified)

// ── 2. Build client library (individual files, preserved structure) ──

// Generate .d.ts files via tsc
await Bun.$`npx tsc --project tsconfig.client.json`

// Compile each .ts file individually with SWC
async function* walkDir(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walkDir(fullPath)
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.d.ts')
    ) {
      // Skip test directories
      if (fullPath.includes('/tests/')) continue
      yield fullPath
    }
  }
}

const clientSrcDir = './src/client'
const clientDistDir = './dist/client'

for await (const file of walkDir(clientSrcDir)) {
  const rel = relative(clientSrcDir, file)
  const destMjs = join(clientDistDir, rel.replace(/\.ts$/, '.mjs'))
  const destJs = destMjs.replace('.mjs', '.js')

  await mkdir(dirname(destMjs), { recursive: true })

  const source = await readFile(file, 'utf-8')

  // Readable ESM (.mjs)
  const { code: esmCode } = await transform(source, {
    sourceMaps: false,
    module: { type: 'es6' },
    jsc: {
      target: 'es2021' as const,
      parser: { syntax: 'typescript' as const },
    },
  })
  await writeFile(destMjs, esmCode)

  // Minified ESM (.js)
  const { code: minified } = await transform(source, {
    sourceMaps: false,
    module: { type: 'es6' },
    jsc: {
      target: 'es2021' as const,
      parser: { syntax: 'typescript' as const },
      minify: { compress: true, mangle: true },
    },
  })
  await writeFile(destJs, minified)
}

import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { transform } from '@swc/core'
import dts from 'bun-plugin-dts'

// Clean dist so stale outputs (e.g. old .mjs) don't linger across format changes.
await rm('./dist', { recursive: true, force: true })

// ── 1. Build main CLI entry (bundled, ESM + CJS) ──
// Package is `"type": "module"`, so `.js` is ESM. CJS lives in `.cjs`.

await Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  format: 'esm',
  target: 'node',
  plugins: [dts()],
})
// dist/index.js is the readable bundled ESM. No minification — it's a CLI tool,
// minifying adds no value and hurts debuggability.
const indexEsm = await Bun.file('./dist/index.js').text()
// CJS (.cjs) — convert the bundled ESM output to CommonJS via SWC (readable).
const { code: indexCjs } = await transform(indexEsm, {
  sourceMaps: false,
  module: { type: 'commonjs' },
  jsc: {
    target: 'es2021',
    parser: { syntax: 'ecmascript' as const },
  },
})
await Bun.write('dist/index.cjs', indexCjs)

// ── 2. Build client library (per-file, ESM + CJS) ──

const clientSrcDir = './src/client'
const clientDistDir = './dist/client'

// Generate .d.ts files via tsc
await Bun.$`npx tsc --project tsconfig.client.json`

// Rewrite extensionless relative specifiers (`./fetch`, `../stream`, `./react`)
// to explicit `.js` / `.cjs` (and `/index.js` / `/index.cjs` for directories).
// Required for pure Node.js resolution, which does NOT append extensions for
// ESM, and whose CJS `require` would otherwise resolve `.js` (ESM content) and
// trip on the extensionless imports inside it. Bundlers append extensions
// themselves, but this keeps the output self-contained everywhere.
function rewriteRelativeSpecifiers(code: string, srcFile: string, ext: 'js' | 'cjs'): string {
  // Resolve against the stable SOURCE tree — sibling outputs may not be
  // written yet at rewrite time depending on walk order.
  const srcDir = dirname(srcFile)
  const resolveSpec = (spec: string): string | null => {
    if (!spec.startsWith('.')) return null // only relative specifiers
    if (/\.(js|mjs|cjs|json|wasm)$/.test(spec)) return null // already explicit
    const base = resolve(srcDir, spec)
    if (existsSync(`${base}.ts`)) return `${spec}.${ext}`
    if (existsSync(`${base}/index.ts`)) return `${spec}/index.${ext}`
    return null
  }
  if (ext === 'js') {
    // ESM: `from '...'` (covers `import ... from` and `export * from`) and bare `import '...'`
    return code.replace(/(from\s+|import\s+)(['"])(\.{1,2}\/[^'"]+?)\2/g, (m, pre, q, spec) => {
      const r = resolveSpec(spec)
      return r ? `${pre}${q}${r}${q}` : m
    })
  }
  // CJS: `require('...')`
  return code.replace(/(require\(\s*)(['"])(\.{1,2}\/[^'"]+?)\2/g, (m, pre, q, spec) => {
    const r = resolveSpec(spec)
    return r ? `${pre}${q}${r}${q}` : m
  })
}

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
      !entry.name.endsWith('.d.ts') &&
      !fullPath.includes('/tests/')
    ) {
      yield fullPath
    }
  }
}

for await (const file of walkDir(clientSrcDir)) {
  const rel = relative(clientSrcDir, file)
  // ESM → `.js` (package is `"type": "module"`), CJS → `.cjs`.
  const destEsm = join(clientDistDir, rel.replace(/\.ts$/, '.js'))
  const destCjs = join(clientDistDir, rel.replace(/\.ts$/, '.cjs'))

  await mkdir(dirname(destEsm), { recursive: true })

  const source = await readFile(file, 'utf-8')

  // Readable ESM (.js)
  const { code: esmCode } = await transform(source, {
    sourceMaps: false,
    module: { type: 'es6' },
    jsc: {
      target: 'es2021' as const,
      parser: { syntax: 'typescript' as const },
    },
  })
  await writeFile(destEsm, rewriteRelativeSpecifiers(esmCode, file, 'js'))

  // Minified CJS (.cjs)
  const { code: cjsCode } = await transform(source, {
    sourceMaps: false,
    module: { type: 'commonjs' },
    jsc: {
      target: 'es2021' as const,
      parser: { syntax: 'typescript' as const },
      minify: { compress: true, mangle: true },
    },
  })
  await writeFile(destCjs, rewriteRelativeSpecifiers(cjsCode, file, 'cjs'))
}

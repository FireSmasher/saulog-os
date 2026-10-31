import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// Served by GitHub Pages at https://firesmasher.github.io/saulog-os/next/
const BASE = '/saulog-os/next/'

// Same rule as the old app: only our own files, Supabase, nothing else.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

function listFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...listFiles(full))
    else out.push(relative('public', full).split(sep).join('/'))
  }
  return out
}

// Writes dist/sw.js with every built file in its precache list. The cache name
// carries a hash of all file contents, so each deploy replaces the old cache.
function serviceWorker(): Plugin {
  return {
    name: 'saulog-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map'))
      const pub = listFiles('public')
      const hash = createHash('sha256')
      for (const f of built.sort()) {
        const item = bundle[f]
        hash.update(f)
        hash.update(item.type === 'chunk' ? item.code : item.source)
      }
      for (const f of pub.sort()) {
        hash.update(f)
        hash.update(readFileSync(join('public', f)))
      }
      const assets = ['./', ...[...new Set([...built, ...pub])].sort().map((f) => './' + f)]
      const source = readFileSync('sw/sw-template.js', 'utf8')
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__ASSETS__', JSON.stringify(assets, null, 2))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// The CSP goes in only at build time: the dev server needs inline scripts for hot reload.
function contentSecurityPolicy(): Plugin {
  return {
    name: 'saulog-csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    ],
  }
}

export default defineConfig({
  base: BASE,
  plugins: [react(), contentSecurityPolicy(), serviceWorker()],
  build: { target: 'es2022', sourcemap: false },
})

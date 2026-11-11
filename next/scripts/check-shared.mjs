// Fails when a Deno copy in supabase/functions/_shared differs from its source in
// next/src/lib, apart from the sync header and the import paths. Run by `npm test`.
//   node scripts/check-shared.mjs          check (exit 1 on any difference)
//   node scripts/check-shared.mjs --write  rewrite the copies from the sources
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MARK = '// ---- end sync header ----'
// Files whose imports stay inside _shared; every other relative import points back at next/src/lib.
const PAIRS = ['nudge.ts', 'nudge-messages.ts']
const LOCAL = new Set(PAIRS)

const header = (name) =>
  [
    `// SYNCED COPY for the Deno Edge Functions. Source: next/src/lib/${name} (the source wins).`,
    '// Do not edit here. Edit the source, then run `cd next && node scripts/check-shared.mjs --write`.',
    '// Imports that leave this folder point at ../../../next/src/lib/. `npm test` fails when this',
    '// file and the source differ apart from this header and the import paths.',
    MARK,
  ].join('\n')

const importRe = /^(import\b.*\bfrom\s+)(['"])(\.{1,2}\/[^'"]+)\2/

// Body with every relative import specifier reduced to its file name.
function normalise(text) {
  return text
    .split('\n')
    .map((line) => line.replace(importRe, (_all, head, q, spec) => `${head}${q}${basename(spec)}${q}`))
    .join('\n')
}

function toDeno(text) {
  return text
    .split('\n')
    .map((line) =>
      line.replace(importRe, (all, head, q, spec) => {
        const file = basename(spec)
        return LOCAL.has(file) ? all : `${head}${q}../../../next/src/lib/${file}${q}`
      }),
    )
    .join('\n')
}

const write = process.argv.includes('--write')
let failed = 0
for (const name of PAIRS) {
  const srcPath = join(root, 'next', 'src', 'lib', name)
  const copyPath = join(root, 'supabase', 'functions', '_shared', name)
  const src = readFileSync(srcPath, 'utf8')
  if (write) {
    writeFileSync(copyPath, `${header(name)}\n${toDeno(src)}`)
    console.log(`wrote supabase/functions/_shared/${name}`)
    continue
  }
  if (!existsSync(copyPath)) {
    console.error(`check-shared: missing supabase/functions/_shared/${name}`)
    failed++
    continue
  }
  const copy = readFileSync(copyPath, 'utf8')
  const at = copy.indexOf(MARK + '\n')
  if (at < 0) {
    console.error(`check-shared: _shared/${name} has no sync header ending in "${MARK}"`)
    failed++
    continue
  }
  const a = normalise(src).split('\n')
  const b = normalise(copy.slice(at + MARK.length + 1)).split('\n')
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      console.error(`check-shared: _shared/${name} differs from next/src/lib/${name} at source line ${i + 1}`)
      console.error(`  source: ${a[i] ?? '(end of file)'}`)
      console.error(`  copy:   ${b[i] ?? '(end of file)'}`)
      failed++
      break
    }
  }
}
if (failed) {
  console.error('check-shared: FAIL. Fix with: cd next && node scripts/check-shared.mjs --write')
  process.exit(1)
}
if (!write) console.log(`check-shared: ok (${PAIRS.length} files in sync)`)

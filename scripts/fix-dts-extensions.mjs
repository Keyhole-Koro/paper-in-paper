#!/usr/bin/env node
// tsc emits declarations with extensionless relative imports ("./react/PaperCanvas"), which
// TypeScript cannot resolve for consumers using moduleResolution node16/nodenext. This adds
// the extension Node would need ("./react/PaperCanvas.js", "./dir/index.js") to every
// relative import/export specifier in dist/types.

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist/types');

function* declarationFiles(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* declarationFiles(path);
    else if (name.endsWith('.d.ts')) yield path;
  }
}

const SPECIFIER = /(\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]*?)\2/g;

let changed = 0;
for (const file of declarationFiles(root)) {
  const source = readFileSync(file, 'utf8');
  const next = source.replace(SPECIFIER, (match, prefix, quote, specifier) => {
    if (/\.(js|mjs|cjs|json)$/.test(specifier)) return match;
    const base = resolve(dirname(file), specifier);
    if (existsSync(`${base}.d.ts`)) return `${prefix}${quote}${specifier}.js${quote}`;
    if (existsSync(join(base, 'index.d.ts'))) return `${prefix}${quote}${specifier}/index.js${quote}`;
    return match;
  });
  if (next !== source) {
    writeFileSync(file, next);
    changed += 1;
  }
}
console.log(`fix-dts-extensions: updated ${changed} declaration file(s) in ${root}`);

#!/usr/bin/env node
// Retakes the README screenshots (docs/images/*.png) from the demo app: starts Vite, opens
// papers by clicking their links (inside the paper iframes), and saves each state.
//
//   npm run screenshots              all shots
//   npm run screenshots nested       only these
//
// First run: npx playwright install chromium

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'docs/images');

/**
 * Each shot opens papers by clicking `a[data-paper-id]` links in order. The ids come from
 * src/demo/demoData.ts.
 */
const SHOTS = [
  { name: 'overview', open: [], viewport: { width: 1280, height: 760 } },
  { name: 'siblings', open: ['concept', 'architecture'], viewport: { width: 1280, height: 760 } },
  { name: 'nested', open: ['concept', 'focus'], viewport: { width: 1280, height: 760 } },
];

function freePort() {
  return new Promise((ok) => {
    const server = createServer().listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => ok(port));
    });
  });
}

async function waitFor(url, seconds = 60) {
  for (let i = 0; i < seconds * 2; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} did not come up`);
}

/** Clicks the first link to `id`, wherever it is: papers render their content in iframes. */
async function openPaper(page, id) {
  for (const frame of page.frames()) {
    const link = frame.locator(`a[data-paper-id="${id}"]`);
    if (await link.count()) {
      await link.first().click();
      await page.waitForTimeout(1200); // the layout animates into place
      return;
    }
  }
  throw new Error(`No link to paper "${id}" is on screen`);
}

async function main() {
  const only = process.argv.slice(2);
  const shots = only.length ? SHOTS.filter((s) => only.includes(s.name)) : SHOTS;
  if (shots.length === 0) throw new Error(`No such shot. Pick from: ${SHOTS.map((s) => s.name).join(', ')}`);

  mkdirSync(OUT, { recursive: true });
  const port = await freePort();
  const url = `http://localhost:${port}`;
  const vite = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: 'ignore', detached: true });

  try {
    await waitFor(url);
    const browser = await chromium.launch();
    for (const shot of shots) {
      const page = await browser.newPage({ viewport: shot.viewport, deviceScaleFactor: 2 });
      await page.goto(url);
      await page.locator('iframe').first().waitFor();
      await page.waitForTimeout(1500); // fonts and the first layout pass
      for (const id of shot.open) await openPaper(page, id);
      await page.screenshot({ path: join(OUT, `${shot.name}.png`) });
      await page.close();
      console.log(`docs/images/${shot.name}.png`);
    }
    await browser.close();
  } finally {
    try {
      process.kill(-vite.pid);
    } catch {
      // already gone
    }
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exitCode = 1;
});

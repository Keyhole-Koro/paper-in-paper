import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts on purpose. Vitest 3 ships its own nested
// copy of Vite (7.x) while this project builds on Vite 8, so a single config
// typed by `vitest/config` reports the two Vite copies' `Plugin` types as
// incompatible. Splitting the test config keeps the build plugins on the
// project's Vite and leaves this file plugin-free — esbuild handles the TSX in
// the test files from the `jsx: react-jsx` setting in tsconfig.
export default defineConfig({
  test: {
    // jsdom gives component tests a DOM (document/window/iframe). Pure-logic
    // tests run fine under it too, so a single environment covers the suite.
    environment: 'jsdom',
    // Polyfills jsdom-missing observer APIs (ResizeObserver, etc.) the canvas
    // components reference on mount.
    setupFiles: ['./vitest.setup.ts'],
  },
});

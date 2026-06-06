/// <reference types="vitest/config" />
import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom gives component tests a DOM (document/window/iframe). Pure-logic
    // tests run fine under it too, so a single environment covers the suite.
    environment: 'jsdom',
    // Polyfills jsdom-missing observer APIs (ResizeObserver, etc.) the canvas
    // components reference on mount.
    setupFiles: ['./vitest.setup.ts'],
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/lib/index.ts'),
      name: 'PaperInPaper',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'mjs' : 'cjs'}`,
    },
    rollupOptions: {
      external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', 'framer-motion'],
      output: {
        globals: {
          react: 'React',
          'react/jsx-runtime': 'ReactJSXRuntime',
          'framer-motion': 'FramerMotion',
        },
      },
    },
    sourcemap: true,
    outDir: 'dist',
    emptyOutDir: false,
    copyPublicDir: false,
  },
});

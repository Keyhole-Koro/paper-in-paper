import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/lib/index.ts'),
      name: 'PaperInPaper',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'mjs' : 'cjs'}`,
    },
    rollupOptions: {
      external: ['react', 'react/jsx-runtime', 'framer-motion'],
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

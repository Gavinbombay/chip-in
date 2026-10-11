import { defineConfig } from 'vite'

// Static build for GitHub Pages at https://<account>.github.io/chip-in/
// Output goes to the repository-root docs/ folder (one level above page/) so GitHub Pages serves it from main.
export default defineConfig({
  base: '/chip-in/',
  build: {
    outDir: '../docs',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
})

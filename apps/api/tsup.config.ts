import { defineConfig } from 'tsup';

// Production bundle: the shared workspace package is inlined, npm dependencies
// stay external and are installed in the Docker image.
export default defineConfig({
  entry: ['src/server.ts', 'src/db/seed.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: true,
  noExternal: ['@identity/shared'],
});

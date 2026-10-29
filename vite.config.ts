import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  root: 'src/client',
  base: process.env.VITE_BASE_PATH || '/',
  build: { outDir: '../../dist/client', emptyOutDir: true },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '^/api/': 'http://127.0.0.1:8080' },
    fs: {
      deny: [
        '.env',
        '.env.*',
        '*.{crt,pem,key,p12,pfx,cer,der}',
        '.npmrc',
        '.yarnrc.yml',
        '**/.git/**',
        '**/.local/**',
      ],
    },
  },
});

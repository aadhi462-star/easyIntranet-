import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5180 },
  build: {
    rollupOptions: {
      output: {
        // React and the router change rarely: a separate chunk stays cached across app rebuilds.
        manualChunks: (id) => (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id) ? 'vendor' : undefined),
      },
    },
  },
});

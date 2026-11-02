import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Mesma porta da API (PORT no .env), para o proxy não cair em outro servidor local.
  const api = `http://localhost:${loadEnv(mode, process.cwd(), '').PORT || 3001}`;
  return {
    root: 'web',
    server: {
      host: true,
      // Câmera no celular exige HTTPS: libera o host do ngrok / Cloudflare Tunnel.
      allowedHosts: true,
      proxy: {
        '/api': api,
        '/fotos': api,
      },
    },
    build: { outDir: 'dist', emptyOutDir: true },
  };
});

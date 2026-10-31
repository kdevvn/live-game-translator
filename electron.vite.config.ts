import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    // Worker chỉ được gọi khi bắt đầu capture; chuẩn bị trước để Vite không reload giữa phiên.
    optimizeDeps: {
      include: ['@paddleocr/paddleocr-js', '@techstark/opencv-js', 'onnxruntime-web/wasm'],
    },
    resolve: { alias: [{ find: /^onnxruntime-web$/, replacement: 'onnxruntime-web/wasm' }] },
    worker: { format: 'es' },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'development-csp',
        apply: 'serve',
        transformIndexHtml(html) {
          return html.replace("script-src 'self'", "script-src 'self' 'nonce-translate-game-dev'");
        },
      },
    ],
    html: { cspNonce: 'translate-game-dev' },
  },
});

import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL("./client3d", import.meta.url)),
  base: "/3d/",
  publicDir: false,
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/socket.io": { target: "http://127.0.0.1:3000", ws: true },
      "/api": "http://127.0.0.1:3000",
      "/kaykit": "http://127.0.0.1:3000",
    },
  },
  build: {
    outDir: "../dist/public/3d",
    emptyOutDir: true,
    target: "safari15.4",
    rollupOptions: {
      input: {
        game: fileURLToPath(new URL("./client3d/index.html", import.meta.url)),
        gallery: fileURLToPath(
          new URL("./client3d/gallery.html", import.meta.url),
        ),
      },
      output: { manualChunks: { three: ["three"] } },
    },
  },
});

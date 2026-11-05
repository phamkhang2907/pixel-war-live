import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { buildInfo } from "./tools/build-info.mjs";

export default defineConfig(({ command }) => {
  const info = buildInfo();
  // Same metadata is embedded in the client and served separately for remote diagnosis.
  if (command === "build") {
    const output = fileURLToPath(new URL("./dist/public/", import.meta.url));
    mkdirSync(output, { recursive: true });
    writeFileSync(
      output + "version.json",
      JSON.stringify(info, null, 2) + "\n",
    );
  }
  return {
    define: { __PW_BUILD_INFO__: JSON.stringify(info) },
    root: fileURLToPath(new URL("./client3d", import.meta.url)),
    base: "/3d/",
    publicDir: false,
    server: {
      host: "0.0.0.0",
      port: 5173,
      proxy: {
        "/socket.io": { target: "http://127.0.0.1:3000", ws: true },
        "/api": "http://127.0.0.1:3000",
        "/assets": "http://127.0.0.1:3000",
        "/kaykit": "http://127.0.0.1:3000",
      },
    },
    build: {
      outDir: "../dist/public/3d",
      emptyOutDir: true,
      target: "safari15.4",
      rollupOptions: {
        input: {
          game: fileURLToPath(
            new URL("./client3d/index.html", import.meta.url),
          ),
          gallery: fileURLToPath(
            new URL("./client3d/gallery.html", import.meta.url),
          ),
        },
        output: { manualChunks: { three: ["three"] } },
      },
    },
  };
});

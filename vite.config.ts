/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// @tauri-apps/cli sets TAURI_* env vars during `tauri dev`/`tauri build`.
const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  // Tauri expects a fixed, predictable dev server.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host ?? false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: {
      // src-tauri is watched by the Rust side, not Vite.
      ignored: ["**/src-tauri/**"],
    },
  },

  // Produce Safari/WKWebView-compatible output on macOS.
  build: {
    target: "safari15",
    minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },

  // MediaPipe ships large wasm/data files; don't inline them.
  assetsInclude: ["**/*.task", "**/*.wasm"],

  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["./tests/setup.ts"],
  },
});

import react from "@vitejs/plugin-react";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(projectRoot, "extension");
const distDir = resolve(projectRoot, "dist");

function manifestPlugin() {
  return {
    name: "element-catcher-manifest",
    writeBundle() {
      const target = resolve(distDir, "manifest.json");
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(resolve(rootDir, "manifest.json"), target);
    }
  };
}

export default defineConfig({
  root: rootDir,
  publicDir: "public",
  plugins: [react(), manifestPlugin()],
  build: {
    outDir: distDir,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(rootDir, "src/sidepanel/index.html"),
        background: resolve(rootDir, "src/background/service-worker.ts"),
        content: resolve(rootDir, "src/content/index.ts")
      },
      output: {
        entryFileNames(chunkInfo) {
          if (chunkInfo.name === "background") {
            return "background/service-worker.js";
          }

          if (chunkInfo.name === "content") {
            return "content/content-script.js";
          }

          return "assets/[name].js";
        },
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  }
});

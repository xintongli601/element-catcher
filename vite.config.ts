import react from "@vitejs/plugin-react";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

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

function contentScriptGuardPlugin(): Plugin {
  return {
    name: "element-catcher-content-script-guard",
    generateBundle(_options, bundle) {
      const contentChunk = bundle["content/content-script.js"];

      if (!contentChunk || contentChunk.type !== "chunk") {
        this.error("Content script build must emit content/content-script.js.");
        return;
      }

      if (contentChunk.imports.length > 0) {
        this.error("Content script build must not emit Rollup imports.");
      }

      if (contentChunk.dynamicImports.length > 0) {
        this.error("Content script build must not emit dynamic imports.");
      }

      if (contentChunk.exports.length > 0) {
        this.error("Content script build must not emit exports.");
      }

      for (const [fileName, output] of Object.entries(bundle)) {
        if (fileName !== "content/content-script.js" && output.type === "chunk") {
          this.error(`Content script build must be self-contained, but emitted ${fileName}.`);
        }
      }
    }
  };
}

export default defineConfig(({ mode }) => {
  const isContentBuild = mode === "content";

  return {
    root: rootDir,
    publicDir: "public",
    plugins: isContentBuild ? [contentScriptGuardPlugin()] : [react(), manifestPlugin()],
    build: {
      outDir: distDir,
      emptyOutDir: !isContentBuild,
      rollupOptions: isContentBuild
        ? {
            input: resolve(rootDir, "src/content/index.ts"),
            output: {
              format: "iife",
              name: "ElementCatcherContentScript",
              inlineDynamicImports: true,
              entryFileNames: "content/content-script.js",
              assetFileNames: "assets/[name][extname]"
            }
          }
        : {
            input: {
              sidepanel: resolve(rootDir, "src/sidepanel/index.html"),
              previewHost: resolve(rootDir, "src/preview/host.html"),
              previewRenderRealm: resolve(rootDir, "src/preview/render-realm.html"),
              background: resolve(rootDir, "src/background/service-worker.ts")
            },
            output: {
              entryFileNames(chunkInfo) {
                if (chunkInfo.name === "background") {
                  return "background/service-worker.js";
                }

                return "assets/[name].js";
              },
              chunkFileNames: "assets/[name].js",
              assetFileNames: "assets/[name][extname]"
            }
          }
    }
  };
});

import { resolve } from "node:path";

import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";

const browserBuild = {
  plugins: [wasm()],
  build: {
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, "lib/index.ts"),
      formats: ["es"],
      fileName: () => "index.mjs",
    },
    outDir: "dist",
    sourcemap: true,
    target: "es2022",
  },
};

const nodeBuild = {
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "lib/node.ts"),
      formats: ["es", "cjs"],
      fileName: (format) => (format === "es" ? "node.mjs" : "node.cjs"),
    },
    outDir: "dist",
    sourcemap: true,
    target: "es2022",
    rollupOptions: {
      external: ["node:fs", "node:url"],
      output: {
        exports: "named",
      },
    },
  },
};

export default defineConfig(() => {
  return process.env.LIB_TARGET === "node" ? nodeBuild : browserBuild;
});

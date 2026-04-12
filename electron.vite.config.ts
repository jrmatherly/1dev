import { defineConfig } from "electron-vite";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const isDev = process.env.NODE_ENV !== "production";

export default defineConfig({
  main: {
    build: {
      externalizeDeps: {
        exclude: ["superjson", "trpc-electron", "front-matter", "async-mutex"],
      },
      lib: {
        entry: resolve(__dirname, "src/main/index.ts"),
      },
      rollupOptions: {
        external: [
          "electron",
          "better-sqlite3",
          "@anthropic-ai/claude-agent-sdk", // ESM module - must use dynamic import
        ],
        output: {
          format: "cjs",
        },
      },
    },
  },
  preload: {
    build: {
      externalizeDeps: {
        exclude: ["trpc-electron"],
      },
      lib: {
        entry: resolve(__dirname, "src/preload/index.ts"),
      },
      rollupOptions: {
        external: ["electron"],
        output: {
          format: "cjs",
        },
      },
    },
  },
  renderer: {
    plugins: [
      tailwindcss(),
      react({
        // In dev mode, use WDYR as JSX import source to track ALL component re-renders
        jsxImportSource: isDev
          ? "@welldone-software/why-did-you-render"
          : undefined,
      }),
    ],
    resolve: {
      alias: {
        "@": resolve(__dirname, "src/renderer"),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/renderer/index.html"),
          login: resolve(__dirname, "src/renderer/login.html"),
        },
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/monaco-editor")) return "monaco";
            if (id.includes("node_modules/mermaid")) return "mermaid";
            if (id.includes("node_modules/katex")) return "katex";
            if (id.includes("node_modules/cytoscape")) return "cytoscape";
            if (id.includes("node_modules/shiki")) return "shiki";
            return undefined;
          },
        },
      },
    },
  },
});

import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Stub out the Next.js server-only package so Vitest can import
      // modules that use `import "server-only"` without failing.
      "server-only": path.resolve(__dirname, "./src/__mocks__/server-only.ts"),
    },
  },
});

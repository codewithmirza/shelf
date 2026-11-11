import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests run in Node: the domain has no I/O. Integration tests in the Workers runtime come in later tasks.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["tests/unit/**/*.test.ts", "tests/contract/**/*.test.ts"], environment: "node" },
});

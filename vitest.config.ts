import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Tests run in Node. I/O sits behind injected ports (CQ-26), so integration tests drive the real MCP server with fakes.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["tests/unit/**/*.test.ts", "tests/contract/**/*.test.ts", "tests/integration/**/*.test.ts"], environment: "node" },
});

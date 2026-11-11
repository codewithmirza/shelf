import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// The Storefront must be one HTML document served as an MCP App resource (ADR-009).
export default defineConfig({
  root: "storefront",
  plugins: [react(), viteSingleFile()],
  build: { outDir: "dist", emptyOutDir: true, assetsInlineLimit: 100_000_000 },
});

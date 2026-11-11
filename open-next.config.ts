import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache: every Shelf page reads live data, and cacheComponents stays off (ADR-001).
export default defineCloudflareConfig({});

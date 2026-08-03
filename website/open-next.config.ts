import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Defaults throughout. There is no ISR to cache here — the pages are either
// static or render from the race socket — so the incremental cache overrides
// would be configuration for nothing.
export default defineCloudflareConfig();

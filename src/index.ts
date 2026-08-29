import {
  resolveFallbackToken,
  determineExecutionMode,
} from "./common/index.js";
import { syncTaxonomyCache } from "./common/taxonomy.js";
import {
  startHttpTransport,
  startStdioTransport,
} from "./server/index.js";

// ── Global Error Handlers ─────────────────────────────────────
process.on("uncaughtException", (err: Error) => {
  console.error("[FATAL] Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason: unknown) => {
  console.error("[FATAL] Unhandled Rejection:", reason);
});

// ── Run MCP Server ─────────────────────────────────────────────
async function run() {
  await syncTaxonomyCache().catch(e => console.error("Failed to sync taxonomy cache:", e));

  const fallbackToken = resolveFallbackToken();
  const { isHttpMode, port } = determineExecutionMode();

  if (isHttpMode) {
    await startHttpTransport(port, fallbackToken);
  } else {
    await startStdioTransport();
  }
}

run().catch(console.error);

export * from "./server/index.js";
export * from "./tools/index.js";
export * from "./common/index.js";
export * from "./modules/index.js";
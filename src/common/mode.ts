/**
 * Determine whether to start in Stdio Mode or HTTP/SSE Server Mode.
 */
export function determineExecutionMode(): { isHttpMode: boolean; port: number } {
  const argv = process.argv.slice(2);
  const hasHttpFlag = argv.includes("--http") || argv.includes("--server") || argv.includes("--sse") || argv.includes("-s");
  const hasStdioFlag = argv.includes("--stdio") || argv.includes("-i");

  // Check port flag --port 8787 or --port=8787
  let portFromArg: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--port" && argv[i + 1]) {
      const p = parseInt(argv[i + 1], 10);
      if (!isNaN(p)) portFromArg = p;
    } else if (argv[i].startsWith("--port=")) {
      const p = parseInt(argv[i].split("=")[1], 10);
      if (!isNaN(p)) portFromArg = p;
    }
  }

  const transportEnv = (process.env.MCP_TRANSPORT || process.env.MCP_MODE || "").toLowerCase();

  // If stdio flag or env is explicitly requested -> Stdio
  if (hasStdioFlag || transportEnv === "stdio") {
    return { isHttpMode: false, port: 8787 };
  }

  // If HTTP flag or env is requested -> HTTP mode
  if (hasHttpFlag || transportEnv === "http" || transportEnv === "server" || transportEnv === "sse" || portFromArg !== undefined) {
    const port = portFromArg ?? parseInt(process.env.PORT ?? "8787", 10);
    return { isHttpMode: true, port: isNaN(port) ? 8787 : port };
  }

  // Default: STDIO mode (Standard for AI coding tools like Claude Desktop, Antigravity, Roo Code)
  return { isHttpMode: false, port: 8787 };
}

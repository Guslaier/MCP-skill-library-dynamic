import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  SKILLS_DIRS,
  validateBearerTokenAsync,
} from "../common/index.js";
import { createMcpServerInstance } from "./server.js";

/**
 * Starts the MCP Server using Stdio transport (Default for AI IDEs/Clients).
 */
export async function startStdioTransport(): Promise<void> {
  const stdioServer = createMcpServerInstance("standard");
  const transport = new StdioServerTransport();
  await stdioServer.connect(transport);
  console.error(`Skill Library MCP Server v1.1.0 (stdio) is running! Serving from: ${SKILLS_DIRS.join(", ")}`);
}

/**
 * Starts the MCP Server using Streamable HTTP & SSE transport (For PM2/Remote).
 */
export async function startHttpTransport(port: number, fallbackToken: string | null): Promise<void> {
  const sseTransports = new Map<string, SSEServerTransport>();

  const MAX_ACTIVE_SESSIONS = 50;
  const SESSION_INACTIVITY_TTL_MS = 30 * 60 * 1000;
  const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

  interface ManagedStreamableSession {
    transport: StreamableHTTPServerTransport;
    server: Server;
    role: "admin" | "standard";
    lastActive: number;
  }
  const streamableSessions = new Map<string, ManagedStreamableSession>();

  function sweepIdleSessions() {
    const now = Date.now();
    for (const [sid, session] of streamableSessions.entries()) {
      if (now - session.lastActive > SESSION_INACTIVITY_TTL_MS) {
        try {
          session.transport.close();
          session.server.close();
        } catch {}
        streamableSessions.delete(sid);
      }
    }
  }

  const gcTimer = setInterval(sweepIdleSessions, CLEANUP_INTERVAL_MS);
  gcTimer.unref();

  async function getOrCreateStreamableSession(
    sessionId?: string,
    role: "admin" | "standard" = "standard"
  ): Promise<{ transport: StreamableHTTPServerTransport; server: Server; isNew: boolean }> {
    if (sessionId && streamableSessions.has(sessionId)) {
      const entry = streamableSessions.get(sessionId)!;
      entry.lastActive = Date.now();
      return { ...entry, isNew: false };
    }

    if (streamableSessions.size >= MAX_ACTIVE_SESSIONS) {
      let oldestId: string | null = null;
      let oldestTime = Infinity;
      for (const [id, s] of streamableSessions.entries()) {
        if (s.lastActive < oldestTime) {
          oldestTime = s.lastActive;
          oldestId = id;
        }
      }
      if (oldestId) {
        const oldSession = streamableSessions.get(oldestId);
        try {
          oldSession?.transport.close();
          oldSession?.server.close();
        } catch {}
        streamableSessions.delete(oldestId);
      }
    }

    const newSessionId = sessionId || randomUUID();
    const server = createMcpServerInstance(role);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    const entry: ManagedStreamableSession = { transport, server, role, lastActive: Date.now() };
    streamableSessions.set(newSessionId, entry);
    return { ...entry, isNew: true };
  }

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, X-Session-Id, Mcp-Session-Id, mcp-session-id");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, mcp-session-id, Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const authResult = await validateBearerTokenAsync(req, fallbackToken);
    if (!authResult.valid) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized", message: "Missing or invalid Bearer token" }));
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "GET") {
      const sseServer = createMcpServerInstance(authResult.role);
      const sseTransport = new SSEServerTransport("/message", res);
      
      sseTransports.set(sseTransport.sessionId, sseTransport);
      sseTransport.onclose = () => {
        sseTransports.delete(sseTransport.sessionId);
      };

      await sseServer.connect(sseTransport);
      return;
    }

    if (req.method === "POST" && (url.pathname === "/message" || url.searchParams.has("sessionId"))) {
      const sessionId = url.searchParams.get("sessionId") || (req.headers["x-session-id"] as string);
      const transport = (sessionId && sseTransports.get(sessionId)) || sseTransports.values().next().value;
      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "SSE session not found" }));
      }
      return;
    }

    if (!req.headers.accept || req.headers.accept === "*/*" || !req.headers.accept.includes("application/json")) {
      req.headers.accept = "application/json, text/event-stream";
    }

    const incomingSessionId = (req.headers["mcp-session-id"] || req.headers["x-session-id"]) as string | undefined;
    const { transport } = await getOrCreateStreamableSession(incomingSessionId, authResult.role);

    await transport.handleRequest(req, res);
  });

  httpServer.listen(port, "0.0.0.0", () => {
    console.error(
      `Skill Library MCP Server v1.1.0 (HTTP + SSE + RBAC) listening on 0.0.0.0:${port}! Serving from: ${SKILLS_DIRS.join(", ")}`
    );
  });
}

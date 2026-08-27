import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import os from "node:os";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import { promises as fsPromises } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  serviceStart,
  serviceStop,
  serviceList,
  serviceToolDefinitions,
} from "./service.js";
import {
  oauthGenerateKey,
  oauthValidateKey,
  oauthListKeys,
  oauthRegenKey,
  oauthDeleteKey,
  authToolDefinitions,
} from "./auth.js";
import {
  sessionCreate,
  sessionGet,
  sessionList,
  sessionDelete,
  sessionToolDefinitions,
} from "./session.js";
import { resolveDataDir, readJsonFile } from "./storage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Configuration & Robust Path Resolution ────────────────────
function resolveSkillsDir(): string {
  if (process.env.SKILLS_DIR && fs.existsSync(process.env.SKILLS_DIR)) {
    return path.resolve(process.env.SKILLS_DIR);
  }
  const distRelative = path.resolve(__dirname, "..", "..", ".agents", "skills");
  if (fs.existsSync(distRelative)) {
    return distRelative;
  }
  const rootRelative = path.resolve(__dirname, "..", ".agents", "skills");
  if (fs.existsSync(rootRelative)) {
    return rootRelative;
  }
  return path.resolve(process.cwd(), ".agents", "skills");
}

const SKILLS_DIR = resolveSkillsDir();

if (!fs.existsSync(SKILLS_DIR)) {
  try {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
  } catch (err) {
    console.error(`[ERROR] Failed to create SKILLS_DIR at: ${SKILLS_DIR}`);
  }
}

// ── Bearer Token Auth ──────────────────────────────────────────
function resolveFallbackToken(): string | null {
  if (process.env.SKILL_LIBRARY_API_TOKEN) {
    return process.env.SKILL_LIBRARY_API_TOKEN;
  }
  const tokenFile = path.resolve(process.cwd(), ".mcp-token");
  if (fs.existsSync(tokenFile)) {
    return fs.readFileSync(tokenFile, "utf-8").trim();
  }
  const settingFile = path.resolve(process.cwd(), "setting_mcp.json");
  if (fs.existsSync(settingFile)) {
    try {
      const config = JSON.parse(fs.readFileSync(settingFile, "utf-8"));
      return (
        config?.token ??
        config?.mcpServers?.["skill-library-mcp"]?.env?.SKILL_LIBRARY_API_TOKEN ??
        null
      );
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Validates incoming Bearer token dynamically against:
 * 1. .data/oauth-keys.json (Checks role: 'admin' vs 'standard')
 * 2. Fallback static token (Always granted 'admin' role)
 */
async function validateBearerTokenAsync(
  req: IncomingMessage,
  fallbackToken?: string | null
): Promise<{ valid: boolean; role: "admin" | "standard" }> {
  const authHeader = req.headers.authorization ?? "";
  if (!authHeader.startsWith("Bearer ")) return { valid: false, role: "standard" };
  const provided = authHeader.slice(7).trim();
  if (!provided) return { valid: false, role: "standard" };

  // 1. Check against dynamic OAuth Keys in .data/oauth-keys.json
  try {
    const res = await oauthValidateKey({ key: provided });
    if (res.valid) {
      return { valid: true, role: res.role };
    }
  } catch {
    // ignore
  }

  // 2. Check against fallback master token (Full Admin)
  if (fallbackToken) {
    const a = Buffer.from(provided);
    const b = Buffer.from(fallbackToken);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return { valid: true, role: "admin" };
    }
  }

  return { valid: false, role: "standard" };
}

// ── Global Error Handlers ─────────────────────────────────────
process.on("uncaughtException", (err: Error) => {
  console.error("[FATAL] Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason: unknown) => {
  console.error("[FATAL] Unhandled Rejection:", reason);
});

// ── Helper: Recursive Markdown File Finder ────────────────────
async function getMarkdownFiles(dir: string): Promise<string[]> {
  const mdFiles: string[] = [];
  async function scan(currentDir: string) {
    const entries = await fsPromises.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        mdFiles.push(fullPath);
      }
    }
  }
  await scan(dir);
  return mdFiles;
}

// ── Helper: Network & System Status ───────────────────────────
async function getSystemStatusData() {
  const dataDir = resolveDataDir();
  const hostname = os.hostname();
  const nets = os.networkInterfaces();
  const outboundIPs: { name: string; ip: string }[] = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        outboundIPs.push({ name, ip: net.address });
      }
    }
  }

  interface ActivityLog {
    time: string;
    type: "SERVICE" | "OAUTH" | "SESSION";
    message: string;
  }
  const activityLogs: ActivityLog[] = [];

  try {
    const services = await readJsonFile<Record<string, any>>(path.join(dataDir, "services.json"), {});
    const sessions = await readJsonFile<Record<string, any>>(path.join(dataDir, "sessions.json"), {});
    const oauthKeys = await readJsonFile<Record<string, any>>(path.join(dataDir, "oauth-keys.json"), {});

    for (const [sname, s] of Object.entries(services)) {
      if (s.startedAt) activityLogs.push({ time: s.startedAt, type: "SERVICE", message: `Service "${sname}" started ${s.port ? `on port ${s.port}` : ""}` });
      if (s.stoppedAt) activityLogs.push({ time: s.stoppedAt, type: "SERVICE", message: `Service "${sname}" stopped` });
    }
    for (const [sname, s] of Object.entries(sessions)) {
      if (s.updatedAt || s.createdAt) activityLogs.push({ time: s.updatedAt || s.createdAt, type: "SESSION", message: `Session "${sname}" updated/saved` });
    }
    for (const [kid, k] of Object.entries(oauthKeys)) {
      if (k.lastUsedAt) activityLogs.push({ time: k.lastUsedAt, type: "OAUTH", message: `Key "${k.label || kid.slice(0, 8)}" validated successfully` });
      if (k.createdAt) activityLogs.push({ time: k.createdAt, type: "OAUTH", message: `Key "${k.label || kid.slice(0, 8)}" generated` });
    }
  } catch {}

  activityLogs.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  return {
    hostname,
    localIp: "127.0.0.1",
    networkInterfaces: outboundIPs,
    recentLogs: activityLogs.slice(0, 10),
  };
}

// ── Cache State ────────────────────────────────────────────────
let cachedSkillsList: string[] | null = null;
let skillsCacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 1000;

async function getValidSkillsList(): Promise<string[]> {
  const now = Date.now();
  if (cachedSkillsList && now - skillsCacheTimestamp < CACHE_TTL_MS) {
    return cachedSkillsList;
  }

  const dirents = await fsPromises.readdir(SKILLS_DIR, { withFileTypes: true });
  const validSkills: string[] = [];

  for (const dirent of dirents) {
    if (dirent.isDirectory()) {
      const fullPath = path.join(SKILLS_DIR, dirent.name);
      try {
        const mdFiles = await getMarkdownFiles(fullPath);
        if (mdFiles.length > 0) {
          validSkills.push(dirent.name);
        }
      } catch {
        // Skip unreadable directories
      }
    }
  }

  validSkills.sort();
  cachedSkillsList = validSkills;
  skillsCacheTimestamp = Date.now();
  return validSkills;
}

const systemStatusTool: Tool = {
  name: "system_status",
  description: "Get network IP info (LAN/Tailscale/Localhost) and recent activity logs from the MCP dashboard.",
  inputSchema: { type: "object", properties: {} },
  outputSchema: {
    type: "object",
    properties: {
      hostname: { type: "string" },
      localIp: { type: "string" },
      networkInterfaces: { type: "array", items: { type: "object" } },
      recentLogs: { type: "array", items: { type: "object" } },
    },
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

function createMcpServerInstance(role: "admin" | "standard" = "standard"): Server {
  const srv = new Server(
    { name: "skill-library-mcp", version: "1.1.0" },
    { capabilities: { tools: {} } }
  );

  const publicAiTools: Tool[] = [
    {
      name: "list_skills",
      description:
        "List all available skills/rules in the knowledge base. Supports optional search query for token efficiency.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Optional keyword to filter skills (e.g., 'react', 'python', 'review')",
          },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          skills: { type: "array", items: { type: "string" } },
          count: { type: "number" },
        },
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "fetch_skill_rule",
      description:
        "Fetch the full markdown content and nested rule guidelines of a specific skill.",
      inputSchema: {
        type: "object",
        properties: {
          skill_name: {
            type: "string",
            description: "Exact name of the skill folder (e.g., 'nestjs-best-practices')",
          },
        },
        required: ["skill_name"],
      },
      outputSchema: {
        type: "object",
        properties: {
          skill_name: { type: "string" },
          files: { type: "array", items: { type: "string" } },
          content: { type: "string" },
        },
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
  ];

  // Admin-only tools (Hidden and forbidden for Standard AI)
  const adminOnlyTools: Tool[] = [
    // 1. Memory & Sessions (session_create, session_get, session_list, session_delete)
    ...sessionToolDefinitions,
    // 2. API Keys & Auth (oauth_generate_key, oauth_regen_key, oauth_delete_key, oauth_validate_key, oauth_list_keys)
    ...authToolDefinitions,
    // 3. System Status & Logs (system_status)
    systemStatusTool,
    // 4. Services Status (service_list)
    {
      name: "service_list",
      description: "List all registered services with their current status, port, and sequential IDs.",
      inputSchema: { type: "object", properties: {} },
      outputSchema: {
        type: "object",
        properties: {
          services: { type: "array", items: { type: "object" } },
          count: { type: "number" },
        },
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
  ];

  // RBAC: Standard AI tokens see ONLY 2 skills tools. Admin tokens see All 13 tools.
  const activeTools = role === "admin" ? [...publicAiTools, ...adminOnlyTools] : publicAiTools;

  srv.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: activeTools,
    };
  });

  srv.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // RBAC Check: Block admin tools from standard AI
    if (
      name.startsWith("session_") ||
      name.startsWith("oauth_") ||
      name.startsWith("service_") ||
      name === "system_status"
    ) {
      if (role !== "admin") {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Unauthorized: Admin privileges required for tool '${name}'.`
        );
      }
    }

    if (name === "list_skills") {
      try {
        const allSkills = await getValidSkillsList();
        const query = typeof args?.query === "string" ? args.query.trim().toLowerCase() : "";

        const filteredSkills = query
          ? allSkills.filter((s) => s.toLowerCase().includes(query))
          : allSkills;

        if (filteredSkills.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: query
                  ? `No skills found matching query '${query}'.`
                  : "No valid skills with markdown rules found in the library.",
              },
            ],
            structuredContent: { skills: [], count: 0 },
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Available skills (${filteredSkills.length}${query ? ` matching '${query}'` : ""}):\n${filteredSkills.join("\n")}`,
            },
          ],
          structuredContent: { skills: filteredSkills, count: filteredSkills.length },
        };
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Could not read skills directory: ${error}`
        );
      }
    }

    if (name === "fetch_skill_rule") {
      const skillName = args?.skill_name as string | undefined;

      if (!skillName || typeof skillName !== "string") {
        throw new McpError(ErrorCode.InvalidParams, "skill_name parameter is required and must be a string.");
      }

      const cleanSkillName = skillName.trim();
      const targetDir = path.resolve(SKILLS_DIR, cleanSkillName);

      if (!targetDir.startsWith(SKILLS_DIR) || !fs.existsSync(targetDir)) {
        throw new McpError(ErrorCode.InvalidRequest, `Skill directory not found: ${cleanSkillName}`);
      }

      try {
        const mdFiles = await getMarkdownFiles(targetDir);

        if (mdFiles.length === 0) {
          return {
            content: [{ type: "text", text: `Skill "${cleanSkillName}" found, but contains no markdown (.md) rule files.` }],
            structuredContent: { skill_name: cleanSkillName, files: [], content: "" },
          };
        }

        const relativePaths = mdFiles.map((f) => path.relative(targetDir, f));
        const ruleSections: string[] = [];

        for (const filePath of mdFiles) {
          const relPath = path.relative(targetDir, filePath);
          const fileContent = await fsPromises.readFile(filePath, "utf-8");
          ruleSections.push(`=== FILE: ${relPath} ===\n\n${fileContent}`);
        }

        const combinedContent = ruleSections.join("\n\n" + "-".repeat(40) + "\n\n");

        return {
          content: [{ type: "text", text: combinedContent }],
          structuredContent: {
            skill_name: cleanSkillName,
            files: relativePaths,
            content: combinedContent,
          },
        };
      } catch (error: any) {
        if (error instanceof McpError) throw error;
        throw new McpError(ErrorCode.InternalError, `Failed to read rule files for ${cleanSkillName}: ${error?.message || error}`);
      }
    }

    // System Status tool
    if (name === "system_status") {
      try {
        const data = await getSystemStatusData();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          structuredContent: data,
        };
      } catch (error: any) {
        throw new McpError(ErrorCode.InternalError, `Failed to get system status: ${error.message}`);
      }
    }

    // SERVICE OPERATIONS: Start & Stop are strictly Admin-only
    if (name === "service_start" || name === "service_stop") {
      if (role !== "admin") {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Forbidden: Starting and stopping services is restricted to admin only (AI is not allowed to start/stop server services).`
        );
      }
      try {
        const result = name === "service_start" ? await serviceStart(args) : await serviceStop(args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (error: any) {
        if (error instanceof McpError) throw error;
        throw new McpError(ErrorCode.InternalError, `Service operation failed: ${error.message}`);
      }
    }

    if (name === "service_list") {
      try {
        const result = await serviceList();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (error: any) {
        if (error instanceof McpError) throw error;
        throw new McpError(ErrorCode.InternalError, `Service list failed: ${error.message}`);
      }
    }

    if (
      name === "oauth_generate_key" ||
      name === "oauth_validate_key" ||
      name === "oauth_list_keys" ||
      name === "oauth_regen_key" ||
      name === "oauth_delete_key"
    ) {
      try {
        const result =
          name === "oauth_generate_key" ? await oauthGenerateKey(args) :
          name === "oauth_validate_key" ? await oauthValidateKey(args) :
          name === "oauth_regen_key" ? await oauthRegenKey(args) :
          name === "oauth_delete_key" ? await oauthDeleteKey(args) :
          await oauthListKeys();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (error: any) {
        if (error instanceof McpError) throw error;
        throw new McpError(ErrorCode.InternalError, `OAuth operation failed: ${error.message}`);
      }
    }

    if (name === "session_create" || name === "session_get" || name === "session_list" || name === "session_delete") {
      try {
        const result =
          name === "session_create" ? await sessionCreate(args) :
          name === "session_get" ? await sessionGet(args) :
          name === "session_delete" ? await sessionDelete(args) :
          await sessionList();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (error: any) {
        if (error instanceof McpError) throw error;
        throw new McpError(ErrorCode.InternalError, `Session operation failed: ${error.message}`);
      }
    }

    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  });

  return srv;
}

// ── Run ────────────────────────────────────────────────────────
async function run() {
  const fallbackToken = resolveFallbackToken();
  const port = parseInt(process.env.PORT ?? "8787", 10);
  const isHttpMode = !!(
    process.env.PORT ||
    process.env.SKILL_LIBRARY_API_TOKEN ||
    fs.existsSync(path.resolve(process.cwd(), ".mcp-token")) ||
    fs.existsSync(path.join(resolveDataDir(), "oauth-keys.json"))
  );

  if (isHttpMode) {
    const sseTransports = new Map<string, SSEServerTransport>();
    
    // In-memory Session Garbage Collector configuration
    const MAX_ACTIVE_SESSIONS = 50;
    const SESSION_INACTIVITY_TTL_MS = 30 * 60 * 1000; // 30 minutes
    const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Sweep every 5 minutes

    interface ManagedStreamableSession {
      transport: StreamableHTTPServerTransport;
      server: Server;
      role: "admin" | "standard";
      lastActive: number;
    }
    const streamableSessions = new Map<string, ManagedStreamableSession>();

    // Background Sweep: Remove idle/abandoned sessions
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

      // LRU Eviction if pool reaches capacity
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
      // CORS headers
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

      // 1. Establish SSE stream for ANY GET request
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

      // 2. Handle SSE POST message
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

      // 3. Handle Streamable HTTP Transport (POST / or any other POST endpoint)
      if (!req.headers.accept || req.headers.accept === "*/*" || !req.headers.accept.includes("application/json")) {
        req.headers.accept = "application/json, text/event-stream";
      }

      const incomingSessionId = (req.headers["mcp-session-id"] || req.headers["x-session-id"]) as string | undefined;
      const { transport } = await getOrCreateStreamableSession(incomingSessionId, authResult.role);

      await transport.handleRequest(req, res);
    });

    httpServer.listen(port, "0.0.0.0", () => {
      console.error(
        `Skill Library MCP Server v1.1.0 (HTTP + SSE + RBAC) listening on 0.0.0.0:${port}! Serving from: ${SKILLS_DIR}`
      );
    });
  } else {
    // Stdio mode: Defaults to full admin (local execution)
    const stdioServer = createMcpServerInstance("admin");
    const transport = new StdioServerTransport();
    await stdioServer.connect(transport);
    console.error(`Skill Library MCP Server v1.1.0 (stdio) is running! Serving from: ${SKILLS_DIR}`);
  }
}

run().catch(console.error);
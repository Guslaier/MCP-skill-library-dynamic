import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import fs, { promises as fsPromises } from "fs";
import path from "path";
import {
  serviceStart,
  serviceStop,
  serviceList,
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
import {
  SKILLS_DIRS,
  getMarkdownFiles,
  getValidSkillsList,
  findSkillDirectory,
  findSkillsHelper,
  getSkillInfoHelper,
  installSkillHelper,
  uninstallSkillHelper,
  resolveFallbackToken,
  validateBearerTokenAsync,
  getSystemStatusData,
  systemStatusTool,
  determineExecutionMode,
} from "./common/index.js";

// ── Global Error Handlers ─────────────────────────────────────
process.on("uncaughtException", (err: Error) => {
  console.error("[FATAL] Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason: unknown) => {
  console.error("[FATAL] Unhandled Rejection:", reason);
});

function createMcpServerInstance(role: "admin" | "standard" = "standard"): Server {
  const srv = new Server(
    { name: "skill-library-mcp", version: "1.1.0" },
    { capabilities: { tools: {} } }
  );

  const publicAiTools: Tool[] = [
    {
      name: "find_skills",
      description:
        "Smart discovery search for skills across locally installed skills and the catalog registry (580+ skills) by keyword, task, or category. Highlights default skill 'find-skills' and shows installation status.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search keyword or task (e.g., 'react', 'tailwind', 'code review', 'python', 'docker')",
          },
          category: {
            type: "string",
            description: "Optional category filter (e.g., 'ai-ml-llm', 'frontend', 'backend', 'testing', 'devops')",
          },
          installed_only: {
            type: "boolean",
            description: "If true, only return already installed skills",
          },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          default_skill: { type: "string" },
          count: { type: "number" },
          total_matches: { type: "number" },
          skills: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                category: { type: "string" },
                is_installed: { type: "boolean" },
                source: { type: "string" },
                is_default: { type: "boolean" },
              },
            },
          },
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
      name: "list_skills",
      description:
        "List all available installed skills/rules in the knowledge base with optional keyword filter. 'find-skills' is the default discovery gateway skill.",
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
          default_skill: { type: "string" },
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
            description: "Exact name of the skill folder (e.g., 'find-skills', 'clean-code')",
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
    {
      name: "get_skill_info",
      description:
        "Get detailed metadata and file structure of a specific skill, including its description, category, install path, and repository source.",
      inputSchema: {
        type: "object",
        properties: {
          skill_name: {
            type: "string",
            description: "Name of the skill (e.g. 'find-skills', 'clean-code')",
          },
        },
        required: ["skill_name"],
      },
      outputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          is_default: { type: "boolean" },
          is_installed: { type: "boolean" },
          path: { type: "string" },
          files: { type: "array", items: { type: "string" } },
          description: { type: "string" },
          category: { type: "string" },
          source: { type: "string" },
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
      name: "install_skill",
      description:
        "Install a new skill or update an existing skill in the local library directly. Supports installing from catalog registry by name, GitHub repository URL, raw markdown URL, or custom markdown content.",
      inputSchema: {
        type: "object",
        properties: {
          skill_name: {
            type: "string",
            description: "Name of the skill (e.g. 'find-skills', 'react-best-practices')",
          },
          source: {
            type: "string",
            description: "Optional GitHub repository URL or raw SKILL.md URL",
          },
          content: {
            type: "string",
            description: "Optional raw markdown content for the skill",
          },
          description: {
            type: "string",
            description: "Optional description of what the skill does",
          },
          category: {
            type: "string",
            description: "Optional category",
          },
        },
        required: ["skill_name"],
      },
      outputSchema: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          message: { type: "string" },
          path: { type: "string" },
          skill_name: { type: "string" },
        },
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    {
      name: "uninstall_skill",
      description: "Remove / uninstall a skill from the local skill library.",
      inputSchema: {
        type: "object",
        properties: {
          skill_name: {
            type: "string",
            description: "Name of the skill to uninstall",
          },
        },
        required: ["skill_name"],
      },
      outputSchema: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          message: { type: "string" },
        },
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
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

  // RBAC: Standard AI tokens see ONLY skill tools. Admin tokens see All tools.
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

    if (name === "find_skills") {
      try {
        const query = typeof args?.query === "string" ? args.query : undefined;
        const category = typeof args?.category === "string" ? args.category : undefined;
        const installed_only = typeof args?.installed_only === "boolean" ? args.installed_only : undefined;
        const result = await findSkillsHelper({ query, category, installed_only });

        let summaryText = `Found ${result.total_matches} skills matching criteria (showing top ${result.skills.length}):\n`;
        summaryText += `💡 Default Gateway Skill: 'find-skills' (Use 'fetch_skill_rule' with skill_name='find-skills')\n\n`;
        for (const s of result.skills) {
          const status = s.is_installed ? "✓ [INSTALLED]" : "○ [AVAILABLE]";
          const defFlag = s.is_default ? " ★ DEFAULT" : "";
          summaryText += `${status}${defFlag} ${s.name} (${s.category})\n  ${s.description}\n`;
        }

        return {
          content: [{ type: "text", text: summaryText }],
          structuredContent: result,
        };
      } catch (error: any) {
        throw new McpError(ErrorCode.InternalError, `find_skills failed: ${error?.message || error}`);
      }
    }

    if (name === "get_skill_info") {
      const skillName = args?.skill_name as string | undefined;
      if (!skillName || typeof skillName !== "string") {
        throw new McpError(ErrorCode.InvalidParams, "skill_name parameter is required and must be a string.");
      }
      try {
        const info = await getSkillInfoHelper(skillName);
        return {
          content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
          structuredContent: info,
        };
      } catch (error: any) {
        throw new McpError(ErrorCode.InternalError, `get_skill_info failed: ${error?.message || error}`);
      }
    }

    if (name === "install_skill") {
      const skillName = args?.skill_name as string | undefined;
      if (!skillName || typeof skillName !== "string") {
        throw new McpError(ErrorCode.InvalidParams, "skill_name parameter is required and must be a string.");
      }
      try {
        const res = await installSkillHelper({
          skill_name: skillName,
          source: typeof args?.source === "string" ? args.source : undefined,
          content: typeof args?.content === "string" ? args.content : undefined,
          description: typeof args?.description === "string" ? args.description : undefined,
          category: typeof args?.category === "string" ? args.category : undefined,
        });
        return {
          content: [{ type: "text", text: res.message }],
          structuredContent: res,
        };
      } catch (error: any) {
        throw new McpError(ErrorCode.InternalError, `install_skill failed: ${error?.message || error}`);
      }
    }

    if (name === "uninstall_skill") {
      const skillName = args?.skill_name as string | undefined;
      if (!skillName || typeof skillName !== "string") {
        throw new McpError(ErrorCode.InvalidParams, "skill_name parameter is required and must be a string.");
      }
      try {
        const res = await uninstallSkillHelper(skillName);
        return {
          content: [{ type: "text", text: res.message }],
          structuredContent: res,
        };
      } catch (error: any) {
        throw new McpError(ErrorCode.InternalError, `uninstall_skill failed: ${error?.message || error}`);
      }
    }

    if (name === "list_skills") {
      try {
        const allSkills = await getValidSkillsList();
        const query = typeof args?.query === "string" ? args.query.trim().toLowerCase() : "";

        // Ensure default skill find-skills is always at top
        const sortedSkills = [...allSkills].sort((a, b) => {
          if (a === "find-skills") return -1;
          if (b === "find-skills") return 1;
          return a.localeCompare(b);
        });

        const filteredSkills = query
          ? sortedSkills.filter((s) => s.toLowerCase().includes(query))
          : sortedSkills;

        if (filteredSkills.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: query
                  ? `No skills found matching query '${query}'. Use 'find_skills' to search the full online catalog (580+ skills).`
                  : "No valid skills with markdown rules found in the library.",
              },
            ],
            structuredContent: { default_skill: "find-skills", skills: [], count: 0 },
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Available skills (${filteredSkills.length}${query ? ` matching '${query}'` : ""}):\n★ [DEFAULT] find-skills (Master Skill Discovery)\n${filteredSkills.filter(s => s !== "find-skills").join("\n")}`,
            },
          ],
          structuredContent: { default_skill: "find-skills", skills: filteredSkills, count: filteredSkills.length },
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
      const targetDir = await findSkillDirectory(cleanSkillName);

      if (!targetDir) {
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
  const { isHttpMode, port } = determineExecutionMode();

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
        `Skill Library MCP Server v1.1.0 (HTTP + SSE + RBAC) listening on 0.0.0.0:${port}! Serving from: ${SKILLS_DIRS.join(", ")}`
      );
    });
  } else {
    // Stdio mode: Defaults to full admin (local execution)
    const stdioServer = createMcpServerInstance("admin");
    const transport = new StdioServerTransport();
    await stdioServer.connect(transport);
    console.error(`Skill Library MCP Server v1.1.0 (stdio) is running! Serving from: ${SKILLS_DIRS.join(", ")}`);
  }
}

run().catch(console.error);
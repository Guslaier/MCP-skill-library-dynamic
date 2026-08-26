import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import { promises as fsPromises } from "fs";
import path from "path";

// ── Configuration ──────────────────────────────────────────────
const SKILLS_DIR = process.env.SKILLS_DIR || path.resolve(process.cwd(), ".agents", "skills");

if (!fs.existsSync(SKILLS_DIR)) {
  console.error(`[ERROR] SKILLS_DIR does not exist: ${SKILLS_DIR}`);
  console.error(
    `[HINT]  Set the SKILLS_DIR environment variable to your skills folder, or create the .agents/skills directory.`
  );
  process.exit(1);
}

// ── Global Error & Shutdown Handlers ───────────────────────────
process.on("uncaughtException", (err: Error) => {
  console.error("[FATAL] Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason: unknown) => {
  console.error("[FATAL] Unhandled Rejection:", reason);
});

// ── Server ─────────────────────────────────────────────────────
const server = new Server(
  {
    name: "skill-library-mcp",
    version: "1.0.0",
  },
  {
    capabilities: { tools: {} },
  }
);

process.on("SIGINT", async () => {
  console.error("Shutting down MCP server...");
  await server.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.error("Shutting down MCP server...");
  await server.close();
  process.exit(0);
});

// ── Cache State ────────────────────────────────────────────────
let cachedSkillsList: string[] | null = null;
let skillsCacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds cache for directory listing

// ── Tool definitions ───────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_skills",
        description:
          "List all available skills/rules in the knowledge base. Returns folder names.",
        inputSchema: { type: "object", properties: {} },
        outputSchema: {
          type: "object",
          properties: {
            skills: { type: "array", items: { type: "string" } },
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
          "Fetch the full markdown content of a specific skill to learn how to do a task.",
        inputSchema: {
          type: "object",
          properties: {
            skill_name: {
              type: "string",
              description: "Exact name of the skill folder (e.g., 'code-review')",
            },
          },
          required: ["skill_name"],
        },
        outputSchema: {
          type: "object",
          properties: {
            skill_name: { type: "string" },
            file: { type: "string" },
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
    ],
  };
});

// ── Tool handlers ──────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "list_skills") {
    try {
      const now = Date.now();
      // TTL Cache check
      if (cachedSkillsList && now - skillsCacheTimestamp < CACHE_TTL_MS) {
        if (cachedSkillsList.length === 0) {
          return {
            content: [{ type: "text", text: "No skills found in the library." }],
            structuredContent: { skills: [] },
          };
        }
        return {
          content: [
            {
              type: "text",
              text: `Available skills (${cachedSkillsList.length}):\n${cachedSkillsList.join("\n")}`,
            },
          ],
          structuredContent: { skills: cachedSkillsList },
        };
      }

      // Cache miss, read dynamically using async methods
      const dirents = await fsPromises.readdir(SKILLS_DIR, { withFileTypes: true });
      const skills = dirents
        .filter((dirent: fs.Dirent) => dirent.isDirectory())
        .map((dirent: fs.Dirent) => dirent.name)
        .sort();

      // Update Cache
      cachedSkillsList = skills;
      skillsCacheTimestamp = Date.now();

      if (skills.length === 0) {
        return {
          content: [{ type: "text", text: "No skills found in the library." }],
          structuredContent: { skills: [] },
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Available skills (${skills.length}):\n${skills.join("\n")}`,
          },
        ],
        structuredContent: { skills },
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
      throw new McpError(
        ErrorCode.InvalidParams,
        "Invalid skill_name."
      );
    }

    // Security check: Path Traversal Prevention
    const resolvedSkillsDir = path.resolve(SKILLS_DIR);
    const targetDir = path.resolve(SKILLS_DIR, skillName);
    
    // Ensure the resolved target directory is strictly inside the skills directory
    if (!targetDir.startsWith(resolvedSkillsDir + path.sep)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Invalid skill_name path traversal detected."
      );
    }

    try {
      try {
        const stat = await fsPromises.stat(targetDir);
        if (!stat.isDirectory()) {
          throw new Error("Not a directory");
        }
      } catch (err) {
        throw new Error("Directory does not exist");
      }

      const files = await fsPromises.readdir(targetDir);
      const mdFile = files.find((f: string) => f.endsWith(".md")) || files[0];

      if (!mdFile) {
        throw new Error("No markdown file found");
      }

      // Memory-safe asynchronous file read
      const content = await fsPromises.readFile(path.join(targetDir, mdFile), "utf-8");
      return {
        content: [
          {
            type: "text",
            text: `--- RULE FOR: ${skillName} ---\n\n${content}`,
          },
        ],
        structuredContent: {
          skill_name: skillName,
          file: mdFile,
          content,
        },
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Skill '${skillName}' not found or unreadable. Check that the folder exists in ${SKILLS_DIR} and contains a .md file.`
      );
    }
  }

  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
});

// ── Run ────────────────────────────────────────────────────────
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Skill Library MCP Server is running!");
}

run().catch(console.error);
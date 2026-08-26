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
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Configuration & Robust Path Resolution ────────────────────
function resolveSkillsDir(): string {
  if (process.env.SKILLS_DIR && fs.existsSync(process.env.SKILLS_DIR)) {
    return path.resolve(process.env.SKILLS_DIR);
  }
  // Try relative to dist/ directory (../../.agents/skills or ../.agents/skills)
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
    version: "1.1.0",
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

// ── Cache State ────────────────────────────────────────────────
let cachedSkillsList: string[] | null = null;
let skillsCacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds cache for directory listing

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

// ── Tool definitions ───────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
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
    ],
  };
});

// ── Tool handlers ──────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

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
      throw new McpError(
        ErrorCode.InvalidParams,
        "Invalid skill_name parameter."
      );
    }

    // Security check: Path Traversal Prevention
    const resolvedSkillsDir = path.resolve(SKILLS_DIR);
    const targetDir = path.resolve(SKILLS_DIR, skillName);

    if (!targetDir.startsWith(resolvedSkillsDir + path.sep)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Invalid skill_name: Path traversal detected."
      );
    }

    try {
      const stat = await fsPromises.stat(targetDir);
      if (!stat.isDirectory()) {
        throw new Error("Target is not a directory");
      }
    } catch {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Skill folder '${skillName}' not found in ${SKILLS_DIR}.`
      );
    }

    try {
      const mdFiles = await getMarkdownFiles(targetDir);

      if (mdFiles.length === 0) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Skill '${skillName}' does not contain any valid Markdown (.md) rule files.`
        );
      }

      // Sort files so that SKILL.md / main instructions appear first
      mdFiles.sort((a, b) => {
        const baseA = path.basename(a).toLowerCase();
        const baseB = path.basename(b).toLowerCase();
        if (baseA === "skill.md" || baseA === "instructions.md") return -1;
        if (baseB === "skill.md" || baseB === "instructions.md") return 1;
        return a.localeCompare(b);
      });

      const contents: string[] = [];
      const relativeFilePaths: string[] = [];

      for (const filePath of mdFiles) {
        const relativePath = path.relative(targetDir, filePath);
        relativeFilePaths.push(relativePath);
        const text = await fsPromises.readFile(filePath, "utf-8");
        contents.push(`### [File: ${relativePath}]\n\n${text}`);
      }

      const combinedContent = contents.join("\n\n---\n\n");

      return {
        content: [
          {
            type: "text",
            text: `--- RULES FOR: ${skillName} (${mdFiles.length} file(s)) ---\n\n${combinedContent}`,
          },
        ],
        structuredContent: {
          skill_name: skillName,
          files: relativeFilePaths,
          content: combinedContent,
        },
      };
    } catch (error: any) {
      if (error instanceof McpError) throw error;
      throw new McpError(
        ErrorCode.InternalError,
        `Error reading skill '${skillName}': ${error.message}`
      );
    }
  }

  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
});

// ── Run ────────────────────────────────────────────────────────
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Skill Library MCP Server v1.1.0 is running! Serving from: ${SKILLS_DIR}`);
}

run().catch(console.error);
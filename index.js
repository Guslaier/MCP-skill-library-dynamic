import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ── Configuration ──────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use SKILLS_DIR from env if provided, otherwise default to local 'skills' folder
const SKILLS_DIR = process.env.SKILLS_DIR || path.join(__dirname, ".agents", "skills");

// Create skills directory if it doesn't exist
if (!fs.existsSync(SKILLS_DIR)) {
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
}

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
      const skills = fs
        .readdirSync(SKILLS_DIR)
        .filter((file) => fs.statSync(path.join(SKILLS_DIR, file)).isDirectory())
        .sort();

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
    const skillName = args?.skill_name;

    if (
      !skillName ||
      typeof skillName !== "string" ||
      skillName.includes("..") ||
      skillName.includes("/") ||
      skillName.includes("\\")
    ) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Invalid skill_name. Must be a simple folder name (no '..', '/', or '\\')."
      );
    }

    const targetDir = path.join(SKILLS_DIR, skillName);

    try {
      if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
        throw new Error("Not a directory");
      }

      const files = fs.readdirSync(targetDir);
      const mdFile = files.find((f) => f.endsWith(".md")) || files[0];

      if (!mdFile) {
        throw new Error("No markdown file found");
      }

      const content = fs.readFileSync(path.join(targetDir, mdFile), "utf-8");
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
        `Skill '${skillName}' not found or unreadable. Check that the folder exists in the skills folder and contains a .md file.`
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
  console.error(`Skills directory is set to: ${SKILLS_DIR}`);
}

run().catch(console.error);

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

// ── Configuration ──────────────────────────────────────────────
const SKILLS_DIR = process.env.SKILLS_DIR || path.resolve(process.cwd(), ".agents", "skills");

if (!fs.existsSync(SKILLS_DIR)) {
  console.error(`[ERROR] SKILLS_DIR does not exist: ${SKILLS_DIR}`);
  console.error(
    `[HINT]  Set the SKILLS_DIR environment variable to your skills folder, or create the .agents/skills directory.`
  );
  process.exit(1);
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
    const skillName = args?.skill_name as string | undefined;

    if (
      !skillName ||
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
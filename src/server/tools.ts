import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { sessionToolDefinitions, authToolDefinitions } from "../modules/index.js";
import { systemStatusTool } from "../common/index.js";

export const publicAiTools: Tool[] = [
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

export const adminOnlyTools: Tool[] = [
  ...sessionToolDefinitions,
  ...authToolDefinitions,
  systemStatusTool,
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

export function getActiveTools(role: "admin" | "standard" = "standard"): Tool[] {
  return role === "admin" ? [...publicAiTools, ...adminOnlyTools] : publicAiTools;
}

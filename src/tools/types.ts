import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface McpToolHandler {
  definition: Tool;
  role: "admin" | "standard";
  execute: (
    args: any,
    role: "admin" | "standard"
  ) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    structuredContent?: any;
  }>;
}

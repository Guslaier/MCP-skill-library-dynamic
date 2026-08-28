import { McpError, ErrorCode, type Tool } from "@modelcontextprotocol/sdk/types.js";
import { skillTools } from "./skills/index.js";
import { authTools } from "./auth/index.js";
import { sessionTools } from "./session/index.js";
import { serviceTools } from "./service/index.js";
import { systemTools } from "./system/index.js";
import type { McpToolHandler } from "./types.js";

export * from "./types.js";
export * from "./skills/index.js";
export * from "./auth/index.js";
export * from "./session/index.js";
export * from "./service/index.js";
export * from "./system/index.js";

const allToolHandlers: McpToolHandler[] = [
  ...skillTools,
  ...authTools,
  ...sessionTools,
  ...serviceTools,
  ...systemTools,
];

const toolMap = new Map<string, McpToolHandler>();
for (const handler of allToolHandlers) {
  toolMap.set(handler.definition.name, handler);
}

/**
 * Returns tool schemas according to caller's role (Standard AI vs Admin).
 */
export function getActiveTools(role: "admin" | "standard" = "standard"): Tool[] {
  return allToolHandlers
    .filter((handler) => role === "admin" || handler.role === "standard")
    .map((handler) => handler.definition);
}

/**
 * Executes a tool by name with RBAC permission validation.
 */
export async function executeTool(
  name: string,
  args: any,
  role: "admin" | "standard" = "standard"
): Promise<{ content: Array<{ type: "text"; text: string }>; structuredContent?: any }> {
  const handler = toolMap.get(name);
  if (!handler) {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }

  if (handler.role === "admin" && role !== "admin") {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Unauthorized: Admin privileges required for tool '${name}'.`
    );
  }

  return await handler.execute(args, role);
}

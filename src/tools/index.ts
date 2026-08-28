import { McpError, ErrorCode, type Tool } from "@modelcontextprotocol/sdk/types.js";
import { skillTools } from "./skills/index.js";
import type { McpToolHandler } from "./types.js";

export * from "./types.js";
export * from "./skills/index.js";

const allToolHandlers: McpToolHandler[] = [...skillTools];

const toolMap = new Map<string, McpToolHandler>();
for (const handler of allToolHandlers) {
  toolMap.set(handler.definition.name, handler);
}

/**
 * Returns all active skill tools schemas.
 */
export function getActiveTools(): Tool[] {
  return allToolHandlers.map((handler) => handler.definition);
}

/**
 * Executes a skill tool by name.
 */
export async function executeTool(
  name: string,
  args: any
): Promise<{ content: Array<{ type: "text"; text: string }>; structuredContent?: any }> {
  const handler = toolMap.get(name);
  if (!handler) {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }

  return await handler.execute(args, "standard");
}

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getActiveTools } from "./tools.js";
import { handleToolCall } from "./handlers.js";

/**
 * Creates and configures a new Model Context Protocol Server instance.
 */
export function createMcpServerInstance(role: "admin" | "standard" = "standard"): Server {
  const srv = new Server(
    { name: "skill-library-mcp", version: "1.1.0" },
    { capabilities: { tools: {} } }
  );

  const activeTools = getActiveTools(role);

  srv.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: activeTools,
    };
  });

  srv.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return await handleToolCall(name, args, role);
  });

  return srv;
}

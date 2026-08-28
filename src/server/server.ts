import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getActiveTools, executeTool } from "../tools/index.js";

/**
 * Creates and configures a new Model Context Protocol Server instance.
 */
export function createMcpServerInstance(): Server {
  const srv = new Server(
    { name: "skill-library-mcp", version: "1.1.0" },
    { capabilities: { tools: {} } }
  );

  const activeTools = getActiveTools();

  srv.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: activeTools,
    };
  });

  srv.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return await executeTool(name, args);
  });

  return srv;
}

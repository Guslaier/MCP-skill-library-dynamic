import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import {
  sessionCreate,
  sessionGet,
  sessionList,
  sessionDelete,
  sessionToolDefinitions,
} from "../../modules/index.js";
import type { McpToolHandler } from "../types.js";

export const sessionTools: McpToolHandler[] = sessionToolDefinitions.map((def) => ({
  definition: def,
  role: "admin",
  execute: async (args: any) => {
    try {
      const result =
        def.name === "session_create" ? await sessionCreate(args) :
        def.name === "session_get" ? await sessionGet(args) :
        def.name === "session_delete" ? await sessionDelete(args) :
        await sessionList();

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } catch (error: any) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, `Session tool '${def.name}' failed: ${error?.message || error}`);
    }
  },
}));

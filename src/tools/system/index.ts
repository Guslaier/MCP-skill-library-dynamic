import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { getSystemStatusData, systemStatusTool } from "../../common/index.js";
import type { McpToolHandler } from "../types.js";

export const systemTools: McpToolHandler[] = [
  {
    definition: systemStatusTool,
    role: "admin",
    execute: async () => {
      try {
        const data = await getSystemStatusData();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          structuredContent: data,
        };
      } catch (error: any) {
        throw new McpError(ErrorCode.InternalError, `system_status failed: ${error?.message || error}`);
      }
    },
  },
];

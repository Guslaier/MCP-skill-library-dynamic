import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import {
  oauthGenerateKey,
  oauthValidateKey,
  oauthListKeys,
  oauthRegenKey,
  oauthDeleteKey,
  authToolDefinitions,
} from "../../modules/index.js";
import type { McpToolHandler } from "../types.js";

export const authTools: McpToolHandler[] = authToolDefinitions.map((def) => ({
  definition: def,
  role: "admin",
  execute: async (args: any) => {
    try {
      const result =
        def.name === "oauth_generate_key" ? await oauthGenerateKey(args) :
        def.name === "oauth_validate_key" ? await oauthValidateKey(args) :
        def.name === "oauth_regen_key" ? await oauthRegenKey(args) :
        def.name === "oauth_delete_key" ? await oauthDeleteKey(args) :
        await oauthListKeys();

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } catch (error: any) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, `OAuth tool '${def.name}' failed: ${error?.message || error}`);
    }
  },
}));

import { McpError, ErrorCode, type Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  serviceStart,
  serviceStop,
  serviceList,
} from "../../modules/index.js";
import type { McpToolHandler } from "../types.js";

const serviceListDef: Tool = {
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
};

const serviceStartDef: Tool = {
  name: "service_start",
  description: "Start (open) a service by registering it in the service registry.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Unique service name" },
      command: { type: "string", description: "Optional command" },
      port: { type: "number", description: "Optional port" },
    },
    required: ["name"],
  },
};

const serviceStopDef: Tool = {
  name: "service_stop",
  description: "Stop (close) a running service by its name or ID.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Service name or ID" },
    },
    required: ["name"],
  },
};

export const serviceTools: McpToolHandler[] = [
  {
    definition: serviceListDef,
    role: "admin",
    execute: async () => {
      try {
        const result = await serviceList();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (error: any) {
        if (error instanceof McpError) throw error;
        throw new McpError(ErrorCode.InternalError, `service_list failed: ${error?.message || error}`);
      }
    },
  },
  {
    definition: serviceStartDef,
    role: "admin",
    execute: async (args: any) => {
      try {
        const result = await serviceStart(args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (error: any) {
        if (error instanceof McpError) throw error;
        throw new McpError(ErrorCode.InternalError, `service_start failed: ${error?.message || error}`);
      }
    },
  },
  {
    definition: serviceStopDef,
    role: "admin",
    execute: async (args: any) => {
      try {
        const result = await serviceStop(args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (error: any) {
        if (error instanceof McpError) throw error;
        throw new McpError(ErrorCode.InternalError, `service_stop failed: ${error?.message || error}`);
      }
    },
  },
];

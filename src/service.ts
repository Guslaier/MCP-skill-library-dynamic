import path from "node:path";
import { McpError, ErrorCode, Tool } from "@modelcontextprotocol/sdk/types.js";
import { resolveDataDir, readJsonFile, writeJsonFile } from "./storage.js";

export interface ServiceRecord {
  id: string;
  name: string;
  command?: string;
  port?: number;
  status: "running" | "stopped";
  startedAt?: string;
  stoppedAt?: string;
}

type ServiceMap = Record<string, ServiceRecord>;

const servicesFile = (): string => path.join(resolveDataDir(), "services.json");

async function loadServices(): Promise<ServiceMap> {
  return readJsonFile<ServiceMap>(servicesFile(), {});
}

function generateNextServiceId(services: ServiceMap): string {
  const numbers: number[] = [];
  for (const s of Object.values(services)) {
    const match = s.id?.match(/(\d+)$/);
    if (match) {
      numbers.push(parseInt(match[1], 10));
    }
  }
  const maxNum = numbers.length > 0 ? Math.max(...numbers) : 0;
  const nextNum = maxNum + 1;
  return `SVC-${String(nextNum).padStart(3, "0")}`;
}

function requireName(args: unknown): string {
  const name = (args as any)?.name;
  if (typeof name !== "string" || name.trim() === "") {
    throw new McpError(ErrorCode.InvalidParams, "name is required (non-empty string)");
  }
  return name.trim();
}

export async function serviceStart(args: unknown) {
  const name = requireName(args);
  const command = typeof (args as any)?.command === "string" ? (args as any).command : undefined;
  const rawPort = (args as any)?.port;
  let port: number | undefined;
  if (rawPort !== undefined && rawPort !== null && rawPort !== "") {
    port = Number(rawPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new McpError(ErrorCode.InvalidParams, "port must be a valid integer between 1 and 65535");
    }
  }

  const services = await loadServices();
  const existing = services[name];

  if (existing && existing.status === "running") {
    throw new McpError(ErrorCode.InvalidParams, `Service "${name}" is already running`);
  }

  // Check duplicate port conflict across all currently running services
  const targetPort = port ?? existing?.port;
  if (targetPort !== undefined) {
    const conflictingService = Object.values(services).find(
      (s) => s.status === "running" && s.port === targetPort && s.name !== name
    );
    if (conflictingService) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Port ${targetPort} is already in use by running service "${conflictingService.name}" (ID: ${conflictingService.id})`
      );
    }
  }

  const now = new Date().toISOString();
  let serviceId = existing?.id;
  // If id is missing or old UUID format, convert to sequential run-number
  if (!serviceId || serviceId.length > 10) {
    serviceId = generateNextServiceId(services);
  }

  const record: ServiceRecord = {
    id: serviceId,
    name,
    command: command ?? existing?.command,
    port: port ?? existing?.port,
    status: "running",
    startedAt: now,
    stoppedAt: undefined,
  };
  services[name] = record;
  await writeJsonFile(servicesFile(), services);
  return { service: record };
}

export async function serviceStop(args: unknown) {
  const nameOrId = (args as any)?.name ?? (args as any)?.id;
  if (!nameOrId || typeof nameOrId !== "string" || nameOrId.trim() === "") {
    throw new McpError(ErrorCode.InvalidParams, "name or id is required (non-empty string)");
  }
  const cleanKey = nameOrId.trim();
  const services = await loadServices();

  let target: ServiceRecord | undefined = services[cleanKey];
  if (!target) {
    target = Object.values(services).find((s) => s.id === cleanKey || s.name === cleanKey);
  }

  if (!target) {
    throw new McpError(ErrorCode.InvalidParams, `Service "${cleanKey}" not found`);
  }
  if (target.status === "stopped") {
    throw new McpError(ErrorCode.InvalidParams, `Service "${target.name}" is already stopped`);
  }

  const stoppedRecord: ServiceRecord = {
    ...target,
    status: "stopped",
    stoppedAt: new Date().toISOString(),
  };
  services[stoppedRecord.name] = stoppedRecord;
  await writeJsonFile(servicesFile(), services);
  return { service: stoppedRecord };
}

export async function serviceList() {
  const services = await loadServices();
  const list = Object.values(services).sort((a, b) => a.id.localeCompare(b.id));
  return { services: list, count: list.length };
}

export const serviceToolDefinitions: Tool[] = [
  {
    name: "service_start",
    description:
      "Start (open) a service by registering it in the service registry. Tracks running state in a JSON file.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Unique service name" },
        command: {
          type: "string",
          description: "Optional command/description associated with the service",
        },
        port: {
          type: "number",
          description: "Optional port number associated with the service (1-65535)",
        },
      },
      required: ["name"],
    },
    outputSchema: {
      type: "object",
      properties: { service: { type: "object" } },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "service_stop",
    description:
      "Stop (close) a running service by its name or ID in the service registry.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Service name or ID (e.g. SVC-001)" },
        id: { type: "string", description: "Optional Service ID (e.g. SVC-001)" },
      },
    },
    outputSchema: {
      type: "object",
      properties: { service: { type: "object" } },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "service_list",
    description:
      "List all registered services with their current status, port, and sequential IDs.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    outputSchema: {
      type: "object",
      properties: {
        services: { type: "array" },
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
import path from "node:path";
import { McpError, ErrorCode, Tool } from "@modelcontextprotocol/sdk/types.js";
import { resolveDataDir, readJsonFile, writeJsonFile } from "./storage.js";

export interface SessionRecord {
  name: string;
  data: unknown;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string; // Optional ISO string for TTL expiration
}

type SessionMap = Record<string, SessionRecord>;

const sessionsFile = (): string => path.join(resolveDataDir(), "sessions.json");

function requireName(args: unknown): string {
  const name = (args as any)?.name;
  if (typeof name !== "string" || name.trim() === "") {
    throw new McpError(ErrorCode.InvalidParams, "name is required (non-empty string)");
  }
  const trimmed = name.trim();
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(trimmed)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "name must match [A-Za-z0-9._-] and be at most 128 characters"
    );
  }
  return trimmed;
}

export async function sessionCreate(args: unknown) {
  const name = requireName(args);
  const data = (args as any)?.data ?? {};
  const ttlSeconds = typeof (args as any)?.ttlSeconds === "number" ? (args as any).ttlSeconds : undefined;
  const sessions = await readJsonFile<SessionMap>(sessionsFile(), {});
  const now = new Date();
  const existing = sessions[name];

  const record: SessionRecord = {
    name,
    data,
    createdAt: existing?.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
    ...(ttlSeconds ? { expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString() } : {}),
  };
  sessions[name] = record;
  await writeJsonFile(sessionsFile(), sessions);
  return { session: record };
}

export async function sessionGet(args: unknown) {
  const name = requireName(args);
  const sessions = await readJsonFile<SessionMap>(sessionsFile(), {});
  const session = sessions[name];
  if (!session) {
    throw new McpError(ErrorCode.InvalidParams, `Session "${name}" not found`);
  }

  // Check TTL expiration
  if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
    delete sessions[name];
    await writeJsonFile(sessionsFile(), sessions);
    throw new McpError(ErrorCode.InvalidParams, `Session "${name}" has expired and was cleaned up`);
  }

  return { session };
}

export async function sessionList() {
  const sessions = await readJsonFile<SessionMap>(sessionsFile(), {});
  const now = Date.now();
  let modified = false;

  // Auto-filter expired sessions
  for (const [name, session] of Object.entries(sessions)) {
    if (session.expiresAt && new Date(session.expiresAt).getTime() < now) {
      delete sessions[name];
      modified = true;
    }
  }

  if (modified) {
    await writeJsonFile(sessionsFile(), sessions);
  }

  const list = Object.values(sessions).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { sessions: list, count: list.length };
}

export async function sessionDelete(args: unknown) {
  const name = requireName(args);
  const sessions = await readJsonFile<SessionMap>(sessionsFile(), {});
  if (!sessions[name]) {
    throw new McpError(ErrorCode.InvalidParams, `Session "${name}" not found`);
  }
  delete sessions[name];
  await writeJsonFile(sessionsFile(), sessions);
  return { deleted: true, name };
}

export async function sessionClear() {
  await writeJsonFile(sessionsFile(), {});
  return { cleared: true };
}

export const sessionToolDefinitions: Tool[] = [
  {
    name: "session_create",
    description:
      "Create or update a JSON session with a user-defined name. Supports optional TTL expiration in seconds.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "User-defined session name (A-Za-z0-9._-, max 128 chars)",
        },
        data: { type: "object", description: "Arbitrary JSON data to store in the session" },
        ttlSeconds: { type: "number", description: "Optional time-to-live in seconds before auto-cleanup" },
      },
      required: ["name"],
    },
    outputSchema: {
      type: "object",
      properties: { session: { type: "object" } },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "session_get",
    description: "Get a session by its user-defined name.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", description: "Session name" } },
      required: ["name"],
    },
    outputSchema: {
      type: "object",
      properties: { session: { type: "object" } },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "session_list",
    description: "List all stored sessions (newest first, auto-cleans expired).",
    inputSchema: { type: "object", properties: {} },
    outputSchema: {
      type: "object",
      properties: {
        sessions: { type: "array", items: { type: "object" } },
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
  {
    name: "session_delete",
    description: "Delete a session by its user-defined name.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", description: "Session name" } },
      required: ["name"],
    },
    outputSchema: {
      type: "object",
      properties: {
        deleted: { type: "boolean" },
        name: { type: "string" },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];
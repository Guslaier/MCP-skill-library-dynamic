import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { McpError, ErrorCode, Tool } from "@modelcontextprotocol/sdk/types.js";
import { resolveDataDir, readJsonFile, writeJsonFile } from "./storage.js";

export interface OAuthKeyRecord {
  id: string;
  label: string;
  keyHash: string; // sha256 hex of the plaintext key (never store plaintext)
  role?: "admin" | "standard";
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
}

type KeyMap = Record<string, OAuthKeyRecord>;

const keysFile = (): string => path.join(resolveDataDir(), "oauth-keys.json");

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function generateNextKeyId(keys: KeyMap): string {
  const numbers: number[] = [];
  for (const k of Object.values(keys)) {
    const match = k.id?.match(/(\d+)$/);
    if (match) {
      numbers.push(parseInt(match[1], 10));
    }
  }
  const maxNum = numbers.length > 0 ? Math.max(...numbers) : 0;
  return `KEY-${String(maxNum + 1).padStart(3, "0")}`;
}

export function generateKey(
  bytes = 32,
  format: "hex" | "base64" | "base64url" = "base64url"
): string {
  return randomBytes(bytes).toString(format);
}

export async function oauthGenerateKey(args: unknown) {
  const label =
    typeof (args as any)?.label === "string" && (args as any).label.trim() !== ""
      ? (args as any).label.trim()
      : "api-token";
  const ttlSeconds =
    typeof (args as any)?.ttlSeconds === "number" && (args as any).ttlSeconds > 0
      ? (args as any).ttlSeconds
      : undefined;
  const role = (args as any)?.role === "admin" ? "admin" : "standard";

  const key = generateKey(32, "base64url");
  const now = new Date().toISOString();
  const keys = await readJsonFile<KeyMap>(keysFile(), {});
  const keyId = generateNextKeyId(keys);

  const record: OAuthKeyRecord = {
    id: keyId,
    label,
    keyHash: hashKey(key),
    role,
    createdAt: now,
    expiresAt: ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000).toISOString() : undefined,
  };

  keys[record.id] = record;
  await writeJsonFile(keysFile(), keys);

  return {
    key,
    record: {
      id: record.id,
      label: record.label,
      role: record.role,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
    },
  };
}

export async function oauthRegenKey(args: unknown) {
  const idOrLabel = (args as any)?.id ?? (args as any)?.label;
  if (!idOrLabel || typeof idOrLabel !== "string" || idOrLabel.trim() === "") {
    throw new McpError(ErrorCode.InvalidParams, "id or label is required");
  }
  const cleanKey = idOrLabel.trim();
  const keys = await readJsonFile<KeyMap>(keysFile(), {});

  let target: OAuthKeyRecord | undefined = keys[cleanKey];
  if (!target) {
    target = Object.values(keys).find((k) => k.id === cleanKey || k.label === cleanKey);
  }
  if (!target) {
    throw new McpError(ErrorCode.InvalidParams, `Key "${cleanKey}" not found`);
  }

  const ttlSeconds =
    typeof (args as any)?.ttlSeconds === "number" && (args as any).ttlSeconds > 0
      ? (args as any).ttlSeconds
      : undefined;

  const newKey = generateKey(32, "base64url");
  target.keyHash = hashKey(newKey);
  target.createdAt = new Date().toISOString();
  target.expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000).toISOString() : target.expiresAt;

  keys[target.id] = target;
  await writeJsonFile(keysFile(), keys);

  return {
    key: newKey,
    record: {
      id: target.id,
      label: target.label,
      role: target.role ?? "standard",
      createdAt: target.createdAt,
      expiresAt: target.expiresAt,
    },
  };
}

export async function oauthDeleteKey(args: unknown) {
  const idOrLabel = (args as any)?.id ?? (args as any)?.label;
  if (!idOrLabel || typeof idOrLabel !== "string" || idOrLabel.trim() === "") {
    throw new McpError(ErrorCode.InvalidParams, "id or label is required");
  }
  const cleanKey = idOrLabel.trim();
  const keys = await readJsonFile<KeyMap>(keysFile(), {});

  let targetId: string | undefined;
  if (keys[cleanKey]) {
    targetId = cleanKey;
  } else {
    const found = Object.values(keys).find((k) => k.id === cleanKey || k.label === cleanKey);
    if (found) targetId = found.id;
  }

  if (!targetId || !keys[targetId]) {
    throw new McpError(ErrorCode.InvalidParams, `Key "${cleanKey}" not found`);
  }

  const deletedRecord = keys[targetId];
  delete keys[targetId];
  await writeJsonFile(keysFile(), keys);

  return {
    deleted: true,
    id: deletedRecord.id,
    label: deletedRecord.label,
  };
}

export async function oauthValidateKey(args: unknown): Promise<{ valid: boolean; role: "admin" | "standard"; record?: OAuthKeyRecord }> {
  const rawKey = (args as any)?.key;
  if (!rawKey || typeof rawKey !== "string") {
    throw new McpError(ErrorCode.InvalidParams, "key is required (string)");
  }
  const key = rawKey.trim();
  const keys = await readJsonFile<KeyMap>(keysFile(), {});
  const now = new Date().toISOString();

  for (const record of Object.values(keys)) {
    const hashed = hashKey(key);
    if (safeEqualHex(hashed, record.keyHash)) {
      if (record.expiresAt && record.expiresAt < now) {
        return { valid: false, role: "standard" };
      }
      record.lastUsedAt = now;
      await writeJsonFile(keysFile(), keys);
      return { valid: true, role: record.role ?? "standard", record };
    }
  }

  return { valid: false, role: "standard" };
}

export async function oauthListKeys() {
  const keys = await readJsonFile<KeyMap>(keysFile(), {});
  const list = Object.values(keys).map((k) => ({
    id: k.id,
    label: k.label,
    role: k.role ?? "standard",
    createdAt: k.createdAt,
    expiresAt: k.expiresAt,
    lastUsedAt: k.lastUsedAt,
  }));
  return { keys: list, count: list.length };
}

export const authToolDefinitions: Tool[] = [
  {
    name: "oauth_generate_key",
    description: "Generate a new high-entropy OAuth API key/token with optional TTL expiry and role.",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string", description: "Descriptive name for the key (e.g. 'ci-bot')" },
        ttlSeconds: { type: "number", description: "Time-to-live in seconds. Omit for permanent key." },
        role: { type: "string", enum: ["admin", "standard"], description: "Role permission level (default: 'standard')" },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        key: { type: "string" },
        record: { type: "object" },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "oauth_regen_key",
    description: "Regenerate an existing API key token while keeping the same key ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Key ID (e.g. 'KEY-001')" },
        label: { type: "string", description: "Key label name" },
        ttlSeconds: { type: "number", description: "Optional new TTL in seconds" },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        key: { type: "string" },
        record: { type: "object" },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "oauth_delete_key",
    description: "Delete an existing API key by ID or label.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Key ID (e.g. 'KEY-001')" },
        label: { type: "string", description: "Key label name" },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        deleted: { type: "boolean" },
        id: { type: "string" },
        label: { type: "string" },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "oauth_validate_key",
    description: "Validate a plaintext OAuth token against stored sha256 hash.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "The plaintext API key to validate" },
      },
      required: ["key"],
    },
    outputSchema: {
      type: "object",
      properties: {
        valid: { type: "boolean" },
        role: { type: "string" },
        record: { type: "object" },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "oauth_list_keys",
    description: "List metadata of all stored OAuth keys (never exposes hashes or plaintext).",
    inputSchema: { type: "object", properties: {} },
    outputSchema: {
      type: "object",
      properties: {
        keys: { type: "array", items: { type: "object" } },
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

import fs from "fs";
import path from "path";
import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { oauthValidateKey } from "../modules/index.js";

/**
 * Resolves static fallback Bearer token from env, .mcp-token, or setting_mcp.json.
 */
export function resolveFallbackToken(): string | null {
  if (process.env.SKILL_LIBRARY_API_TOKEN) {
    return process.env.SKILL_LIBRARY_API_TOKEN;
  }
  const tokenFile = path.resolve(process.cwd(), ".mcp-token");
  if (fs.existsSync(tokenFile)) {
    return fs.readFileSync(tokenFile, "utf-8").trim();
  }
  const settingFile = path.resolve(process.cwd(), "setting_mcp.json");
  if (fs.existsSync(settingFile)) {
    try {
      const config = JSON.parse(fs.readFileSync(settingFile, "utf-8"));
      return (
        config?.token ??
        config?.mcpServers?.["skill-library-mcp"]?.env?.SKILL_LIBRARY_API_TOKEN ??
        null
      );
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Validates incoming Bearer token dynamically against:
 * 1. .data/oauth-keys.json (Checks role: 'admin' vs 'standard')
 * 2. Fallback static token (Always granted 'admin' role)
 */
export async function validateBearerTokenAsync(
  req: IncomingMessage,
  fallbackToken?: string | null
): Promise<{ valid: boolean; role: "admin" | "standard" }> {
  const authHeader = req.headers.authorization ?? "";
  if (!authHeader.startsWith("Bearer ")) return { valid: false, role: "standard" };
  const provided = authHeader.slice(7).trim();
  if (!provided) return { valid: false, role: "standard" };

  // 1. Check against dynamic OAuth Keys in .data/oauth-keys.json
  try {
    const res = await oauthValidateKey({ key: provided });
    if (res.valid) {
      return { valid: true, role: res.role };
    }
  } catch {
    // ignore
  }

  // 2. Check against fallback master token (Full Admin)
  if (fallbackToken) {
    const a = Buffer.from(provided);
    const b = Buffer.from(fallbackToken);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return { valid: true, role: "admin" };
    }
  }

  return { valid: false, role: "standard" };
}

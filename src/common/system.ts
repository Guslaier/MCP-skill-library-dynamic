import os from "node:os";
import path from "node:path";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { resolveDataDir, readJsonFile } from "../modules/index.js";

/**
 * Get network IP info (LAN/Tailscale/Localhost) and recent activity logs from the MCP dashboard.
 */
export async function getSystemStatusData() {
  const dataDir = resolveDataDir();
  const hostname = os.hostname();
  const nets = os.networkInterfaces();
  const outboundIPs: { name: string; ip: string }[] = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        outboundIPs.push({ name, ip: net.address });
      }
    }
  }

  interface ActivityLog {
    time: string;
    type: "SERVICE" | "OAUTH" | "SESSION";
    message: string;
  }
  const activityLogs: ActivityLog[] = [];

  try {
    const services = await readJsonFile<Record<string, any>>(path.join(dataDir, "services.json"), {});
    const sessions = await readJsonFile<Record<string, any>>(path.join(dataDir, "sessions.json"), {});
    const oauthKeys = await readJsonFile<Record<string, any>>(path.join(dataDir, "oauth-keys.json"), {});

    for (const [sname, s] of Object.entries(services)) {
      if (s.startedAt) activityLogs.push({ time: s.startedAt, type: "SERVICE", message: `Service "${sname}" started ${s.port ? `on port ${s.port}` : ""}` });
      if (s.stoppedAt) activityLogs.push({ time: s.stoppedAt, type: "SERVICE", message: `Service "${sname}" stopped` });
    }
    for (const [sname, s] of Object.entries(sessions)) {
      if (s.updatedAt || s.createdAt) activityLogs.push({ time: s.updatedAt || s.createdAt, type: "SESSION", message: `Session "${sname}" updated/saved` });
    }
    for (const [kid, k] of Object.entries(oauthKeys)) {
      if (k.lastUsedAt) activityLogs.push({ time: k.lastUsedAt, type: "OAUTH", message: `Key "${k.label || kid.slice(0, 8)}" validated successfully` });
      if (k.createdAt) activityLogs.push({ time: k.createdAt, type: "OAUTH", message: `Key "${k.label || kid.slice(0, 8)}" generated` });
    }
  } catch {}

  activityLogs.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  return {
    hostname,
    localIp: "127.0.0.1",
    networkInterfaces: outboundIPs,
    recentLogs: activityLogs.slice(0, 10),
  };
}

export const systemStatusTool: Tool = {
  name: "system_status",
  description: "Get network IP info (LAN/Tailscale/Localhost) and recent activity logs from the MCP dashboard.",
  inputSchema: { type: "object", properties: {} },
  outputSchema: {
    type: "object",
    properties: {
      hostname: { type: "string" },
      localIp: { type: "string" },
      networkInterfaces: { type: "array", items: { type: "object" } },
      recentLogs: { type: "array", items: { type: "object" } },
    },
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

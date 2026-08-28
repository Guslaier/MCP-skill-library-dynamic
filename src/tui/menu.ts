import * as readline from "node:readline";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  serviceStart,
  serviceStop,
  serviceList,
  type ServiceRecord,
  oauthGenerateKey,
  oauthValidateKey,
  oauthListKeys,
  oauthRegenKey,
  oauthDeleteKey,
  sessionCreate,
  sessionGet,
  sessionList,
  sessionDelete,
  resolveDataDir,
  readJsonFile,
} from "../modules/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly ensure terminal mouse tracking is completely OFF (allows native copy/paste)
if (process.stdout.isTTY) {
  process.stdout.write("\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?25h");
}

// ── Colors & Styles ──────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  bgCyan: "\x1b[46m\x1b[30m",
  bgBlue: "\x1b[44m\x1b[37m",
  bgGreen: "\x1b[42m\x1b[30m",
  bgRed: "\x1b[41m\x1b[37m",
  inverse: "\x1b[7m",
};

// ── Server Config State ──────────────────────────────────────
let serverConfig = {
  name: "mcp-server",
  port: 8787,
  command: "node dist/index.js",
};

// ── Helper: Network IP Detection ──────────────────────────────
function getOutboundIPs(): { name: string; ip: string }[] {
  const nets = os.networkInterfaces();
  const results: { name: string; ip: string }[] = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        results.push({ name, ip: net.address });
      }
    }
  }
  return results;
}

function clearScreen() {
  process.stdout.write("\x1b[2J\x1b[0f");
}

async function renderHeaderWidget() {
  const dataDir = resolveDataDir();
  let serverStatus = `${C.red}○ OFFLINE${C.reset}`;
  let runningCount = 0;
  let skillCount = 0;

  try {
    const services = await readJsonFile<Record<string, any>>(path.join(dataDir, "services.json"), {});

    for (const s of Object.values(services)) {
      if (s.status === "running") {
        runningCount++;
        if (s.name === serverConfig.name || s.port === serverConfig.port) {
          serverStatus = `${C.green}● ONLINE (Port ${serverConfig.port})${C.reset}`;
        }
      }
    }

    const skillsDir = path.resolve(__dirname, "..", "..", ".agents", "skills");
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    skillCount = entries.filter((e) => e.isDirectory()).length;
  } catch {
    // ignore
  }

  console.log(`${C.cyan}╔══════════════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.cyan}║  ${C.bold}${C.green}⚡ SKILL LIBRARY MCP — CONTROL DASHBOARD${C.cyan}                            ║${C.reset}`);
  console.log(`${C.cyan}╠══════════════════════════════════════════════════════════════════════╣${C.reset}`);
  console.log(`${C.cyan}║${C.reset}  MCP Status: ${serverStatus.padEnd(28)} Skills: ${C.bold}${skillCount.toString().padEnd(4)}${C.reset} Active Services: ${C.bold}${runningCount.toString()}${C.reset}   ${C.cyan}║${C.reset}`);
  console.log(`${C.cyan}╚══════════════════════════════════════════════════════════════════════╝${C.reset}`);
}

export interface MenuItem {
  key: string;
  label: string;
  desc?: string;
  badge?: string;
}

/**
 * Clean Arrow Key & Single Keypress Interactive Menu
 * - Supports ⬆️  ⬇️  Arrow navigation + Enter
 * - Supports instant keypress (1, 2, P, 0, etc.)
 * - Zero mouse tracking (Allows full native mouse copy & paste)
 */
async function selectInteractiveMenu(
  title: string,
  items: MenuItem[],
  headerRender?: () => Promise<void>
): Promise<string> {
  if (!process.stdin.isTTY) {
    return items[0]?.key || "0";
  }

  let selectedIndex = 0;

  async function drawMenu() {
    clearScreen();
    if (headerRender) {
      await headerRender();
    }
    console.log(`\n${C.bold}${title}${C.reset}\n`);
    console.log(`${C.dim}⬆️  ⬇️  Use Arrow Keys + Enter | Or press shortcut keys [0-9, P] directly${C.reset}\n`);

    items.forEach((item, index) => {
      const isSelected = index === selectedIndex;
      const cursor = isSelected ? `${C.bold}${C.green} ➜ ${C.reset}` : "   ";
      const keyTag = `[${item.key}]`;
      const badge = item.badge ? ` ${item.badge}` : "";
      const desc = item.desc ? ` ${C.dim}${item.desc}${C.reset}` : "";

      if (isSelected) {
        console.log(`${cursor}${C.inverse}${C.bold} ${keyTag} ${item.label} ${C.reset}${badge}${desc}`);
      } else {
        console.log(`${cursor}${C.bold}${C.yellow}${keyTag}${C.reset} ${item.label}${badge}${desc}`);
      }
    });

    console.log(`\n${C.dim}────────────────────────────────────────────────────────────────────────${C.reset}`);
  }

  await drawMenu();

  return new Promise<string>((resolve) => {
    process.stdout.write("\x1b[?25l");
    process.stdin.setRawMode(true);
    process.stdin.resume();

    function onData(data: Buffer) {
      const input = data.toString();

      if (input === "\u0003") {
        cleanup();
        process.exit(0);
      }

      if (input === "\x1b[A" || input === "\x1bOA" || input === "k" || input === "K") {
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        drawMenu();
        return;
      }

      if (input === "\x1b[B" || input === "\x1bOB" || input === "j" || input === "J") {
        selectedIndex = (selectedIndex + 1) % items.length;
        drawMenu();
        return;
      }

      if (input === "\r" || input === "\n" || input === " ") {
        cleanup();
        resolve(items[selectedIndex].key);
        return;
      }

      const matched = items.find(
        (it) => it.key.toLowerCase() === input.trim().toLowerCase()
      );
      if (matched) {
        cleanup();
        resolve(matched.key);
        return;
      }
    }

    function cleanup() {
      process.stdin.removeListener("data", onData);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdout.write("\x1b[?25h");
    }

    process.stdin.on("data", onData);
  });
}

function promptText(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(`${C.yellow}${question}${C.reset}`, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function pause(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(`\n${C.dim}Press Enter to continue...${C.reset}`, () => {
      rl.close();
      resolve();
    });
  });
}

// ── 1. Server Switchboard & Port Config ───────────────────────
async function handleServerSwitchboard() {
  let inMenu = true;

  while (inMenu) {
    const data = await serviceList();
    const active = data.services.find((s) => s.name === serverConfig.name || s.port === serverConfig.port);
    const isRunning = active?.status === "running";

    const statusBadge = isRunning
      ? `${C.bgGreen}${C.bold} RUNNING ⚡ ${C.reset}`
      : `${C.dim}[ STOPPED ○ ]${C.reset}`;

    const items: MenuItem[] = [
      {
        key: "1",
        label: isRunning ? "🛑 STOP Server" : "⚡ START Server",
        desc: `Port ${serverConfig.port}`,
      },
      {
        key: "P",
        label: "⚙️  Change Port",
        desc: `Current: ${serverConfig.port}`,
      },
      {
        key: "0",
        label: "↩️  Back to Main Menu",
      },
    ];

    const choice = await selectInteractiveMenu(
      `⚡ MCP SERVER CONTROL (Status: ${statusBadge} Port: ${serverConfig.port})`,
      items,
      renderHeaderWidget
    );

    if (choice === "0") {
      inMenu = false;
      break;
    } else if (choice === "1") {
      if (isRunning) {
        console.log(`\n${C.yellow}🛑 Stopping MCP Server...${C.reset}`);
        try {
          await serviceStop({ name: active.name });
          console.log(`${C.green}✅ Server is now STOPPED.${C.reset}`);
        } catch (err: any) {
          console.log(`${C.red}❌ Error: ${err.message}${C.reset}`);
        }
      } else {
        console.log(`\n${C.green}⚡ Starting MCP Server on Port ${serverConfig.port}...${C.reset}`);
        try {
          const res = await serviceStart({
            name: serverConfig.name,
            command: serverConfig.command,
            port: serverConfig.port,
          });
          console.log(`${C.green}✅ Server is now RUNNING on Port ${serverConfig.port} (ID: ${res.service.id})!${C.reset}`);
        } catch (err: any) {
          console.log(`${C.red}❌ Error: ${err.message}${C.reset}`);
        }
      }
      await pause();
    } else if (choice.toUpperCase() === "P") {
      const newPortStr = await promptText(`Enter new Port (1-65535, current: ${serverConfig.port}): `);
      const newPort = parseInt(newPortStr, 10);
      if (newPort >= 1 && newPort <= 65535) {
        serverConfig.port = newPort;
        console.log(`\n${C.green}✅ Port changed to ${newPort}!${C.reset}`);
      } else {
        console.log(`\n${C.red}❌ Invalid port number.${C.reset}`);
      }
      await pause();
    }
  }
}

// ── 2. PM2 Process Manager Menu ──────────────────────────────
async function handlePm2Menu() {
  let inPm2 = true;

  while (inPm2) {
    const items: MenuItem[] = [
      { key: "1", label: "▶️  PM2 Start", desc: "(Start daemon in background)" },
      { key: "2", label: "🛑 PM2 Stop", desc: "(Stop background process)" },
      { key: "3", label: "🔄 PM2 Restart", desc: "(Restart background process)" },
      { key: "4", label: "📋 PM2 Status", desc: "(View process table, RAM, uptime)" },
      { key: "5", label: "📜 PM2 Logs", desc: "(View recent realtime logs)" },
      { key: "0", label: "↩️  Back to Main Menu", desc: "(Return to main control)" },
    ];

    const choice = await selectInteractiveMenu(
      "🚀 PM2 PROCESS MANAGER (Background Daemon Control)",
      items,
      renderHeaderWidget
    );

    if (choice === "0") {
      inPm2 = false;
      break;
    }

    try {
      console.log("");
      if (choice === "1") {
        console.log(`${C.green}🚀 Executing: npx pm2 start ecosystem.config.cjs...${C.reset}`);
        execSync("npx pm2 start ecosystem.config.cjs", { stdio: "inherit" });
      } else if (choice === "2") {
        console.log(`${C.yellow}🛑 Executing: npx pm2 stop skill-library-mcp...${C.reset}`);
        execSync("npx pm2 stop skill-library-mcp", { stdio: "inherit" });
      } else if (choice === "3") {
        console.log(`${C.blue}🔄 Executing: npx pm2 restart skill-library-mcp...${C.reset}`);
        execSync("npx pm2 restart skill-library-mcp", { stdio: "inherit" });
      } else if (choice === "4") {
        console.log(`${C.cyan}📋 Executing: npx pm2 status...${C.reset}`);
        execSync("npx pm2 status", { stdio: "inherit" });
      } else if (choice === "5") {
        console.log(`${C.magenta}📜 Executing: npx pm2 logs skill-library-mcp --lines 15 --nostream...${C.reset}`);
        execSync("npx pm2 logs skill-library-mcp --lines 15 --nostream", { stdio: "inherit" });
      }
    } catch (err: any) {
      console.log(`\n${C.red}❌ PM2 Command Error: ${err.message}${C.reset}`);
    }

    await pause();
  }
}

// ── 3. OAuth & API Keys Menu ─────────────────────────────────
async function handleOAuth() {
  let inAuthMenu = true;

  while (inAuthMenu) {
    const items: MenuItem[] = [
      { key: "1", label: "📋 List All Keys", desc: "(View all registered keys & expiration)" },
      { key: "2", label: "🔑 Generate New Key", desc: "(Create new token with TTL expiration)" },
      { key: "3", label: "🔄 Regenerate Key", desc: "(Re-issue new token for existing key)" },
      { key: "4", label: "🗑️  Delete / Remove Key", desc: "(Delete key permanently)" },
      { key: "5", label: "🔍 Test / Validate Key", desc: "(Verify Bearer token validity)" },
      { key: "0", label: "↩️  Back to Main Menu", desc: "(Return to main control)" },
    ];

    const choice = await selectInteractiveMenu(
      "🔑 API KEYS & TOKEN MANAGEMENT",
      items,
      renderHeaderWidget
    );

    if (choice === "0") {
      inAuthMenu = false;
      break;
    } else if (choice === "1") {
      const data = await oauthListKeys();
      console.log(`\n${C.bold}${C.green}📋 Registered Keys (${data.count}):${C.reset}\n`);
      if (data.keys.length === 0) {
        console.log(`  ${C.yellow}No keys found.${C.reset}`);
      } else {
        data.keys.forEach((k, idx) => {
          const exp = k.expiresAt ? `${C.yellow}${k.expiresAt}${C.reset}` : `${C.green}Permanent${C.reset}`;
          const roleBadge = k.role === "admin" ? `${C.magenta}[ADMIN]${C.reset}` : `${C.cyan}[STANDARD]${C.reset}`;
          console.log(`  [${idx + 1}] ${C.bold}${k.id}${C.reset} - ${C.cyan}${k.label}${C.reset} ${roleBadge} | Expires: ${exp}`);
          console.log(`      ${C.dim}Created: ${k.createdAt} | Last Used: ${k.lastUsedAt || "Never"}${C.reset}\n`);
        });
      }
      await pause();
    } else if (choice === "2") {
      const label = await promptText("Enter key name/label (or leave blank for auto): ");
      
      const roleItems: MenuItem[] = [
        { key: "1", label: "🤖 Standard AI Token", desc: "(Skills discovery & rules only - Safe for AI)" },
        { key: "2", label: "👑 Admin Master Token", desc: "(Full Access: Services, Auth, Sessions, Skills)" },
      ];
      const roleChoice = await selectInteractiveMenu("Select Permission Role:", roleItems);
      const role = roleChoice === "2" ? "admin" : "standard";

      const expItems: MenuItem[] = [
        { key: "1", label: "♾️  Permanent", desc: "(Never expires)" },
        { key: "2", label: "⏱️  1 Day", desc: "(24 hours)" },
        { key: "3", label: "⏱️  7 Days", desc: "(1 week)" },
        { key: "4", label: "⏱️  30 Days", desc: "(1 month)" },
        { key: "5", label: "✏️  Custom Days", desc: "(Specify custom days)" },
      ];
      const expChoice = await selectInteractiveMenu("Select Expiration TTL:", expItems);
      let ttl: number | undefined;

      if (expChoice === "2") ttl = 86400;
      else if (expChoice === "3") ttl = 604800;
      else if (expChoice === "4") ttl = 2592000;
      else if (expChoice === "5") {
        const daysStr = await promptText("Enter number of days: ");
        const days = parseInt(daysStr, 10);
        if (days > 0) ttl = days * 86400;
      }

      try {
        const res = await oauthGenerateKey({
          label: label.trim() || "api-token",
          ttlSeconds: ttl,
          role,
        });
        console.log(`\n${C.green}╔══════════════════════════════════════════════════════════════════╗${C.reset}`);
        console.log(`${C.green}║  ✅ TOKEN KEY CREATED SUCCESSFULLY!                              ║${C.reset}`);
        console.log(`${C.green}╚══════════════════════════════════════════════════════════════════╝${C.reset}`);
        console.log(`\n${C.bold}Key ID:${C.reset} ${C.bold}${C.cyan}${res.record.id}${C.reset}`);
        console.log(`${C.bold}Label:${C.reset} ${res.record.label}`);
        console.log(`${C.bold}Role:${C.reset} ${res.record.role === "admin" ? `${C.magenta}👑 Admin${C.reset}` : `${C.cyan}🤖 Standard AI${C.reset}`}`);
        console.log(`${C.bold}Expires:${C.reset} ${res.record.expiresAt || "Permanent"}`);
        console.log(`\n${C.bold}Token (Copy to use):${C.reset}\n${C.bold}${C.yellow}${res.key}${C.reset}`);
        console.log(`\n${C.dim}💡 Use this in header: Authorization: Bearer <Token>${C.reset}`);
      } catch (err: any) {
        console.log(`\n${C.red}❌ Error: ${err.message}${C.reset}`);
      }
      await pause();
    } else if (choice === "3") {
      const data = await oauthListKeys();
      if (data.keys.length === 0) {
        console.log(`\n${C.yellow}⚠️  No keys available to regenerate.${C.reset}`);
        await pause();
        continue;
      }

      const keyItems: MenuItem[] = data.keys.map((k, idx) => ({
        key: String(idx + 1),
        label: `${k.id} (${k.label})`,
      }));
      keyItems.push({ key: "0", label: "↩️  Cancel" });

      const sel = await selectInteractiveMenu("Select Key to Regenerate Token:", keyItems);
      const selNum = parseInt(sel, 10);

      if (selNum >= 1 && selNum <= data.keys.length) {
        const targetKey = data.keys[selNum - 1];
        try {
          const res = await oauthRegenKey({ id: targetKey.id });
          console.log(`\n${C.green}✅ Token Regenerated for Key "${targetKey.id}" (${targetKey.label})!${C.reset}`);
          console.log(`\n${C.bold}New Token:${C.reset}\n${C.bold}${C.yellow}${res.key}${C.reset}`);
        } catch (err: any) {
          console.log(`\n${C.red}❌ Error: ${err.message}${C.reset}`);
        }
        await pause();
      }
    } else if (choice === "4") {
      const data = await oauthListKeys();
      if (data.keys.length === 0) {
        console.log(`\n${C.yellow}⚠️  No keys available to delete.${C.reset}`);
        await pause();
        continue;
      }

      const keyItems: MenuItem[] = data.keys.map((k, idx) => ({
        key: String(idx + 1),
        label: `🗑️  ${k.id} (${k.label})`,
      }));
      keyItems.push({ key: "0", label: "↩️  Cancel" });

      const sel = await selectInteractiveMenu("Select Key to Delete / Remove:", keyItems);
      const selNum = parseInt(sel, 10);

      if (selNum >= 1 && selNum <= data.keys.length) {
        const targetKey = data.keys[selNum - 1];
        try {
          await oauthDeleteKey({ id: targetKey.id });
          console.log(`\n${C.green}✅ Key "${targetKey.id}" (${targetKey.label}) deleted successfully!${C.reset}`);
        } catch (err: any) {
          console.log(`\n${C.red}❌ Error: ${err.message}${C.reset}`);
        }
        await pause();
      }
    } else if (choice === "5") {
      const key = await promptText("Enter plaintext key to test: ");
      try {
        const res = await oauthValidateKey({ key });
        console.log(`\n${C.green}✅ Validation Result:${C.reset}`);
        console.dir(res, { depth: null, colors: true });
      } catch (err: any) {
        console.log(`\n${C.red}❌ Invalid Key or Error: ${err.message}${C.reset}`);
      }
      await pause();
    }
  }
}

// ── 4. Session & AI Memory Menu ──────────────────────────────
async function handleSessions() {
  let inSessionMenu = true;

  while (inSessionMenu) {
    const items: MenuItem[] = [
      { key: "1", label: "📋 List Memory Notes", desc: "(View all stored memory sessions)" },
      { key: "2", label: "🔍 Read Note", desc: "(Read content of a session note)" },
      { key: "3", label: "➕ Save / Update Note", desc: "(Write new JSON session data)" },
      { key: "4", label: "🗑️  Delete Note", desc: "(Delete session note)" },
      { key: "0", label: "↩️  Back to Main Menu", desc: "(Return to main control)" },
    ];

    const choice = await selectInteractiveMenu(
      "💾 AI MEMORY & NOTES (Persistent Session Store)",
      items,
      renderHeaderWidget
    );

    if (choice === "0") {
      inSessionMenu = false;
      break;
    } else if (choice === "1") {
      const list = await sessionList();
      console.log(`\n${C.green}Sessions List:${C.reset}`);
      console.dir(list, { depth: null, colors: true });
      await pause();
    } else if (choice === "2") {
      const name = await promptText("Enter note name: ");
      try {
        const res = await sessionGet({ name });
        console.log(`\n${C.green}Note Content:${C.reset}`);
        console.dir(res, { depth: null, colors: true });
      } catch (err: any) {
        console.log(`\n${C.red}❌ Error: ${err.message}${C.reset}`);
      }
      await pause();
    } else if (choice === "3") {
      const name = await promptText("Enter note name: ");
      const rawData = await promptText("Enter JSON data (e.g. {\"status\":\"active\"}): ");
      try {
        let data = {};
        if (rawData) {
          data = JSON.parse(rawData);
        }
        const res = await sessionCreate({ name, data });
        console.log(`\n${C.green}✅ Note saved successfully!${C.reset}`);
        console.dir(res, { depth: null, colors: true });
      } catch (err: any) {
        console.log(`\n${C.red}❌ Error: ${err.message}${C.reset}`);
      }
      await pause();
    } else if (choice === "4") {
      const name = await promptText("Enter note name to delete: ");
      try {
        const res = await sessionDelete({ name });
        console.log(`\n${C.green}✅ Note deleted!${C.reset}`);
        console.dir(res, { depth: null, colors: true });
      } catch (err: any) {
        console.log(`\n${C.red}❌ Error: ${err.message}${C.reset}`);
      }
      await pause();
    }
  }
}

// ── 5. System Status & Live Logs Dashboard ───────────────────
async function handleSystemDashboard() {
  clearScreen();
  await renderHeaderWidget();
  console.log(`\n${C.bold}${C.green}╔══════════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.green}║  📊 SYSTEM STATUS & OUTBOUND IP DASHBOARD                        ║${C.reset}`);
  console.log(`${C.bold}${C.green}╚══════════════════════════════════════════════════════════════════╝${C.reset}\n`);

  const dataDir = resolveDataDir();
  const hostname = os.hostname();
  const outboundIPs = getOutboundIPs();

  console.log(`${C.bold}${C.yellow}🌐 NETWORK & OUTBOUND IP INFO:${C.reset}`);
  console.log(`  • Hostname:       ${C.bold}${hostname}${C.reset}`);
  console.log(`  • Local IP:        ${C.cyan}127.0.0.1 (localhost)${C.reset}`);
  if (outboundIPs.length > 0) {
    outboundIPs.forEach((item) => {
      console.log(`  • LAN / Outbound:  ${C.bold}${C.green}${item.ip}${C.reset} ${C.dim}(Interface: ${item.name})${C.reset}`);
    });
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
      if (s.startedAt) {
        activityLogs.push({
          time: s.startedAt,
          type: "SERVICE",
          message: `Service "${sname}" started ${s.port ? `on port ${s.port}` : ""}`,
        });
      }
      if (s.stoppedAt) {
        activityLogs.push({
          time: s.stoppedAt,
          type: "SERVICE",
          message: `Service "${sname}" stopped`,
        });
      }
    }

    for (const [sname, s] of Object.entries(sessions)) {
      if (s.updatedAt || s.createdAt) {
        activityLogs.push({
          time: s.updatedAt || s.createdAt,
          type: "SESSION",
          message: `Session "${sname}" updated/saved`,
        });
      }
    }

    for (const [kid, k] of Object.entries(oauthKeys)) {
      if (k.lastUsedAt) {
        activityLogs.push({
          time: k.lastUsedAt,
          type: "OAUTH",
          message: `Key "${k.label || kid.slice(0, 8)}" validated successfully`,
        });
      }
      if (k.createdAt) {
        activityLogs.push({
          time: k.createdAt,
          type: "OAUTH",
          message: `Key "${k.label || kid.slice(0, 8)}" generated`,
        });
      }
    }
  } catch {}

  activityLogs.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  const top5 = activityLogs.slice(0, 5);

  console.log(`\n${C.bold}${C.magenta}📝 LIVE RECENT ACTIVITY LOGS (TOP 5 LINES):${C.reset}`);
  if (top5.length > 0) {
    top5.forEach((log, index) => {
      const d = new Date(log.time);
      const timeFormatted = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
      
      let badge = `[${log.type}]`;
      if (log.type === "SERVICE") badge = `${C.blue}[SERVICE]${C.reset}`;
      else if (log.type === "OAUTH") badge = `${C.magenta}[OAUTH]${C.reset}  `;
      else if (log.type === "SESSION") badge = `${C.cyan}[SESSION]${C.reset}`;

      console.log(`  ${C.dim}${index + 1}.${C.reset} ${C.dim}[${timeFormatted}]${C.reset} ${badge} ${log.message}`);
    });
  } else {
    console.log(`  ${C.dim}No recent activity recorded yet.${C.reset}`);
  }

  await pause();
}

// ── 6. Skills Library Explorer ───────────────────────────────
async function handleSkills() {
  const items: MenuItem[] = [
    { key: "1", label: "📋 List Local Skills", desc: "(View all indexed skills)" },
    { key: "2", label: "🔍 Search Skills", desc: "(Filter by keyword e.g. react, python)" },
    { key: "0", label: "↩️  Back to Main Menu", desc: "(Return to main control)" },
  ];

  const choice = await selectInteractiveMenu("🧠 SKILL LIBRARY EXPLORER", items, renderHeaderWidget);

  const skillsDir = path.resolve(__dirname, "..", "..", ".agents", "skills");
  if (choice === "1" || choice === "2") {
    const query = choice === "2" ? await promptText("Enter search keyword: ") : "";
    try {
      const entries = await fs.readdir(skillsDir, { withFileTypes: true });
      const skillDirs = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .filter((name) => !query || name.toLowerCase().includes(query.toLowerCase()));

      console.log(`\n${C.green}Found ${skillDirs.length} skills:${C.reset}`);
      skillDirs.slice(0, 30).forEach((s, idx) => {
        console.log(`  ${C.cyan}${idx + 1}.${C.reset} ${s}`);
      });
      if (skillDirs.length > 30) {
        console.log(`  ${C.dim}...and ${skillDirs.length - 30} more${C.reset}`);
      }
    } catch (err: any) {
      console.log(`\n${C.red}❌ Error reading skills: ${err.message}${C.reset}`);
    }
    await pause();
  }
}

// ── Main Loop ────────────────────────────────────────────────
async function main() {
  let running = true;

  while (running) {
    const mainItems: MenuItem[] = [
      { key: "1", label: "⚡ MCP Server & Port Config", desc: `(Start/Stop Server & Port: ${serverConfig.port})` },
      { key: "2", label: "🚀 PM2 Process Manager", desc: "(Manage background daemon via PM2)" },
      { key: "3", label: "🔑 API Keys & Auth", desc: "(Generate/Validate Bearer Tokens)" },
      { key: "4", label: "💾 Memory & Sessions", desc: "(AI Session & Context Store)" },
      { key: "5", label: "📊 Logs & Outbound IP", desc: "(Network IP, Port & Top 5 Live Activity)" },
      { key: "6", label: "🧠 Skill Library Explorer", desc: "(Search Best Practice Rules)" },
      { key: "0", label: "🚪 Exit Control Panel", desc: "(Quit application)" },
    ];

    const option = await selectInteractiveMenu("⚡ MAIN CONTROL MENU", mainItems, renderHeaderWidget);

    switch (option) {
      case "1":
        await handleServerSwitchboard();
        break;
      case "2":
        await handlePm2Menu();
        break;
      case "3":
        await handleOAuth();
        break;
      case "4":
        await handleSessions();
        break;
      case "5":
        await handleSystemDashboard();
        break;
      case "6":
        await handleSkills();
        break;
      case "0":
        running = false;
        console.log(`\n${C.cyan}Goodbye! 👋${C.reset}\n`);
        process.exit(0);
        break;
      default:
        break;
    }
  }
}

main().catch((err) => {
  console.error(err);
});

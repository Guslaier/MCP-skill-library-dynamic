# 🚀 Skill Library MCP Server

An enterprise-grade Model Context Protocol (MCP) server for automatically discovering, indexing, and serving **580+ AI Skill Guidelines and Engineering Best Practices**. Features built-in **PM2 Daemon Management**, an interactive **TUI Control Dashboard**, **OAuth Token Lifecycle Management**, and a **Persistent AI Session Memory Store**.

---

## ⚡ Quick Start

### 1. Install & Build
```bash
npm install
npm run build
```

### 2. Launch Interactive Control Dashboard (TUI)
```bash
npm run menu
```
> 💡 Navigate smoothly using **Arrow Keys (▲ / ▼) + Enter** or press numeric shortcut keys `[0-6]` directly. Mouse tracking is disabled to guarantee 100% native terminal copy/paste.

---

## ⚙️ MCP Client Configuration

### 1. Remote HTTP / SSE Mode (Recommended for Antigravity, Gemini IDE, Claude Desktop, Cursor)
Add to your IDE's `mcp_config.json` or MCP settings:

```json
{
  "mcpServers": {
    "skill-library": {
      "url": "http://localhost:8787",
      "headers": {
        "Authorization": "Bearer <YOUR_API_TOKEN>"
      }
    }
  }
}
```
*(Generate Bearer Tokens anytime from `[3] API Keys & Auth` in `npm run menu`)*

---

### 2. Local Stdio Mode (Direct Process Spawn)
```json
{
  "mcpServers": {
    "skill-library": {
      "command": "node",
      "args": ["<ROOT_DIR>/dist/index.js"],
      "env": {
        "SKILLS_DIR": "<ROOT_DIR>/.agents/skills",
        "SKILL_LIBRARY_DATA_DIR": "<ROOT_DIR>/.data"
      }
    }
  }
}
```
*(Replace `<ROOT_DIR>` with the absolute path to the project directory, e.g. `C:/Users/GOOL/Desktop/New folder (2)/skill-library-mcp`)*

---

## 🚀 PM2 Background Daemon Management

The project includes built-in PM2 orchestration for running as a reliable background service:

```bash
# Start server daemon in background
npm run pm2:start

# View process table, memory usage & uptime
npm run pm2:status

# Stream realtime logs
npm run pm2:logs

# Restart or stop the daemon
npm run pm2:restart
npm run pm2:stop
```

---

## 🎮 Control Dashboard Features (`npm run menu`)

```text
╔══════════════════════════════════════════════════════════════════════╗
║  ⚡ SKILL LIBRARY MCP — CONTROL DASHBOARD                            ║
╠══════════════════════════════════════════════════════════════════════╣
║  MCP Status: ● ONLINE (Port 8787) Skills: 589  Active Services: 1   ║
╚══════════════════════════════════════════════════════════════════════╝
```

1. **⚡ MCP Server & Port Config**
   - Instant 1-click START / STOP toggle.
   - Dynamic Port switching with port collision prevention.
2. **🚀 PM2 Process Manager**
   - Manage background daemon operations (Start, Stop, Restart, Status, Logs) through the TUI.
3. **🔑 API Keys & Auth**
   - Generate OAuth Bearer Keys with customizable TTL (Permanent, 1 day, 7 days, 30 days, or custom).
   - Regenerate existing keys while preserving IDs, and delete keys.
   - Clean sequential ID formatting (`KEY-001`, `KEY-002`).
4. **💾 Memory & Sessions**
   - Store and retrieve cross-session AI state and context notes.
   - Built-in TTL auto-cleanup to prevent disk bloat.
5. **📊 Logs & Outbound IP**
   - Realtime network interface inspection (Tailscale, LAN, Ethernet, Localhost).
   - Top 5 most recent live activity logs.
6. **🧠 Skill Library Explorer**
   - Search and browse 580+ indexed engineering and domain-specific rules.

---

## 🛠️ Available MCP Tools & Role Permissions (RBAC)

The server enforces strict **Role-Based Access Control (RBAC)**:

| Category | Tool Name | Permission Role | Description |
| :--- | :--- | :---: | :--- |
| **Skill Library** | **`list_skills`** | `🤖 Public AI` | Search available skills/rules by keyword (e.g. `react`, `python`, `nestjs`). |
| | **`fetch_skill_rule`** | `🤖 Public AI` | Fetch full markdown guidelines and best practices for a skill. |
| **AI Sessions** | **`session_create`** | `👑 Admin Only` | Persist arbitrary JSON session state with TTL expiration. |
| | **`session_get`** | `👑 Admin Only` | Retrieve stored session data by name. |
| | **`session_list`** | `👑 Admin Only` | List all active sessions (auto-purges expired records). |
| | **`session_delete`** | `👑 Admin Only` | Delete session record. |
| **Auth & Keys** | **`oauth_generate_key`** | `👑 Admin Only` | Issue new API tokens with custom roles and TTL expiration. |
| | **`oauth_regen_key`** | `👑 Admin Only` | Re-issue new token for an existing key ID. |
| | **`oauth_delete_key`** | `👑 Admin Only` | Delete an API key permanently. |
| | **`oauth_validate_key`** | `👑 Admin Only` | Verify token validity, expiration, and associated role. |
| | **`oauth_list_keys`** | `👑 Admin Only` | List stored API key metadata and usage audit logs. |
| **System Status** | **`system_status`** | `👑 Admin Only` | View network IPs (Tailscale/LAN/Localhost) and recent activity logs. |
| | **`service_list`** | `👑 Admin Only` | List all registered and active background services (read-only). |

> 🔒 **Security Notice:** Starting and stopping the server/services (`service_start`, `service_stop`) is strictly restricted to manual control via **PM2**, **CLI**, and **TUI Menu (`npm run menu`)** to prevent unauthorized AI process modifications.

---

## 🛡️ Architecture & Performance Highlights

- **Universal Transport:** Seamlessly handles standard Server-Sent Events (SSE `GET /`, `GET /sse`) and Streamable HTTP JSON-RPC `POST` requests.
- **Dynamic Multi-Session Pooling:** Multiple concurrent client sessions are isolated dynamically without session collisions or initialization errors.
- **Zero Memory Leak & GC:** In-memory Garbage Collector periodically purges inactive sessions (30-min TTL) and limits active session pool size with LRU eviction.

---

## 🤖 Recommended AI Agent System Prompt

```text
Before planning, designing, or coding any feature:
1. Search relevant skills: list_skills({ query: "<keyword>" })
2. Fetch details: fetch_skill_rule({ skill_name: "<name>" })
3. Strictly follow fetched guidelines.
```

---

## 📜 License
MIT
# Skill Library MCP Server

An enterprise-grade Model Context Protocol (MCP) server for automatically discovering, indexing, and serving 580+ AI Skill Guidelines and Engineering Best Practices. Features an Omni-Search Multi-Dimensional Taxonomy Engine, Semantic Query Expansion, Fuzzy Matching, Weighted Relevance Scoring, PM2 Daemon Management, an interactive TUI Control Dashboard, OAuth Token Lifecycle Management, and a Persistent AI Session Memory Store.

---

## Quick Start

### 1. Install and Build
```bash
npm install
npm run build
```

### 2. Launch Interactive Control Dashboard (TUI)
```bash
npm run menu
```
> Note: Navigate using Arrow Keys (Up / Down) + Enter or press numeric shortcut keys [0-6] directly. Mouse tracking is disabled to guarantee native terminal copy/paste.

---

## IMPORTANT: First-Time Setup and Taxonomy Sync

> [!IMPORTANT]
> When setting up the server for the first time, or after adding/cloning new skills, you must instruct the AI to synchronize and organize the taxonomy metadata to enable full Omni-Search capabilities.

### Example AI Prompt:
```text
"Please call sync_skills and organize all uninitialized skills using update_skill_metadata."
```

### The 7-Step AI Librarian Workflow:
1. `sync_skills`: Rescan local skill directories to discover newly added skills immediately without restarting the server.
2. `explore_taxonomy`: Inspect the current breakdown of Domains, Occupations, Categories, and the uninitialized skills count (`noninit_count`).
3. `find_skills({ category: "noninit", limit: 100 })`: Retrieve unclassified skills page by page.
4. Analyze Skill: Identify target domains and occupations based on the skill purpose.
5. Create or Reuse Taxonomy: Reuse existing domain/occupation names if applicable, or create broad new ones (e.g. `gaming`, `finance`, `healthcare`).
6. Define Specific Tags: Assign specific technology and problem keywords (e.g. `["ecs", "dots", "burst", "optimization"]`).
7. `update_skill_metadata`: Write updates directly to the local `SKILL.md` frontmatter and the master registry simultaneously.

---

## Omni-Search and Taxonomy Discovery Architecture

Skill Library MCP utilizes a 4-dimensional taxonomy model paired with an intelligent relevance engine:

| Dimension | Description | Example Values |
| :--- | :--- | :--- |
| `domain` | Target industry or broad domain | `gaming`, `finance`, `healthcare`, `ecommerce`, `education` |
| `occupation` | Target role or persona | `game-developer`, `backend-developer`, `data-scientist`, `qa-engineer` |
| `category` | Technical classification | `frontend`, `backend`, `database`, `devops`, `ai-ml`, `testing`, `security` |
| `tags` | Specific technologies, libraries, or problem areas | `typeorm`, `postgres`, `playwright`, `jwt-auth`, `memory-leak`, `ecs` |

### 3-Layer Search Intelligence:
1. **Semantic Query Expansion:** Automatically expands search terms to include domain synonyms and related keywords (e.g. searching `game` expands to `[game, gaming, gamedev, unity, unreal, godot]`).
2. **Fuzzy String Matching:** Tolerates typographical errors and partial spellings using string similarity metrics (e.g. `gamming`, `postgre`, `optimizaton`).
3. **Weighted Scoring and 40% Relative Cutoff:**
   - Dynamically scores candidates (Exact Name: +15, Tag match: +10-12, Domain match: +8, Category match: +4).
   - Automatically filters out candidates scoring below 40% of the top match score to eliminate noise and save token usage.

---

## MCP Client Configuration

### 1. Remote HTTP / SSE Mode (Recommended for Antigravity, Gemini IDE, Claude Desktop, Cursor)
Add to your IDE configuration (`mcp_config.json`):

```json
{
  "mcpServers": {
    "skill-library": {
      "url": "http://localhost:8787/sse",
      "headers": {
        "Authorization": "Bearer <YOUR_API_TOKEN>"
      }
    }
  }
}
```
*(Generate Bearer Tokens from option [3] API Keys and Auth in `npm run menu`)*

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
*(Replace `<ROOT_DIR>` with the absolute path to the project directory, e.g. `C:/Users/admin/Desktop/skill-library-mcp`)*

---

## Available MCP Tools and Role Permissions (RBAC)

The server enforces Role-Based Access Control (RBAC):

| Category | Tool Name | Permission Role | Description |
| :--- | :--- | :---: | :--- |
| **Discovery and Search** | `find_skills` | Public AI | Omni-Search with weighted scoring, fuzzy matching, multi-dimensional filters, and pagination. |
| | `list_skills` | Public AI | Browse skills with pagination (`limit`, `page`) and category filtering. |
| | `explore_taxonomy` | Public AI | View taxonomy summary (Domains, Occupations, Categories) and unclassified (`noninit`) counts. |
| | `fetch_skill_rule` | Public AI | Fetch full markdown guidelines and best practices for a skill. |
| | `get_skill_info` | Public AI | Get detailed file breakdown and metadata for a skill. |
| **Management and Sync** | `sync_skills` | Public AI | Rescan local folders and rebuild taxonomy cache without server restart. |
| | `update_skill_metadata` | Public AI | Assign Domain, Occupation, Category, and Tags with auto-canonicalization. |
| | `install_skill` | Public AI | Install skills from repository, URL, or custom markdown content. |
| | `uninstall_skill` | Public AI | Remove a skill from the library. |
| **AI Sessions** | `session_create` | Admin Only | Persist arbitrary JSON session state with TTL expiration. |
| | `session_get` | Admin Only | Retrieve stored session data by name. |
| | `session_list` | Admin Only | List all active sessions (auto-purges expired records). |
| | `session_delete` | Admin Only | Delete session record. |
| **Auth and Keys** | `oauth_generate_key` | Admin Only | Issue new API tokens with custom roles and TTL expiration. |
| | `oauth_regen_key` | Admin Only | Re-issue new token for an existing key ID. |
| | `oauth_delete_key` | Admin Only | Delete an API key permanently. |
| | `oauth_validate_key` | Admin Only | Verify token validity, expiration, and associated role. |
| | `oauth_list_keys` | Admin Only | List stored API key metadata and usage audit logs. |
| **System Status** | `system_status` | Admin Only | View network IPs (Tailscale/LAN/Localhost) and recent activity logs. |
| | `service_list` | Admin Only | List all registered and active background services (read-only). |

---

## PM2 Background Daemon Management

The project includes built-in PM2 orchestration for running as a background service:

```bash
# Start server daemon in background
npm run pm2:start

# View process table, memory usage, and uptime
npm run pm2:status

# Stream realtime logs
npm run pm2:logs

# Restart or stop the daemon
npm run pm2:restart
npm run pm2:stop
```

---

## Mandatory AI Agent System Prompt

To ensure AI agents utilize this system effectively, include this protocol in your system prompt or custom rules:

```text
CRITICAL DIRECTIVE: YOUR VERY FIRST ACTION BEFORE DOING ANYTHING ELSE MUST BE TO CALL THE find_skills TOOL.

You are equipped with the Skill Library MCP (Dynamic Skills and Best Practice Registry).
Before analyzing the request, reading files, or planning, you MUST strictly follow this 3-step protocol:
1. Discover (find_skills({ query: "<task_or_framework>", domain: "<domain>", occupation: "<role>" }))
2. Ensure Available and Load Rules (fetch_skill_rule({ skill_name: "<skill_name>" }) or install_skill)
3. Comply and Implement
```

---

## License
MIT
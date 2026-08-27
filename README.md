# MCP-skill-library-dynamic 🚀

An Enterprise-grade MCP (Model Context Protocol) server that serves skill and rule files from a local directory to AI agents on demand. It allows AI agents to dynamically list and fetch specific skill instructions formatted in Markdown without suffering from Context Bloat.

---

## ✨ Features (v1.2.0)

- **TypeScript Native**: 100% Type-safe, compiled to optimized ES Modules.
- **Curated 200+ Core Skills Base**: High-quality, deduplicated, and community-standard skill set pre-indexed in [`skills-base.json`](skills-base.json).
- **Deterministic Offline-First Downloader**: Fast, reliable batch downloads directly from the curated base list using `npx skills add` with exponential backoff retries.
- **Smart Search & Filter**: `list_skills` supports optional `query` parameter (e.g. `list_skills({ query: "react" })`) to filter skills directly and save tokens.
- **Recursive Multi-File Rule Aggregation**: `fetch_skill_rule` automatically scans and combines all nested Markdown files (e.g. `rules/*.md`, `references/*.md`) without skipping deeper documentation.
- **Zero-Config Auto-Path Resolution**: Intelligently resolves `.agents/skills` relative to the compiled server location, eliminating manual `SKILLS_DIR` setup issues.
- **Ghost Skill Elimination**: Automatically ignores empty directories and only serves folders with verified `.md` rule files.
- **Memory-Safe Caching**: Utilizes a TTL cache for directory listing and async I/O for file reading to guarantee 0% chance of Out-Of-Memory (OOM) crashes, even with 100,000+ skills.
- **Path Traversal Protection**: Cryptographic-grade path resolution to strictly sandbox the AI to the `.agents/skills/` directory.
- **Graceful Shutdown**: Properly handles `SIGINT`/`SIGTERM` and uncaught exceptions to ensure clean MCP socket closures.
- **Token Diet Architecture (Cost Saving)**: 
  - `list_skills` only returns raw folder names (slugs), minimizing injected context to just ~1,500 tokens even with 1,000+ skills.
  - `fetch_skill_rule` strictly fetches content on-demand, one skill at a time, preventing AI hallucination and massive API bills.

---

## 📦 Installation & Build

1. Clone or download the repository:
```bash
git clone https://github.com/Guslaier/MCP-skill-library-dynamic.git
cd skill-library-mcp
```

2. Install dependencies:
```bash
npm install
```

3. Compile TypeScript source code:
```bash
npm run build
```

---

## 🧠 Downloading & Managing Skills

Skills are loaded into `.agents/skills/` located in the root of the project (or configured via `SKILLS_DIR`).

### Curated Base Skills (`skills-base.json`)

The downloader uses [`skills-base.json`](skills-base.json) as the single source of truth containing 200+ curated and deduplicated skills from official and top-tier repositories (`anthropics/skills`, `obra/superpowers`, `affaan-m/ecc`, `browser-use`, etc.).

### CLI Commands

| Command | Description |
| --- | --- |
| `npm run download` | Download and install all 200+ base skills |
| `npm run download -- <skill-name>` | Download only skills matching the given name filter |

#### Examples

```bash
# Download all 200+ curated base skills
npm run download

# Download only specific skills matching 'caveman'
npm run download -- caveman

# Download all React / Frontend related skills
npm run download -- react
```

---

## 📁 Directory Structure

```text
skill-library-mcp/
├── package.json
├── tsconfig.json
├── skills-base.json        # Curated index of 200+ skills (name, repo url, description)
├── src/
│   ├── index.ts            # MCP Server entry point
│   └── download-skills.ts  # Batch downloader from skills-base.json
├── dist/
│   ├── index.js
│   └── download-skills.js
└── .agents/
    └── skills/             # Local skill files served to AI agents
        ├── code-review/
        │   └── SKILL.md
        ├── test-driven-development/
        │   └── SKILL.md
        └── ...
```

---

## 🚀 Running the Server

Start the server using:

```bash
npm start
```

---

## ⚙️ MCP Configuration

To connect this server with an MCP client (such as **Antigravity**, **Cursor**, **Roo Code**, or **Cline**), add the following configuration to your client's settings file:

```json
{
  "mcpServers": {
    "skill-library": {
      "command": "node",
      "args": [
        "C:/path/to/skill-library-mcp/dist/index.js"
      ],
      "env": {
        "SKILLS_DIR": "C:/path/to/skill-library-mcp/.agents/skills"
      }
    }
  }
}
```

> **Important:** Replace `C:/path/to/skill-library-mcp` with your actual repository path, pointing to `dist/index.js`.

---

## 🤖 System Prompt (Knowledge Base Protocol)

Add the following prompt to your AI agent rules (`.clinerules`, `.cursorrules`, or Custom Instructions) so the agent automatically uses the Skill Library:

```text
# UNIVERSAL KNOWLEDGE BASE PROTOCOL
You are equipped with the Enterprise "Skill Library MCP". Before starting any architectural planning, refactoring, or feature implementation, you MUST:
1. Use `list_skills` (or `list_skills({ query: "keyword" })`) to check for relevant domain rules or coding standards.
2. If found, use `fetch_skill_rule({ skill_name: "..." })` to read the full context and nested rule guidelines.
3. Explicitly acknowledge the rules and apply them strictly to your code generation.
```

---

## 📜 License

MIT

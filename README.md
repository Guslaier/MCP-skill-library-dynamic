# MCP-skill-library-dynamic 🚀

An Enterprise-grade MCP (Model Context Protocol) server that serves skill and rule files from a local directory to AI agents on demand. It allows AI agents to dynamically list and fetch specific skill instructions formatted in Markdown without suffering from Context Bloat.


=======
## ✨ Features


- **TypeScript Native**: 100% Type-safe, compiled to optimized ES Modules.
- **Memory-Safe Caching**: Utilizes a TTL cache for directory listing and async I/O for file reading to guarantee 0% chance of Out-Of-Memory (OOM) crashes, even with 100,000+ skills.
- **Path Traversal Protection**: Cryptographic-grade path resolution to strictly sandbox the AI to the `.agents/skills/` directory.
- **Graceful Shutdown**: Properly handles `SIGINT`/`SIGTERM` and uncaught exceptions to ensure clean MCP socket closures.
- **`list_skills` Tool**: AI can list all available skill/rule folders.
- **`fetch_skill_rule` Tool**: AI can fetch the full markdown content (`.md`) of a specific skill.

## 📦 Installation & Build

1. Clone or download the repository.
2. Install the dependencies:
```bash
npm install
```
3. Compile the TypeScript source code:
```bash
npm run build
```

## 🧠 Adding Skills

The server reads from the `.agents/skills` folder located in the root of the project by default (you can override this with the `SKILLS_DIR` environment variable). If it doesn't exist, it will be created automatically upon running the server.

Each skill should be in its own subfolder inside `.agents/skills` and contain a Markdown (`.md`) file.

### Downloading Skills Automatically (Concurrent)

You can automatically fetch and install skills from [skillsmp.com](https://skillsmp.com) by running:

```bash
npm run download
```

*Note: The downloader runs in parallel batches with Exponential Backoff Retries to handle network instability.*

### Example Directory Structure

```text
skill-library-mcp/
├── package.json
├── tsconfig.json
├── src/
│   └── index.ts
├── dist/
│   └── index.js
└── .agents/
    └── skills/
        ├── code-review/
        │   └── SKILL.md
        └── database-setup/
            └── instructions.md
```

## 🚀 Running the Server

Start the server using:

```bash
npm start
```

## ⚙️ MCP Configuration

To use this server with an MCP client (such as Roo Code, Cline, or Cursor), add the following configuration to your client's settings file. Make sure to replace `C:/absolute/path/to/skill-library-mcp` with the actual absolute path where you cloned this repository.

> **Important:** The path must point to the compiled `dist/index.js`, NOT the root folder.

```json
{
  "mcpServers": {
    "skill-library": {
      "command": "node",
      "args": [
        "C:/absolute/path/to/skill-library-mcp/dist/index.js"
      ]
    }
  }
}
```

## 🤖 System Prompt (For Default AI Agents)

If you are using default AI modes (without custom orchestrators), you need to instruct the AI to actively use this MCP server. Copy and paste the following **UNIVERSAL KNOWLEDGE BASE PROTOCOL** into your `.clinerules`, `.cursorrules`, or the Custom Instructions field of your extension:

```text
# UNIVERSAL KNOWLEDGE BASE PROTOCOL
You are equipped with a "Skill Library MCP". Before starting any architectural planning, refactoring, or feature implementation, you MUST:
1. Use the `list_skills` tool to check for relevant domain rules or coding standards.
2. If found, use the `fetch_skill_rule` tool to read the full context.
3. Explicitly acknowledge the rules and apply them strictly to your code generation.
```

By adding this prompt, your AI will proactively check the skill library before writing any complex code, ensuring it follows your project's specific best practices!

## 📜 License

MIT

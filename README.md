# MCP-skill-library-dynamic

An MCP (Model Context Protocol) server that serves skill and rule files from a local directory to AI agents on demand. It allows AI agents to dynamically list and fetch specific skill instructions formatted in Markdown.

## Features

- **`list_skills`**: List all available skill/rule folders within your local `skills` directory.
- **`fetch_skill_rule`**: Fetch the full markdown content (`.md`) of a specific skill to learn how to perform a task.

## Prerequisites

- Node.js (v18 or higher recommended)

## Installation

1. Clone or download the repository.
2. Install the dependencies:

```bash
npm install
```

## Adding Skills

The server reads from the `.agents/skills` folder located in the root of the project by default (you can override this with the `SKILLS_DIR` environment variable). If it doesn't exist, it will be created automatically upon running the server.

Each skill should be in its own subfolder inside `.agents/skills` and contain a Markdown (`.md`) file.

### Downloading Skills Automatically

You can automatically fetch and install skills from [skillsmp.com](https://skillsmp.com) by running:

```bash
npm run download
```

This script scrapes the latest skills and uses the `skills` CLI to install them directly into your project.

### Example Directory Structure

```
skill-library-mcp/
├── index.js
├── package.json
└── .agents/
    └── skills/
        ├── code-review/
        │   └── SKILL.md
        ├── database-setup/
        │   └── instructions.md
        └── web-scraping/
            └── guide.md
```

## Running the Server

Start the server using:

```bash
npm start
```

## MCP Configuration

To use this server with an MCP client (such as Roo Code, Cline, or Cursor), add the following configuration to your client's settings file (e.g., `cline_mcp_settings.json` or `roo_mcp.json`). Make sure to replace `C:/absolute/path/to/skill-library-mcp` with the actual absolute path where you cloned this repository.

```json
{
  "mcpServers": {
    "skill-library": {
      "command": "node",
      "args": [
        "C:/absolute/path/to/skill-library-mcp/index.js"
      ]
    }
  }
}
```

## System Prompt (For Default AI Agents)

If you are using default AI modes (without custom orchestrators), you need to instruct the AI to actively use this MCP server. Copy and paste the following **UNIVERSAL KNOWLEDGE BASE PROTOCOL** into your `.clinerules`, `.cursorrules`, or the Custom Instructions field of your extension:

```text
# UNIVERSAL KNOWLEDGE BASE PROTOCOL
You are equipped with a "Skill Library MCP". Before starting any architectural planning, refactoring, or feature implementation, you MUST:
1. Use the `list_skills` tool to check for relevant domain rules or coding standards.
2. If found, use the `fetch_skill_rule` tool to read the full context.
3. Explicitly acknowledge the rules and apply them strictly to your code generation.
```

By adding this prompt, your AI will proactively check the skill library before writing any complex code, ensuring it follows your project's specific best practices!

## License

MIT

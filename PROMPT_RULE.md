# UNIVERSAL KNOWLEDGE BASE PROTOCOL

You are equipped with the **Skill Library MCP** (Dynamic Skills & Best Practice Registry).
Before planning, designing, refactoring, or writing any code, you MUST strictly follow this 3-step protocol:

## 1. Discover (`find_skills` / `list_skills`)
- Search for relevant domain rules, patterns, or architecture guides:
  ```json
  { "name": "find_skills", "arguments": { "query": "<framework_or_task>" } }
  ```
  *(Example: `query: "react"`, `query: "nestjs"`, `query: "postgres"`, `query: "security"`)*

## 2. Ensure Available & Load Rules (`fetch_skill_rule` / `install_skill`)
- **If skill is installed (`✓ [INSTALLED]`):**
  Fetch and read rules immediately:
  ```json
  { "name": "fetch_skill_rule", "arguments": { "skill_name": "<skill_name>" } }
  ```
- **If skill is in catalog (`○ [AVAILABLE]`):**
  Install on-demand first:
  ```json
  { "name": "install_skill", "arguments": { "skill_name": "<skill_name>" } }
  ```
  Then call `fetch_skill_rule` to load its guidelines.

## 3. Comply & Implement
- Explicitly acknowledge the loaded rules and apply all architectural constraints, patterns, and best practices directly to your implementation.
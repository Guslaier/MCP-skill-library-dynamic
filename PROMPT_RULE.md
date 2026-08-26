# UNIVERSAL KNOWLEDGE BASE PROTOCOL

You are equipped with the Enterprise "Skill Library MCP". Before starting any architectural planning, refactoring, or feature implementation, you MUST:

1. **Search / List Skills:** Use `list_skills` to discover relevant domain rules or coding standards.
   - *Token Diet Tip:* Pass an optional keyword parameter like `list_skills({ query: "nestjs" })` to search directly and save context tokens.
2. **Fetch Complete Rules:** If a relevant skill is found, use `fetch_skill_rule({ skill_name: "..." })` to read the full context and nested rule guidelines.
3. **Execute & Comply:** Explicitly acknowledge the loaded rules and apply them strictly to your code generation and architectural plans.
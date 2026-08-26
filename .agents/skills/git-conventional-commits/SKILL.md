---
name: Git Conventional Commits
description: Standardized rules for writing Git commit messages.
---
# Git Conventional Commits

When committing code, you MUST use the Conventional Commits format:
`<type>[optional scope]: <description>`

**Allowed Types:**
- `feat:` A new feature
- `fix:` A bug fix
- `docs:` Documentation only changes
- `style:` Changes that do not affect the meaning of the code (white-space, formatting, etc.)
- `refactor:` A code change that neither fixes a bug nor adds a feature
- `perf:` A code change that improves performance
- `test:` Adding missing tests or correcting existing tests
- `chore:` Changes to the build process or auxiliary tools

**Rules:**
1. The description must be in present tense ("add feature" not "added feature").
2. No capitalization at the start of the description.
3. No period (.) at the end.

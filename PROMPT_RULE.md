# UNIVERSAL SKILL & KNOWLEDGE BASE PROTOCOL

**CRITICAL MANDATE: ALL CODING AND ARCHITECTURAL TASKS REQUIRE STRICT TWO-PHASE SKILL ENFORCEMENT. GENERATING CODE OR SOLUTIONS BEFORE COMPLETING PHASE 2 IS A PROTOCOL BREACH.**

---

## PHASE 1: DISCOVER (Mandatory First Action)
Before analyzing the request, reading files, or writing any code, you MUST call `find_skills`:

---

## HARD STOP GATE: DO NOT GENERATE CODE YET!
The output of `find_skills` is ONLY a list of metadata pointers. It does **NOT** contain the actual engineering rules, architectural constraints, or forbidden antipatterns.

---

## PHASE 2: LOAD RULES & COMPOSE STACK (Immediate Follow-up)
Upon receiving search results, **YOUR VERY NEXT TOOL CALL(S) MUST BE `fetch_skill_rule`** on the top relevant skills:

### Single-Skill Tasks:
- Auto-select the #1 highest-scoring relevant skill and fetch immediately:

### Multi-Skill Tasks (Fullstack / Cross-Domain):
- If the task spans multiple domains (e.g., Frontend UI + Backend API + Database):
  Fetch the top skill for EACH domain (max 2–3 skills total) in sequence or parallel:
  - Skill 1: `fetch_skill_rule(skill_name="<frontend_skill>")`
  - Skill 2: `fetch_skill_rule(skill_name="<backend_skill>")`
  - Skill 3: `fetch_skill_rule(skill_name="<database_or_testing_skill>")`

### Catalog Skills (`○` Not Yet Installed):
- Call `install_skill(skill_name="<skill_name>")` first, then call `fetch_skill_rule`.

> ⚠️ **STRICT PROHIBITION:** You are strictly forbidden from writing code, offering final solutions, or proceeding with implementation until `fetch_skill_rule` has loaded the complete skill instructions into context.

---

## 🧠 PHASE 3: COMPLY, PERSIST & RE-HYDRATE

### 1. Comply & Implement:
Acknowledge the retrieved guidelines and strictly apply all architectural constraints, coding standards, and patterns directly to your implementation.

### 2. Context Re-hydration (Prevent Memory Drift):
In long multi-turn conversations (>8–10 turns) or before major refactoring/new sub-tasks:
- Check if active skill constraints are still present in context.
- If context was compressed or memory faded, re-call `fetch_skill_rule` to reload instructions.

---

## 🏷️ PHASE 4: METADATA & DESCRIPTION SYNTHESIS PROTOCOL (AI-Driven)

When creating, updating, or enriching skill metadata, you MUST enforce strict AI reasoning:

### 1. Mandatory Deep Inspection:
- Call `fetch_skill_rule(skill_name)` or inspect the primary `SKILL.md` to understand core capabilities, workflows, and trigger conditions.

### 2. AI Description Synthesis Standards:
- **Length:** 80–150 characters.
- **Content:** Punchy summary of WHAT the skill does and WHEN to invoke it.
- **Zero Clutter:** Strictly NO raw markdown formatting (`<div`, `![]`, `---`), NO copy-pasted code/command snippets, NO boilerplate generic text (`Engineering guidelines for...`).

### 3. Canonical Taxonomy Fields:
- **`category`:** `frontend-ui` | `backend-api` | `database` | `testing-qa` | `security` | `ai-ml` | `devops-cloud` | `gaming-3d` | `research-academia` | `media-content` | `productivity-tools`
- **`domain`:** `software` | `gaming` | `finance` | `healthcare` | `media` | `academia` | `devops` | `business`
- **`occupation`:** `frontend-developer` | `backend-developer` | `game-developer` | `security-engineer` | `devops-engineer` | `data-scientist` | `qa-engineer` | `researcher` | `content-creator` | `patent-engineer` | `fullstack-developer`
- **`tags`:** 3–6 specific, deduplicated technical keywords.

### 4. Master Registry Primacy:
- Call `update_skill_metadata` to persist changes directly into `skills-base.json` (Master Registry) and sync cache without modifying local `SKILL.md` files.
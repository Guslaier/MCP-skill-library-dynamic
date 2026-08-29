import fs, { promises as fsPromises } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { findSkillDirectory } from "../common/paths.js";
import { normalizeTag, normalizeCanonicalTerm } from "../common/aliases.js";
import { syncTaxonomyCache } from "../common/taxonomy.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SkillEntry {
  name: string;
  githubUrl?: string;
  description: string;
  category: string;
  domain?: string;
  occupation?: string;
  tags: string[];
}

function cleanExtractedText(raw: string): string {
  if (!raw) return "";
  let text = raw.trim();
  // Strip markdown badges, links, images
  text = text.replace(/\[!\[.*?\]\(.*?\)\]\(.*?\)/g, " ");
  text = text.replace(/!\[.*?\]\(.*?\)/g, " ");
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/^>[-]?\s*/, "").replace(/^\|[-]?\s*/, "");
  text = text.replace(/^["'`]|["'`]$/g, "").trim();
  text = text.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  text = text.replace(/---[\s\S]*?---/g, " ");
  text = text.replace(/<!--[\s\S]*?-->/g, " ");
  text = text.replace(/[\w.-]+@[\w.-]+\.\w+/g, "");
  text = text.replace(/https?:\/\/\S+/g, "");
  return text.trim();
}

function parseRootSkillFile(content: string, skillName: string): {
  description: string;
  frontmatterCategory?: string;
  frontmatterDomain?: string;
  frontmatterOccupation?: string;
  frontmatterTags?: string[];
} {
  let desc = "";
  let fmCat: string | undefined;
  let fmDom: string | undefined;
  let fmOcc: string | undefined;
  let fmTags: string[] | undefined;

  // Extract from Frontmatter
  if (content.startsWith("---")) {
    const parts = content.split("---");
    if (parts.length >= 3) {
      const fm = parts[1];

      const descMatch = fm.match(/description:\s*(?:>[-]?|\|[-]?|\s*)([\s\S]*?)(?=\n[a-zA-Z0-9_-]+:|$)/i);
      if (descMatch && descMatch[1]) {
        const candidate = cleanExtractedText(descMatch[1]);
        if (candidate && candidate.length >= 20 && !candidate.startsWith("tags:") && !candidate.startsWith("category:")) {
          desc = candidate;
        }
      }

      const catMatch = fm.match(/category:\s*([a-zA-Z0-9_-]+)/i);
      if (catMatch && catMatch[1]) fmCat = catMatch[1].trim();

      const domMatch = fm.match(/domain:\s*([a-zA-Z0-9_-]+)/i);
      if (domMatch && domMatch[1]) fmDom = domMatch[1].trim();

      const occMatch = fm.match(/occupation:\s*([a-zA-Z0-9_-]+)/i);
      if (occMatch && occMatch[1]) fmOcc = occMatch[1].trim();

      const tagsMatch = fm.match(/tags:\s*\[(.*?)\]/i);
      if (tagsMatch && tagsMatch[1]) {
        fmTags = tagsMatch[1].split(",").map(t => normalizeTag(t.trim())).filter(t => t && t.length > 1);
      }
    }
  }

  // Fallback: When to use, Purpose, or first body paragraph
  if (!desc || desc.length < 20) {
    const body = content.replace(/^---[\s\S]*?---/, "").trim();
    
    // Look for Use when / When to use / Purpose / Overview
    const triggerMatch = body.match(/(?:When to use|Use when|Purpose|Overview|触发条件|核心功能)[:：\s]+([^\n]+)/i);
    if (triggerMatch && triggerMatch[1]) {
      const candidate = cleanExtractedText(triggerMatch[1]);
      if (candidate && candidate.length >= 20) {
        desc = candidate;
      }
    }

    if (!desc || desc.length < 20) {
      const lines = body.split("\n")
        .map(l => cleanExtractedText(l))
        .filter(l => l && !l.startsWith("#") && !l.startsWith("tags:") && !l.startsWith("category:") && !l.startsWith("domain:") && !l.startsWith("occupation:") && !l.startsWith("license") && !l.startsWith("npm ") && !l.startsWith("brew ") && !l.startsWith("git ") && l.length >= 25);
      if (lines.length > 0) {
        desc = lines[0];
      }
    }
  }

  if (!desc || desc.length < 15) {
    desc = `Expert guidelines, patterns, and best practices for ${skillName.replace(/-/g, " ")}.`;
  }

  if (desc.length > 155) {
    desc = desc.substring(0, 152).trim() + "...";
  }

  return {
    description: desc,
    frontmatterCategory: fmCat,
    frontmatterDomain: fmDom,
    frontmatterOccupation: fmOcc,
    frontmatterTags: fmTags,
  };
}

function classifySkill(name: string, content: string, parsedDesc: string): {
  category: string;
  domain: string;
  occupation: string;
  tags: string[];
} {
  const lowerName = name.toLowerCase();
  const lowerContent = (name + " " + content + " " + parsedDesc).toLowerCase();

  let category = "productivity-tools";
  let domain = "software";
  let occupation = "fullstack-developer";

  // 1. Gaming & 3D
  if (lowerName.includes("roblox") || lowerName.includes("unity") || lowerName.includes("godot") || lowerName.includes("3dsmax") || lowerName.includes("blender") || lowerName.includes("threejs") || lowerName.includes("solidworks") || lowerContent.includes("roblox") || lowerContent.includes("unity3d") || lowerContent.includes("gdscript") || lowerContent.includes("luau")) {
    category = "gaming-3d";
    domain = "gaming";
    occupation = "game-developer";
  }
  // 2. Security & Penetration Testing
  else if (lowerName.includes("security") || lowerName.includes("pentest") || lowerName.includes("cve") || lowerName.includes("owasp") || lowerName.includes("vulnerability") || lowerName.includes("audit-logs") || lowerName.includes("firmware-pentest") || lowerName.includes("ida") || lowerName.includes("reverse")) {
    category = "security";
    domain = "software";
    occupation = "security-engineer";
  }
  // 3. DevOps & Cloud
  else if (lowerName.includes("docker") || lowerName.includes("kubernetes") || lowerName.includes("terraform") || lowerName.includes("ci-cd") || lowerName.includes("azure") || lowerName.includes("aws") || lowerName.includes("linux") || lowerName.includes("devops") || lowerName.includes("pipeline") || lowerName.includes("tmux")) {
    category = "devops-cloud";
    domain = "devops";
    occupation = "devops-engineer";
  }
  // 4. Testing & QA (Only genuine testing tools)
  else if (lowerName.includes("playwright") || lowerName.includes("vitest") || lowerName.includes("jest") || lowerName.includes("junit") || lowerName.includes("pytest") || lowerName.includes("-testing") || lowerName.includes("-tdd") || lowerName.includes("qa-") || lowerName.includes("-qa") || lowerName.includes("e2e-") || lowerName.includes("test-case") || lowerName.includes("test-design")) {
    category = "testing-qa";
    domain = "software";
    occupation = "qa-engineer";
  }
  // 5. Frontend & UI
  else if (lowerName.includes("react") || lowerName.includes("vue") || lowerName.includes("angular") || lowerName.includes("svelte") || lowerName.includes("tailwind") || lowerName.includes("frontend") || lowerName.includes("css") || lowerName.includes("ui-") || lowerName.includes("-ui") || lowerName.includes("wechat-html") || lowerName.includes("miniprogram")) {
    category = "frontend-ui";
    domain = "software";
    occupation = "frontend-developer";
  }
  // 6. Backend & APIs
  else if (lowerName.includes("django") || lowerName.includes("fastapi") || lowerName.includes("nestjs") || lowerName.includes("springboot") || lowerName.includes("spring-boot") || lowerName.includes("golang-patterns") || lowerName.includes("dotnet-patterns") || lowerName.includes("backend") || lowerName.includes("api-") || lowerName.includes("-api") || lowerName.includes("rest-api")) {
    category = "backend-api";
    domain = "software";
    occupation = "backend-developer";
  }
  // 7. Database & SQL
  else if (lowerName.includes("postgres") || lowerName.includes("mysql") || lowerName.includes("redis") || lowerName.includes("sql") || lowerName.includes("database") || lowerName.includes("typeorm") || lowerName.includes("prisma") || lowerName.includes("migrations")) {
    category = "database";
    domain = "software";
    occupation = "data-scientist";
  }
  // 8. AI, LLM & Prompt Engineering
  else if (lowerName.includes("prompt") || lowerName.includes("seedance") || lowerName.includes("midjourney") || lowerName.includes("gpt") || lowerName.includes("claude") || lowerName.includes("whisper") || lowerName.includes("diffusion") || lowerName.includes("agent-") || lowerName.includes("-agent") || lowerName.includes("llm") || lowerName.includes("comfyui")) {
    category = "ai-ml";
    domain = lowerName.includes("video") || lowerName.includes("image") ? "media" : "software";
    occupation = lowerName.includes("video") || lowerName.includes("image") ? "content-creator" : "data-scientist";
  }
  // 9. Research & Academia
  else if (lowerName.includes("paper") || lowerName.includes("nature") || lowerName.includes("academic") || lowerName.includes("arxiv") || lowerName.includes("patent") || lowerName.includes("latex") || lowerName.includes("pdb-") || lowerName.includes("pubmed") || lowerName.includes("literature") || lowerName.includes("citation")) {
    category = "research-academia";
    domain = "academia";
    occupation = lowerName.includes("patent") ? "patent-engineer" : "researcher";
  }
  // 10. Media & Creative Content
  else if (lowerName.includes("novel") || lowerName.includes("story") || lowerName.includes("video") || lowerName.includes("cinema") || lowerName.includes("audio") || lowerName.includes("speech") || lowerName.includes("song") || lowerName.includes("humanizer") || lowerName.includes("quill") || lowerName.includes("khazix")) {
    category = "media-content";
    domain = "media";
    occupation = "content-creator";
  }
  // 11. Productivity & Workflows
  else {
    category = "productivity-tools";
    domain = lowerName.includes("finance") ? "finance" : lowerName.includes("health") ? "healthcare" : "software";
    occupation = lowerName.includes("finance") ? "data-scientist" : lowerName.includes("health") ? "researcher" : "fullstack-developer";
  }

  // Tags extraction
  const tagSet = new Set<string>();
  for (const tok of name.toLowerCase().split(/[-_]/)) {
    if (tok.length > 2 && !["skill", "mcp", "agent", "tool", "guide", "helper", "patterns", "best", "practices"].includes(tok)) {
      tagSet.add(tok);
    }
  }

  const techTriggers = [
    "react", "vue", "angular", "svelte", "tailwind", "nextjs", "nuxt", "roblox", "luau", "studio",
    "unity", "godot", "unreal", "python", "fastapi", "django", "flask", "nodejs", "nestjs",
    "golang", "rust", "csharp", "dotnet", "cpp", "java", "springboot", "docker", "kubernetes",
    "postgres", "mysql", "redis", "graphql", "playwright", "vitest", "jest", "threejs", "blender",
    "powerbi", "obsidian", "security", "pentest", "claude", "openai", "mcp", "whisper", "seedance", "prompt"
  ];

  for (const t of techTriggers) {
    if (lowerContent.includes(t)) {
      tagSet.add(t);
    }
  }

  return {
    category,
    domain,
    occupation,
    tags: Array.from(tagSet).slice(0, 6)
  };
}

export async function rebuildMasterCatalog(): Promise<void> {
  const jsonPath = path.resolve(process.cwd(), "skills-base.json");
  const rawJson = await fsPromises.readFile(jsonPath, "utf-8");
  const skillsData: SkillEntry[] = JSON.parse(rawJson);

  console.log(`Rebuilding master catalog for ${skillsData.length} skills...`);

  let count = 0;

  for (const entry of skillsData) {
    const skillName = entry.name;
    const dir = await findSkillDirectory(skillName);

    let content = "";
    if (dir) {
      // Find primary root file
      const candidates = [
        path.join(dir, "SKILL.md"),
        path.join(dir, "skill.md"),
        path.join(dir, "README.md"),
        path.join(dir, "readme.md")
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          try {
            content = await fsPromises.readFile(p, "utf-8");
            break;
          } catch {}
        }
      }
    }

    const parsed = parseRootSkillFile(content, skillName);
    const classification = classifySkill(skillName, content, parsed.description);

    entry.description = parsed.description;
    entry.category = classification.category;
    entry.domain = classification.domain;
    entry.occupation = classification.occupation;
    entry.tags = classification.tags;

    count++;
  }

  await fsPromises.writeFile(jsonPath, JSON.stringify(skillsData, null, 2), "utf-8");
  console.log(`Successfully rebuilt master catalog with ${count} skills!`);

  await syncTaxonomyCache();
  console.log("Taxonomy cache resynced.");
}

rebuildMasterCatalog().catch(console.error);

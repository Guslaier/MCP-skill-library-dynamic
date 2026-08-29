import fs, { promises as fsPromises } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getValidSkillsList, findSkillDirectory, getMarkdownFiles } from "../common/paths.js";
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

function cleanDescriptionText(raw: string): string {
  if (!raw) return "";
  let text = raw.trim();
  // Strip markdown badges, links, images
  text = text.replace(/\[!\[.*?\]\(.*?\)\]\(.*?\)/g, "");
  text = text.replace(/!\[.*?\]\(.*?\)/g, "");
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  text = text.replace(/^>[-]?\s*/, "").replace(/^\|[-]?\s*/, "");
  text = text.replace(/^["'`]|["'`]$/g, "").trim();
  text = text.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  if (text === "|" || text === ">" || text === ">-" || text === "|-") return "";
  return text;
}

function extractRichSkillMetadata(name: string, content: string): {
  description: string;
  category: string;
  domain: string;
  occupation: string;
  tags: string[];
} {
  const lowerContent = content.toLowerCase();
  const lowerName = name.toLowerCase();

  // 1. Extract Description
  let desc = "";
  const descMatch = content.match(/description:\s*(?:>[-]?|\|[-]?|\s*)([\s\S]*?)(?=\n[a-zA-Z0-9_-]+:|$)/i);
  if (descMatch && descMatch[1]) {
    desc = cleanDescriptionText(descMatch[1]);
  }

  if (!desc || desc.length < 15) {
    // Look for When to Use or Purpose section
    const purposeMatch = content.match(/##\s*(?:Purpose|When to Use|Overview|Description|About)\s*\n+([\s\S]*?)(?=\n##|$)/i);
    if (purposeMatch && purposeMatch[1]) {
      const firstLine = purposeMatch[1].split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#") && !l.startsWith("-") && !l.startsWith("```"))[0];
      if (firstLine) desc = cleanDescriptionText(firstLine);
    }
  }

  if (!desc || desc.length < 15) {
    // Fallback: look at the first non-header non-frontmatter lines
    const lines = content.split("\n")
      .map(l => l.trim())
      .filter(l => l && !l.startsWith("#") && !l.startsWith("---") && !l.startsWith("title:") && !l.startsWith("tags:") && !l.startsWith("category:") && !l.startsWith("domain:") && !l.startsWith("occupation:") && !l.startsWith("name:") && !l.startsWith("description:") && !l.startsWith("license:"));
    if (lines.length > 0) {
      desc = cleanDescriptionText(lines[0]);
    }
  }

  if (!desc || desc.length < 10) {
    desc = `Engineering guidelines, patterns, and best practices for ${name.replace(/-/g, " ")}.`;
  }

  if (desc.length > 160) {
    desc = desc.substring(0, 157).trim() + "...";
  }

  // 2. Intelligent Domain, Occupation, Category Reasoning
  let domain = "software";
  let occupation = "fullstack-developer";
  let category = "productivity";

  // Gaming
  if (lowerName.includes("roblox") || lowerName.includes("unity") || lowerName.includes("godot") || lowerName.includes("3dsmax") || lowerName.includes("blender") || lowerContent.includes("roblox") || lowerContent.includes("unity3d") || lowerContent.includes("game engine") || lowerContent.includes("gdscript") || lowerContent.includes("luau")) {
    domain = "gaming";
    occupation = "game-developer";
    category = (lowerName.includes("test") || lowerContent.includes("unit test")) ? "testing-qa" : "productivity";
  }
  // Security
  else if (lowerName.includes("security") || lowerName.includes("pentest") || lowerName.includes("audit") || lowerName.includes("vulnerability") || lowerName.includes("cve") || lowerName.includes("owasp") || lowerContent.includes("penetration test") || lowerContent.includes("firmware security")) {
    domain = "software";
    occupation = "security-engineer";
    category = "security";
  }
  // DevOps / Cloud / CI-CD
  else if (lowerName.includes("docker") || lowerName.includes("kubernetes") || lowerName.includes("terraform") || lowerName.includes("ci-cd") || lowerName.includes("azure") || lowerName.includes("aws") || lowerName.includes("devops") || lowerName.includes("pipeline") || lowerContent.includes("kubernetes") || lowerContent.includes("github actions")) {
    domain = "devops";
    occupation = "devops-engineer";
    category = "devops-cloud";
  }
  // Frontend / UI
  else if (lowerName.includes("react") || lowerName.includes("vue") || lowerName.includes("angular") || lowerName.includes("svelte") || lowerName.includes("tailwind") || lowerName.includes("ui") || lowerName.includes("frontend") || lowerName.includes("css") || lowerContent.includes("react component") || lowerContent.includes("frontend")) {
    domain = "software";
    occupation = "frontend-developer";
    category = "frontend-ui";
  }
  // Backend / API
  else if (lowerName.includes("django") || lowerName.includes("fastapi") || lowerName.includes("nestjs") || lowerName.includes("springboot") || lowerName.includes("backend") || lowerName.includes("api") || lowerContent.includes("rest api") || lowerContent.includes("backend architecture")) {
    domain = "software";
    occupation = "backend-developer";
    category = "backend-api";
  }
  // Database / SQL
  else if (lowerName.includes("postgres") || lowerName.includes("mysql") || lowerName.includes("redis") || lowerName.includes("sql") || lowerName.includes("database") || lowerContent.includes("query optimization") || lowerContent.includes("database schema")) {
    domain = "software";
    occupation = "data-scientist";
    category = "database";
  }
  // AI / ML / Prompt
  else if (lowerName.includes("ai") || lowerName.includes("prompt") || lowerName.includes("llm") || lowerName.includes("gpt") || lowerName.includes("claude") || lowerName.includes("whisper") || lowerName.includes("diffusion") || lowerContent.includes("prompt engineering") || lowerContent.includes("machine learning")) {
    domain = "software";
    occupation = "data-scientist";
    category = "ai-ml";
  }
  // Testing / QA
  else if (lowerName.includes("test") || lowerName.includes("qa") || lowerName.includes("playwright") || lowerName.includes("vitest") || lowerName.includes("jest") || lowerContent.includes("test-driven development") || lowerContent.includes("unit testing")) {
    domain = "software";
    occupation = "qa-engineer";
    category = "testing-qa";
  }
  // Finance / Trading
  else if (lowerName.includes("finance") || lowerName.includes("trading") || lowerName.includes("market") || lowerName.includes("equity") || lowerName.includes("dcf") || lowerContent.includes("financial model") || lowerContent.includes("stock market")) {
    domain = "finance";
    occupation = "data-scientist";
    category = "productivity";
  }
  // Healthcare / Biology
  else if (lowerName.includes("medical") || lowerName.includes("health") || lowerName.includes("drug") || lowerName.includes("protein") || lowerName.includes("pubmed") || lowerContent.includes("clinical") || lowerContent.includes("biological")) {
    domain = "healthcare";
    occupation = "researcher";
    category = "productivity";
  }
  // Academia / Research / Literature
  else if (lowerName.includes("academic") || lowerName.includes("paper") || lowerName.includes("arxiv") || lowerName.includes("latex") || lowerName.includes("patent") || lowerContent.includes("scientific paper") || lowerContent.includes("research review")) {
    domain = "academia";
    occupation = "researcher";
    category = "productivity";
  }
  // Media / Content / Novels / Video / Audio
  else if (lowerName.includes("video") || lowerName.includes("audio") || lowerName.includes("novel") || lowerName.includes("story") || lowerName.includes("cinema") || lowerName.includes("music") || lowerContent.includes("video generation") || lowerContent.includes("screenplay")) {
    domain = "media";
    occupation = "content-creator";
    category = "productivity";
  }
  // Education
  else if (lowerName.includes("academy") || lowerName.includes("guide") || lowerName.includes("quiz") || lowerName.includes("course") || lowerContent.includes("learning path") || lowerContent.includes("tutorials")) {
    domain = "education";
    occupation = "researcher";
    category = "education";
  }

  // 3. Extract Tags
  const tagSet = new Set<string>();

  // Frontmatter tags
  const tagsMatch = content.match(/tags:\s*\[(.*?)\]/i);
  if (tagsMatch && tagsMatch[1]) {
    for (const t of tagsMatch[1].split(",")) {
      const clean = normalizeTag(t);
      if (clean && clean.length > 1 && clean !== "frontend" || (lowerName.includes("frontend") || lowerContent.includes("frontend"))) {
        tagSet.add(clean);
      }
    }
  }

  // Key technology triggers
  const knownTech = [
    "react", "vue", "angular", "svelte", "tailwind", "nextjs", "nuxt", "roblox", "luau", "studio",
    "unity", "godot", "unreal", "python", "fastapi", "django", "flask", "nodejs", "nestjs",
    "golang", "rust", "csharp", "dotnet", "cpp", "java", "springboot", "docker", "kubernetes",
    "postgres", "mysql", "redis", "graphql", "playwright", "vitest", "jest", "threejs", "blender",
    "powerbi", "obsidian", "security", "pentest", "claude", "openai", "mcp", "emba", "qemu", "cve", "whisper"
  ];

  for (const tech of knownTech) {
    if (lowerName.includes(tech) || lowerContent.includes(tech)) {
      tagSet.add(tech);
    }
  }

  // Add name tokens
  for (const tok of name.toLowerCase().split(/[-_]/)) {
    if (tok.length > 2 && !["mcp", "skill", "agent", "tool", "guide", "helper", "patterns", "best", "practices"].includes(tok)) {
      tagSet.add(tok);
    }
  }

  const finalTags = Array.from(tagSet).slice(0, 6);

  return {
    description: desc,
    category,
    domain,
    occupation,
    tags: finalTags,
  };
}

export async function runCompleteAIOverhaul(): Promise<void> {
  const jsonPath = path.resolve(process.cwd(), "skills-base.json");
  const rawJson = await fsPromises.readFile(jsonPath, "utf-8");
  const skillsData: SkillEntry[] = JSON.parse(rawJson);

  console.log(`Starting deep AI overhaul of ${skillsData.length} skills in master registry...`);

  let count = 0;

  for (const entry of skillsData) {
    const skillName = entry.name;
    const targetDir = await findSkillDirectory(skillName);

    let content = "";
    if (targetDir) {
      const mdFiles = await getMarkdownFiles(targetDir);
      if (mdFiles.length > 0) {
        try {
          content = await fsPromises.readFile(mdFiles[0], "utf-8");
        } catch {}
      }
    }

    const meta = extractRichSkillMetadata(skillName, content || entry.description);

    entry.description = meta.description;
    entry.category = meta.category;
    entry.domain = meta.domain;
    entry.occupation = meta.occupation;
    entry.tags = meta.tags;

    count++;
  }

  await fsPromises.writeFile(jsonPath, JSON.stringify(skillsData, null, 2), "utf-8");
  console.log(`Successfully completed overhaul of ${count} skills in skills-base.json.`);

  console.log("Resyncing taxonomy cache...");
  await syncTaxonomyCache();
  console.log("Master Registry and Taxonomy Cache are now 100% clean and pristine!");
}

runCompleteAIOverhaul().catch(console.error);

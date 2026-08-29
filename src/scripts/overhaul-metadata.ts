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

function cleanDescription(raw: string): string {
  if (!raw) return "";
  let text = raw.trim();
  // Remove markdown quotes, backticks, yaml indicators
  text = text.replace(/^>[-]?\s*/, "").replace(/^\|[-]?\s*/, "");
  text = text.replace(/^["'`]|["'`]$/g, "").trim();
  text = text.replace(/\n+/g, " ").replace(/\s+/g, " ");
  if (text === "|" || text === ">" || text === ">-" || text === "|-") return "";
  return text;
}

function extractKeywordsFromText(content: string, name: string): string[] {
  const lower = (name + " " + content).toLowerCase();
  const keywords: string[] = [];

  const techMap: Record<string, string[]> = {
    "react": ["react", "jsx", "tsx", "next.js", "nextjs", "hooks", "useeffect", "usestate"],
    "vue": ["vue", "vue3", "pinia", "nuxt", "vue-router"],
    "angular": ["angular", "rxjs", "ngrx"],
    "svelte": ["svelte", "sveltekit"],
    "tailwind": ["tailwind", "tailwindcss"],
    "roblox": ["roblox", "luau", "studio", "modulescript", "rbx"],
    "unity": ["unity", "unity3d", "c#", "monobehaviour", "dots", "ecs"],
    "godot": ["godot", "gdscript"],
    "python": ["python", "pytest", "fastapi", "django", "flask", "pydantic", "pandas", "numpy"],
    "django": ["django", "drf", "django-rest-framework"],
    "fastapi": ["fastapi", "pydantic", "uvicorn"],
    "flask": ["flask", "werkzeug"],
    "nodejs": ["node", "nodejs", "express", "nestjs", "fastify"],
    "nestjs": ["nestjs", "typeorm", "prisma"],
    "golang": ["golang", "go", "goroutine", "gin", "gorm"],
    "rust": ["rust", "cargo", "tokio", "serde", "axum"],
    "csharp": ["c#", ".net", "dotnet", "asp.net", "csharp"],
    "cpp": ["c++", "cpp", "cmake", "googletest"],
    "java": ["java", "springboot", "spring-boot", "junit", "maven", "gradle"],
    "docker": ["docker", "dockerfile", "container", "compose"],
    "kubernetes": ["kubernetes", "k8s", "helm"],
    "postgres": ["postgres", "postgresql", "psql", "pg"],
    "mysql": ["mysql", "mariadb"],
    "redis": ["redis", "cache"],
    "graphql": ["graphql", "apollo"],
    "playwright": ["playwright", "e2e"],
    "vitest": ["vitest", "jest"],
    "threejs": ["threejs", "webgl", "3d"],
    "blender": ["blender", "3dsmax", "cad"],
    "powerbi": ["powerbi", "power-bi", "dax"],
    "obsidian": ["obsidian", "markdown"],
    "security": ["security", "pentest", "vulnerability", "cve", "owasp", "firmware"],
    "claude": ["claude", "anthropic"],
    "openai": ["openai", "gpt", "whisper"],
    "mcp": ["mcp", "modelcontextprotocol"],
  };

  for (const [tag, patterns] of Object.entries(techMap)) {
    if (patterns.some(p => lower.includes(p))) {
      keywords.push(tag);
    }
  }

  return keywords;
}

function inferDomainAndOccupation(name: string, content: string, tags: string[]): { domain: string; occupation: string; category: string } {
  const lower = (name + " " + content + " " + tags.join(" ")).toLowerCase();

  // Gaming
  if (lower.includes("roblox") || lower.includes("unity") || lower.includes("godot") || lower.includes("game") || lower.includes("gamedev") || lower.includes("3dsmax") || lower.includes("blender")) {
    return { domain: "gaming", occupation: "game-developer", category: lower.includes("test") ? "testing" : "productivity" };
  }

  // Security / Pentest
  if (lower.includes("security") || lower.includes("pentest") || lower.includes("vulnerability") || lower.includes("cve") || lower.includes("exploit") || lower.includes("audit") || lower.includes("owasp")) {
    return { domain: "software", occupation: "security-engineer", category: "security" };
  }

  // DevOps / Cloud / Infrastructure
  if (lower.includes("kubernetes") || lower.includes("docker") || lower.includes("terraform") || lower.includes("ci-cd") || lower.includes("devops") || lower.includes("aws") || lower.includes("azure") || lower.includes("gcp") || lower.includes("pipeline")) {
    return { domain: "devops", occupation: "devops-engineer", category: "devops" };
  }

  // Frontend / UI
  if (lower.includes("react") || lower.includes("vue") || lower.includes("angular") || lower.includes("svelte") || lower.includes("tailwind") || lower.includes("css") || lower.includes("frontend") || lower.includes("ui") || lower.includes("component")) {
    return { domain: "software", occupation: "frontend-developer", category: "frontend" };
  }

  // Backend / API / Database
  if (lower.includes("backend") || lower.includes("api") || lower.includes("django") || lower.includes("fastapi") || lower.includes("nestjs") || lower.includes("springboot") || lower.includes("postgres") || lower.includes("mysql") || lower.includes("redis") || lower.includes("sql")) {
    return { domain: "software", occupation: "backend-developer", category: lower.includes("database") || lower.includes("sql") ? "database" : "backend" };
  }

  // Data Science / AI / ML
  if (lower.includes("machine learning") || lower.includes("deep learning") || lower.includes("ai-ml") || lower.includes("pandas") || lower.includes("numpy") || lower.includes("pytorch") || lower.includes("tensorflow") || lower.includes("llm") || lower.includes("prompt")) {
    return { domain: "software", occupation: "data-scientist", category: "ai-ml" };
  }

  // Testing / QA
  if (lower.includes("test") || lower.includes("qa") || lower.includes("playwright") || lower.includes("vitest") || lower.includes("jest") || lower.includes("junit") || lower.includes("pytest")) {
    return { domain: "software", occupation: "qa-engineer", category: "testing" };
  }

  // Finance
  if (lower.includes("finance") || lower.includes("financial") || lower.includes("trading") || lower.includes("dcf") || lower.includes("market") || lower.includes("stock") || lower.includes("equity")) {
    return { domain: "finance", occupation: "data-scientist", category: "productivity" };
  }

  // Healthcare
  if (lower.includes("healthcare") || lower.includes("medical") || lower.includes("drug") || lower.includes("protein") || lower.includes("biology") || lower.includes("pubmed")) {
    return { domain: "healthcare", occupation: "researcher", category: "productivity" };
  }

  // Academia / Research
  if (lower.includes("paper") || lower.includes("academic") || lower.includes("arxiv") || lower.includes("literature") || lower.includes("latex") || lower.includes("citation")) {
    return { domain: "academia", occupation: "researcher", category: "productivity" };
  }

  // Media / Content
  if (lower.includes("video") || lower.includes("audio") || lower.includes("cinema") || lower.includes("music") || lower.includes("podcast") || lower.includes("novel") || lower.includes("story") || lower.includes("speech") || lower.includes("tts")) {
    return { domain: "media", occupation: "content-creator", category: "productivity" };
  }

  // Default Software Fullstack
  return { domain: "software", occupation: "fullstack-developer", category: "productivity" };
}

export async function overhaulAllMetadata(): Promise<void> {
  const jsonPath = path.resolve(process.cwd(), "skills-base.json");
  const rawJson = await fsPromises.readFile(jsonPath, "utf-8");
  const skillsData: SkillEntry[] = JSON.parse(rawJson);

  console.log(`Starting overhaul of ${skillsData.length} skills in skills-base.json...`);

  let updatedCount = 0;

  for (const entry of skillsData) {
    const skillName = entry.name;
    const targetDir = await findSkillDirectory(skillName);

    let content = "";
    let frontmatterDesc = "";
    let frontmatterTags: string[] = [];

    if (targetDir) {
      const mdFiles = await getMarkdownFiles(targetDir);
      if (mdFiles.length > 0) {
        try {
          content = await fsPromises.readFile(mdFiles[0], "utf-8");
          const descMatch = content.match(/description:\s*(.+)/i);
          if (descMatch && descMatch[1]) {
            frontmatterDesc = cleanDescription(descMatch[1]);
          }
          const tagsMatch = content.match(/tags:\s*\[(.*?)\]/i);
          if (tagsMatch && tagsMatch[1]) {
            frontmatterTags = tagsMatch[1].split(",").map(t => normalizeTag(t)).filter(t => t);
          }
        } catch {}
      }
    }

    // 1. Resolve Description
    let finalDesc = cleanDescription(entry.description);
    if (!finalDesc || finalDesc === "|" || finalDesc === ">" || finalDesc.length < 15) {
      if (frontmatterDesc && frontmatterDesc.length >= 15) {
        finalDesc = frontmatterDesc;
      } else if (content) {
        // Extract first meaningful text line
        const lines = content.split("\n")
          .map(l => l.trim())
          .filter(l => l && !l.startsWith("#") && !l.startsWith("---") && !l.startsWith("title:") && !l.startsWith("tags:") && !l.startsWith("category:") && !l.startsWith("domain:") && !l.startsWith("occupation:") && !l.startsWith("name:") && !l.startsWith("description:"));
        if (lines.length > 0) {
          finalDesc = lines[0].replace(/^["'`]|["'`]$/g, "").substring(0, 160).trim();
        }
      }
    }
    if (!finalDesc || finalDesc.length < 10) {
      finalDesc = `Guidelines, patterns, and best practices for ${skillName.replace(/-/g, " ")}.`;
    }
    if (finalDesc.length > 160) {
      finalDesc = finalDesc.substring(0, 157).trim() + "...";
    }

    // 2. Resolve Tags (Deduplicated & Cleaned)
    const detectedTags = extractKeywordsFromText(content, skillName);
    const existingTags = (entry.tags || []).map(t => normalizeTag(t)).filter(t => t && t !== "frontend" || skillName.includes("frontend") || content.toLowerCase().includes("frontend"));
    
    // Combine, deduplicate, filter generic noise
    const allTagsSet = new Set<string>();
    for (const t of [...frontmatterTags, ...detectedTags, ...existingTags]) {
      if (t && t.length > 1) allTagsSet.add(t);
    }
    
    // Fallback: extract tokens from name
    for (const token of skillName.toLowerCase().split(/[-_]/)) {
      if (token.length > 2 && !["mcp", "skill", "agent", "tool", "guide", "helper"].includes(token)) {
        allTagsSet.add(token);
      }
    }

    const finalTags = Array.from(allTagsSet).slice(0, 6);

    // 3. Resolve Domain, Occupation, Category
    const inferred = inferDomainAndOccupation(skillName, content, finalTags);

    entry.description = finalDesc;
    entry.tags = finalTags;
    entry.domain = inferred.domain;
    entry.occupation = inferred.occupation;
    entry.category = inferred.category;

    updatedCount++;
  }

  await fsPromises.writeFile(jsonPath, JSON.stringify(skillsData, null, 2), "utf-8");
  console.log(`Successfully overhauled ${updatedCount} skills in skills-base.json.`);

  console.log("Resyncing taxonomy cache...");
  await syncTaxonomyCache();
  console.log("Taxonomy cache resynced successfully!");
}

overhaulAllMetadata().catch(console.error);

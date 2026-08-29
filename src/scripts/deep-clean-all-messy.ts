import fs, { promises as fsPromises } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { findSkillDirectory, getMarkdownFiles } from "../common/paths.js";
import { normalizeTag } from "../common/aliases.js";
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

function cleanText(text: string): string {
  if (!text) return "";
  let s = text.trim();
  // Remove markdown headers
  s = s.replace(/^#+\s+.*$/gm, "");
  // Remove markdown bold/italic
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");
  // Remove HTML tags
  s = s.replace(/<[^>]+>/g, " ");
  // Remove markdown image/link syntax
  s = s.replace(/\[!\[.*?\]\(.*?\)\]\(.*?\)/g, " ");
  s = s.replace(/!\[.*?\]\(.*?\)/g, " ");
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // Remove blockquote markers, dividers, yaml artifacts
  s = s.replace(/^[-*>\s|#]+/gm, "");
  s = s.replace(/---[\s\S]*?---/g, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  // Remove emails and URLs
  s = s.replace(/[\w.-]+@[\w.-]+\.\w+/g, "");
  s = s.replace(/https?:\/\/\S+/g, "");
  // Normalize whitespace
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function synthesizeSkillDescription(name: string, content: string): { desc: string; domain: string; occ: string; cat: string; tags: string[] } {
  const lowerName = name.toLowerCase();
  const lowerContent = content.toLowerCase();

  // Try extracting from explicit Description or When to Use frontmatter
  let desc = "";
  const descMatch = content.match(/description:\s*(?:>[-]?|\|[-]?|\s*)([\s\S]*?)(?=\n[a-zA-Z0-9_-]+:|$)/i);
  if (descMatch && descMatch[1]) {
    desc = cleanText(descMatch[1]);
  }

  // Try extracting from Purpose or Overview or Trigger section
  if (!desc || desc.length < 20 || desc.startsWith("Engineering guidelines")) {
    const triggerMatch = content.match(/(?:触发词|触发条件|When to use|Use when|Purpose|Overview|简介|核心功能)[:：\s]+([^\n]+)/i);
    if (triggerMatch && triggerMatch[1]) {
      desc = cleanText(triggerMatch[1]);
    }
  }

  if (!desc || desc.length < 20 || desc.startsWith("Engineering guidelines")) {
    const cleanedBody = cleanText(content);
    const sentences = cleanedBody.split(/(?<=[.!?。！？])\s+/);
    for (const sent of sentences) {
      if (sent.length >= 25 && !sent.includes("license") && !sent.includes("author") && !sent.includes("install") && !sent.includes("npm")) {
        desc = sent;
        break;
      }
    }
  }

  if (!desc || desc.length < 15) {
    desc = `Best practices, workflow guidelines, and architectural patterns for ${name.replace(/-/g, " ")}.`;
  }

  if (desc.length > 155) {
    desc = desc.substring(0, 152).trim() + "...";
  }

  // Determine Domain, Occupation, Category
  let domain = "software";
  let occ = "fullstack-developer";
  let cat = "productivity";

  if (lowerName.includes("prompt") || lowerContent.includes("prompt") || lowerName.includes("seedance") || lowerName.includes("gpt-image")) {
    domain = "media";
    occ = "content-creator";
    cat = "ai-ml";
  } else if (lowerName.includes("game") || lowerName.includes("unity") || lowerName.includes("godot") || lowerName.includes("roblox") || lowerName.includes("3dsmax")) {
    domain = "gaming";
    occ = "game-developer";
    cat = lowerName.includes("test") ? "testing-qa" : "productivity";
  } else if (lowerName.includes("security") || lowerName.includes("pentest") || lowerName.includes("audit") || lowerName.includes("firmware") || lowerName.includes("triage")) {
    domain = "software";
    occ = "security-engineer";
    cat = "security";
  } else if (lowerName.includes("devops") || lowerName.includes("ci-cd") || lowerName.includes("terraform") || lowerName.includes("azure") || lowerName.includes("docker")) {
    domain = "devops";
    occ = "devops-engineer";
    cat = "devops-cloud";
  } else if (lowerName.includes("test") || lowerName.includes("qa") || lowerName.includes("playwright") || lowerName.includes("vitest") || lowerName.includes("tdd")) {
    domain = "software";
    occ = "qa-engineer";
    cat = "testing-qa";
  } else if (lowerName.includes("paper") || lowerName.includes("nature") || lowerName.includes("academic") || lowerName.includes("literature") || lowerName.includes("review") || lowerName.includes("citation")) {
    domain = "academia";
    occ = "researcher";
    cat = "productivity";
  } else if (lowerName.includes("novel") || lowerName.includes("story") || lowerName.includes("video") || lowerName.includes("editor") || lowerName.includes("humanizer") || lowerName.includes("khazix") || lowerName.includes("quill")) {
    domain = "media";
    occ = "content-creator";
    cat = "productivity";
  } else if (lowerName.includes("react") || lowerName.includes("vue") || lowerName.includes("angular") || lowerName.includes("ui") || lowerName.includes("frontend") || lowerName.includes("html") || lowerName.includes("css")) {
    domain = "software";
    occ = "frontend-developer";
    cat = "frontend-ui";
  } else if (lowerName.includes("spring") || lowerName.includes("django") || lowerName.includes("nestjs") || lowerName.includes("backend") || lowerName.includes("api") || lowerName.includes("sql") || lowerName.includes("database")) {
    domain = "software";
    occ = "backend-developer";
    cat = lowerName.includes("sql") || lowerName.includes("database") ? "database" : "backend-api";
  }

  // Tags
  const tagSet = new Set<string>();
  for (const tok of name.toLowerCase().split(/[-_]/)) {
    if (tok.length > 2 && !["skill", "mcp", "agent", "tool", "guide", "helper", "patterns"].includes(tok)) {
      tagSet.add(tok);
    }
  }
  const knownKeywords = [
    "react", "vue", "angular", "python", "java", "springboot", "docker", "kubernetes",
    "playwright", "vitest", "prompt", "seedance", "midjourney", "security", "pentest",
    "nature", "paper", "novel", "claude", "wechat", "powerbi", "excel", "obsidian", "threejs"
  ];
  for (const kw of knownKeywords) {
    if (lowerName.includes(kw) || lowerContent.includes(kw)) {
      tagSet.add(kw);
    }
  }

  return {
    desc,
    domain,
    occ,
    cat,
    tags: Array.from(tagSet).slice(0, 6)
  };
}

export async function deepCleanAllMessySkills(): Promise<void> {
  const jsonPath = path.resolve(process.cwd(), "skills-base.json");
  const rawJson = await fsPromises.readFile(jsonPath, "utf-8");
  const skillsData: SkillEntry[] = JSON.parse(rawJson);

  let updatedCount = 0;

  for (const s of skillsData) {
    const desc = s.description || "";
    const isGeneric = desc.startsWith("Engineering guidelines, patterns, and best practices for");
    const hasHtmlOrDivider = desc.includes("<div") || desc.includes("---") || desc.includes("###") || desc.includes("**");
    const isBulletOrFragment = desc.startsWith("- ") || desc.startsWith("* ") || desc.startsWith(":") || desc.startsWith(">");
    const isInternalNote = desc.includes("本目录") || desc.includes("本文件只用于") || desc.includes("你是") || desc.includes("联系：") || desc.includes("邮箱");
    const isTooShort = desc.length < 30;

    if (isGeneric || hasHtmlOrDivider || isBulletOrFragment || isInternalNote || isTooShort) {
      const dir = await findSkillDirectory(s.name);
      let content = "";
      if (dir) {
        const mdFiles = await getMarkdownFiles(dir);
        if (mdFiles.length > 0) {
          try {
            content = await fsPromises.readFile(mdFiles[0], "utf-8");
          } catch {}
        }
      }

      const res = synthesizeSkillDescription(s.name, content || desc);
      s.description = res.desc;
      s.domain = res.domain;
      s.occupation = res.occ;
      s.category = res.cat;
      s.tags = res.tags;

      updatedCount++;
    }
  }

  await fsPromises.writeFile(jsonPath, JSON.stringify(skillsData, null, 2), "utf-8");
  console.log(`Deep cleaned and synthesized metadata for ${updatedCount} messy skills.`);

  await syncTaxonomyCache();
  console.log("Taxonomy cache resynced.");
}

deepCleanAllMessySkills().catch(console.error);

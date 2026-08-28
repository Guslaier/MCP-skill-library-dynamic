import fs, { promises as fsPromises } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  SKILLS_DIRS,
  getMarkdownFiles,
  getValidSkillsList,
  findSkillDirectory,
  clearSkillsCache,
} from "./paths.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CatalogSkill {
  name: string;
  githubUrl?: string;
  description?: string;
  category?: string;
}

let cachedCatalog: CatalogSkill[] | null = null;

/**
 * Retrieve skills catalog from skills-base.json.
 */
export async function getSkillsCatalog(): Promise<CatalogSkill[]> {
  if (cachedCatalog) return cachedCatalog;
  const candidates = [
    path.resolve(process.cwd(), "skills-base.json"),
    path.resolve(__dirname, "..", "skills-base.json"),
    path.resolve(__dirname, "..", "..", "skills-base.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const raw = await fsPromises.readFile(p, "utf-8");
        cachedCatalog = JSON.parse(raw) as CatalogSkill[];
        return cachedCatalog;
      } catch {}
    }
  }
  return [];
}

/**
 * Smart discovery search across installed skills & catalog.
 */
export async function findSkillsHelper(params: {
  query?: string;
  category?: string;
  installed_only?: boolean;
}) {
  const query = params.query?.trim().toLowerCase() || "";
  const categoryFilter = params.category?.trim().toLowerCase() || "";
  const installedOnly = !!params.installed_only;

  const installedSkills = await getValidSkillsList();
  const installedSet = new Set(installedSkills.map((s) => s.toLowerCase()));

  const catalog = await getSkillsCatalog();
  const catalogMap = new Map<string, CatalogSkill>();
  for (const item of catalog) {
    catalogMap.set(item.name.toLowerCase(), item);
  }

  const allNames = new Set<string>([...installedSkills, ...catalog.map((s) => s.name)]);
  const results: Array<{
    name: string;
    description: string;
    category: string;
    is_installed: boolean;
    source: string;
    is_default?: boolean;
  }> = [];

  for (const name of allNames) {
    const isInstalled = installedSet.has(name.toLowerCase());
    if (installedOnly && !isInstalled) continue;

    const catItem = catalogMap.get(name.toLowerCase());
    const desc = catItem?.description || (isInstalled ? "Locally installed skill" : "");
    const cat = catItem?.category || "general";
    const src = catItem?.githubUrl || (isInstalled ? "local" : "");

    if (categoryFilter && !cat.toLowerCase().includes(categoryFilter)) {
      continue;
    }

    if (query) {
      const matchName = name.toLowerCase().includes(query);
      const matchDesc = desc.toLowerCase().includes(query);
      const matchCat = cat.toLowerCase().includes(query);
      if (!matchName && !matchDesc && !matchCat) {
        continue;
      }
    }

    results.push({
      name,
      description: desc || "Skill guideline and best practice rules.",
      category: cat,
      is_installed: isInstalled,
      source: src,
      is_default: name === "find-skills",
    });
  }

  // Sort: default skill first, then installed skills, then alphabetically
  results.sort((a, b) => {
    if (a.name === "find-skills") return -1;
    if (b.name === "find-skills") return 1;
    if (a.is_installed !== b.is_installed) return a.is_installed ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return {
    default_skill: "find-skills",
    count: results.length,
    skills: results.slice(0, 60),
    total_matches: results.length,
  };
}

/**
 * Get detailed metadata and file breakdown for a specific skill.
 */
export async function getSkillInfoHelper(skillName: string) {
  const cleanName = skillName.trim();
  const targetDir = await findSkillDirectory(cleanName);
  const isInstalled = !!targetDir;
  let files: string[] = [];
  let description = "";
  let category = "";
  let source = "";

  const catalog = await getSkillsCatalog();
  const catalogEntry = catalog.find((s) => s.name.toLowerCase() === cleanName.toLowerCase());
  if (catalogEntry) {
    description = catalogEntry.description || "";
    category = catalogEntry.category || "";
    source = catalogEntry.githubUrl || "";
  }

  if (targetDir) {
    const mdFiles = await getMarkdownFiles(targetDir);
    files = mdFiles.map((f) => path.relative(targetDir, f));
    if (!description && mdFiles.length > 0) {
      try {
        const text = await fsPromises.readFile(mdFiles[0], "utf-8");
        const match = text.match(/description:\s*(.+)/i);
        if (match) description = match[1].trim();
      } catch {}
    }
  }

  return {
    name: cleanName,
    is_default: cleanName === "find-skills",
    is_installed: isInstalled,
    path: targetDir || null,
    files,
    description: description || "No description available.",
    category: category || "general",
    source: source || (isInstalled ? "local" : "unknown"),
  };
}

/**
 * Install a skill from catalog, GitHub URL, raw URL, or markdown content.
 */
export async function installSkillHelper(params: {
  skill_name: string;
  source?: string;
  content?: string;
  category?: string;
  description?: string;
}): Promise<{ success: boolean; message: string; path: string; skill_name: string }> {
  const cleanName = params.skill_name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  if (!cleanName) throw new Error("Invalid skill_name provided");

  const primaryDir = SKILLS_DIRS[0] || path.resolve(process.cwd(), ".agents", "skills");
  const targetDir = path.join(primaryDir, cleanName);
  await fsPromises.mkdir(targetDir, { recursive: true });

  const skillMdPath = path.join(targetDir, "SKILL.md");

  // 1. If explicit markdown content is provided
  if (params.content && params.content.trim()) {
    let mdContent = params.content.trim();
    if (!mdContent.startsWith("---")) {
      const header = `---\nname: ${cleanName}\ndescription: ${params.description || cleanName}\n---\n\n`;
      mdContent = header + mdContent;
    }
    await fsPromises.writeFile(skillMdPath, mdContent, "utf-8");
    clearSkillsCache();
    return { success: true, message: `Skill '${cleanName}' created successfully from provided content.`, path: skillMdPath, skill_name: cleanName };
  }

  // 2. If source URL is provided or find in catalog
  let sourceUrl = params.source?.trim();
  if (!sourceUrl) {
    const catalog = await getSkillsCatalog();
    const entry = catalog.find((s) => s.name.toLowerCase() === cleanName);
    if (entry && entry.githubUrl) {
      sourceUrl = entry.githubUrl;
    }
  }

  if (sourceUrl) {
    if (sourceUrl.startsWith("http://") || sourceUrl.startsWith("https://")) {
      if (sourceUrl.endsWith(".md")) {
        const res = await fetch(sourceUrl);
        if (res.ok) {
          const text = await res.text();
          await fsPromises.writeFile(skillMdPath, text, "utf-8");
          clearSkillsCache();
          return { success: true, message: `Skill '${cleanName}' downloaded from ${sourceUrl}.`, path: skillMdPath, skill_name: cleanName };
        }
      }

      const rawCandidates = [
        sourceUrl.replace("github.com", "raw.githubusercontent.com") + "/main/SKILL.md",
        sourceUrl.replace("github.com", "raw.githubusercontent.com") + `/main/skills/${cleanName}/SKILL.md`,
        sourceUrl.replace("github.com", "raw.githubusercontent.com") + `/main/.agents/skills/${cleanName}/SKILL.md`,
        sourceUrl.replace("github.com", "raw.githubusercontent.com") + `/main/.github/skills/${cleanName}/SKILL.md`,
        sourceUrl.replace("github.com", "raw.githubusercontent.com") + "/master/SKILL.md",
        sourceUrl.replace("github.com", "raw.githubusercontent.com") + `/master/skills/${cleanName}/SKILL.md`,
      ];

      for (const rawUrl of rawCandidates) {
        try {
          const res = await fetch(rawUrl);
          if (res.ok) {
            const text = await res.text();
            if (text && !text.includes("<!DOCTYPE html>") && text.length > 20) {
              await fsPromises.writeFile(skillMdPath, text, "utf-8");
              clearSkillsCache();
              return { success: true, message: `Skill '${cleanName}' installed successfully from ${rawUrl}.`, path: skillMdPath, skill_name: cleanName };
            }
          }
        } catch {}
      }
    }
  }

  // Fallback: create structured template
  const defaultTemplate = `---\nname: ${cleanName}\ndescription: ${params.description || `Rule and guidelines for ${cleanName}`}\n---\n\n# ${cleanName}\n\nGuidelines and best practices for ${cleanName}.\n`;
  await fsPromises.writeFile(skillMdPath, defaultTemplate, "utf-8");
  clearSkillsCache();
  return { success: true, message: `Skill '${cleanName}' initialized with default template.`, path: skillMdPath, skill_name: cleanName };
}

/**
 * Remove a skill from the skill directory.
 */
export async function uninstallSkillHelper(skillName: string): Promise<{ success: boolean; message: string }> {
  const cleanName = skillName.trim();
  let deleted = false;
  for (const baseDir of SKILLS_DIRS) {
    const targetDir = path.join(baseDir, cleanName);
    if (fs.existsSync(targetDir)) {
      try {
        await fsPromises.rm(targetDir, { recursive: true, force: true });
        deleted = true;
      } catch (err: any) {
        console.error(`Failed to remove ${targetDir}:`, err);
      }
    }
  }
  clearSkillsCache();
  if (!deleted) {
    return { success: false, message: `Skill '${cleanName}' not found in any skill directories.` };
  }
  return { success: true, message: `Skill '${cleanName}' uninstalled successfully.` };
}

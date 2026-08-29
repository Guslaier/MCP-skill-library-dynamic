import fs, { promises as fsPromises } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getValidSkillsList, findSkillDirectory, getMarkdownFiles } from "./paths.js";
import { getSkillsCatalog } from "./skills.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveDataDir() {
  const p = path.resolve(process.cwd(), ".data");
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return p;
}

const CATEGORIES_CACHE_FILE = path.join(resolveDataDir(), "categories.json");

export interface CategoryCache {
  [skillName: string]: string;
}

/**
 * Syncs the `.data/categories.json` cache from SKILL.md files and the master registry.
 */
export async function syncCategoriesCache(): Promise<void> {
  const cache: CategoryCache = {};
  
  // 1. Fallback: load from master registry (skills-base.json)
  const catalog = await getSkillsCatalog();
  for (const entry of catalog) {
    if (entry.category) {
      cache[entry.name.toLowerCase()] = entry.category.toLowerCase();
    }
  }

  // 2. Highest Priority: Local SKILL.md Frontmatter
  const installedSkills = await getValidSkillsList();
  for (const skillName of installedSkills) {
    const targetDir = await findSkillDirectory(skillName);
    if (!targetDir) continue;

    const mdFiles = await getMarkdownFiles(targetDir);
    if (mdFiles.length === 0) continue;

    try {
      const content = await fsPromises.readFile(mdFiles[0], "utf-8");
      // Naive frontmatter regex for `category: some-cat`
      const match = content.match(/category:\s*([a-zA-Z0-9_-]+)/i);
      if (match && match[1]) {
        cache[skillName.toLowerCase()] = match[1].toLowerCase();
      }
    } catch (e) {
      // ignore read errors
    }
  }

  await fsPromises.writeFile(CATEGORIES_CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
}

/**
 * Returns grouped categories and their counts.
 */
export async function getCategorySummary(): Promise<Record<string, number>> {
  if (!fs.existsSync(CATEGORIES_CACHE_FILE)) {
    await syncCategoriesCache();
  }
  
  let cache: CategoryCache = {};
  try {
    const raw = await fsPromises.readFile(CATEGORIES_CACHE_FILE, "utf-8");
    cache = JSON.parse(raw);
  } catch (e) {
    return {};
  }

  const summary: Record<string, number> = {};
  for (const cat of Object.values(cache)) {
    summary[cat] = (summary[cat] || 0) + 1;
  }
  
  return summary;
}

/**
 * Gets the cached category for a skill.
 */
export async function getSkillCategory(skillName: string): Promise<string> {
  if (!fs.existsSync(CATEGORIES_CACHE_FILE)) {
    await syncCategoriesCache();
  }
  try {
    const raw = await fsPromises.readFile(CATEGORIES_CACHE_FILE, "utf-8");
    const cache: CategoryCache = JSON.parse(raw);
    return cache[skillName.toLowerCase()] || "general";
  } catch (e) {
    return "general";
  }
}

/**
 * Updates a skill's category in BOTH the master registry and local SKILL.md.
 */
export async function updateSkillCategoryHelper(skillName: string, newCategory: string): Promise<boolean> {
  const cleanName = skillName.trim().toLowerCase();
  const cleanCat = newCategory.trim().toLowerCase();
  let updatedSomething = false;

  // 1. Update master registry (skills-base.json)
  const candidates = [
    path.resolve(process.cwd(), "skills-base.json"),
    path.resolve(__dirname, "..", "..", "skills-base.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const raw = await fsPromises.readFile(p, "utf-8");
        const data = JSON.parse(raw);
        let found = false;
        for (const entry of data) {
          if (entry.name && entry.name.toLowerCase() === cleanName) {
            entry.category = cleanCat;
            found = true;
          }
        }
        if (found) {
          await fsPromises.writeFile(p, JSON.stringify(data, null, 2), "utf-8");
          updatedSomething = true;
        }
      } catch (e) {}
    }
  }

  // 2. Update local SKILL.md if installed
  const targetDir = await findSkillDirectory(cleanName);
  if (targetDir) {
    const mdFiles = await getMarkdownFiles(targetDir);
    if (mdFiles.length > 0) {
      try {
        const filePath = mdFiles[0];
        let content = await fsPromises.readFile(filePath, "utf-8");
        
        // Check if category exists
        if (/category:\s*([a-zA-Z0-9_-]+)/i.test(content)) {
          content = content.replace(/category:\s*([a-zA-Z0-9_-]+)/i, `category: ${cleanCat}`);
        } else {
          // Insert into frontmatter if it exists
          if (content.startsWith("---")) {
            content = content.replace("---", `---\ncategory: ${cleanCat}`);
          } else {
            // No frontmatter, create it
            content = `---\ncategory: ${cleanCat}\n---\n\n${content}`;
          }
        }
        await fsPromises.writeFile(filePath, content, "utf-8");
        updatedSomething = true;
      } catch (e) {}
    }
  }

  // Resync cache
  await syncCategoriesCache();
  return updatedSomething;
}

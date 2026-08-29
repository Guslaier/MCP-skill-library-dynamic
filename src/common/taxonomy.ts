import fs, { promises as fsPromises } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getValidSkillsList, findSkillDirectory, getMarkdownFiles } from "./paths.js";
import { getSkillsCatalog } from "./skills.js";
import { normalizeCanonicalTerm, normalizeTag } from "./aliases.js";

import { resolveDataDir } from "../modules/storage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getTaxonomyCacheFilePath(): string {
  return path.join(resolveDataDir(), "taxonomy.json");
}

export const TAXONOMY_CACHE_FILE = getTaxonomyCacheFilePath();

export interface TaxonomyEntry {
  category: string;
  domain?: string;
  occupation?: string;
  tags?: string[];
  description?: string;
}

export interface TaxonomyCache {
  [skillName: string]: TaxonomyEntry;
}

/**
 * Syncs the `.data/taxonomy.json` cache from SKILL.md files and the master registry.
 */
export async function syncTaxonomyCache(): Promise<void> {
  const cache: TaxonomyCache = {};
  
  // 1. Fallback: load from master registry (skills-base.json)
  const catalog = await getSkillsCatalog();
  for (const entry of catalog) {
    cache[entry.name.toLowerCase()] = {
      category: entry.category?.toLowerCase() || "general",
      domain: entry.domain?.toLowerCase(),
      occupation: entry.occupation?.toLowerCase(),
      tags: entry.tags?.map(t => normalizeTag(t)) || [],
      description: entry.description,
    };
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
      
      const entry = cache[skillName.toLowerCase()] || { category: "general" };
      
      const catMatch = content.match(/category:\s*([a-zA-Z0-9_-]+)/i);
      if (catMatch && catMatch[1]) entry.category = normalizeCanonicalTerm(catMatch[1], "category");

      const domMatch = content.match(/domain:\s*([a-zA-Z0-9_-]+)/i);
      if (domMatch && domMatch[1]) entry.domain = normalizeCanonicalTerm(domMatch[1], "domain");

      const occMatch = content.match(/occupation:\s*([a-zA-Z0-9_-]+)/i);
      if (occMatch && occMatch[1]) entry.occupation = normalizeCanonicalTerm(occMatch[1], "occupation");

      const tagsMatch = content.match(/tags:\s*\[(.*?)\]/i);
      if (tagsMatch && tagsMatch[1]) {
        entry.tags = tagsMatch[1].split(",").map(t => normalizeTag(t.trim())).filter(t => t);
      }

      const descMatch = content.match(/description:\s*(.+)/i);
      if (descMatch && descMatch[1]) {
        entry.description = descMatch[1].trim();
      }

      cache[skillName.toLowerCase()] = entry;
    } catch (e) {
      // ignore read errors
    }
  }

  await fsPromises.writeFile(TAXONOMY_CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
}

/**
 * Returns grouped taxonomy summary.
 */
export async function getTaxonomySummary() {
  if (!fs.existsSync(TAXONOMY_CACHE_FILE)) {
    await syncTaxonomyCache();
  }
  
  let cache: TaxonomyCache = {};
  try {
    const raw = await fsPromises.readFile(TAXONOMY_CACHE_FILE, "utf-8");
    cache = JSON.parse(raw);
  } catch (e) {
    return { categories: {}, domains: {}, occupations: {}, noninit_count: 0, total_skills: 0 };
  }

  const summary = {
    categories: {} as Record<string, number>,
    domains: {} as Record<string, number>,
    occupations: {} as Record<string, number>,
    noninit_count: 0,
    total_skills: Object.keys(cache).length,
  };

  for (const entry of Object.values(cache)) {
    if (entry.category) summary.categories[entry.category] = (summary.categories[entry.category] || 0) + 1;
    if (entry.domain) summary.domains[entry.domain] = (summary.domains[entry.domain] || 0) + 1;
    if (entry.occupation) summary.occupations[entry.occupation] = (summary.occupations[entry.occupation] || 0) + 1;
    
    // Check if skill is non-initialized (missing domain/occupation or default general/noninit)
    const isNonInit = (!entry.domain && !entry.occupation && (!entry.tags || entry.tags.length === 0)) || 
                      entry.category === "general" || 
                      entry.category === "noninit" || 
                      entry.category === "uncategorized";
    if (isNonInit) {
      summary.noninit_count++;
    }
  }
  
  return summary;
}

/**
 * Gets the cached taxonomy entry for a skill.
 */
export async function getSkillTaxonomy(skillName: string): Promise<TaxonomyEntry> {
  if (!fs.existsSync(TAXONOMY_CACHE_FILE)) {
    await syncTaxonomyCache();
  }
  try {
    const raw = await fsPromises.readFile(TAXONOMY_CACHE_FILE, "utf-8");
    const cache: TaxonomyCache = JSON.parse(raw);
    return cache[skillName.toLowerCase()] || { category: "general" };
  } catch (e) {
    return { category: "general" };
  }
}

/**
 * Updates a skill's metadata in BOTH the master registry and local SKILL.md.
 */
export async function updateSkillMetadataHelper(
  skillName: string, 
  metadata: { category?: string, domain?: string, occupation?: string, tags?: string[] }
): Promise<boolean> {
  const cleanName = skillName.trim().toLowerCase();
  let updatedSomething = false;

  const normCategory = metadata.category ? normalizeCanonicalTerm(metadata.category, "category") : undefined;
  const normDomain = metadata.domain ? normalizeCanonicalTerm(metadata.domain, "domain") : undefined;
  const normOccupation = metadata.occupation ? normalizeCanonicalTerm(metadata.occupation, "occupation") : undefined;
  const normTags = metadata.tags ? metadata.tags.map(t => normalizeCanonicalTerm(t)) : undefined;

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
            if (normCategory) entry.category = normCategory;
            if (normDomain) entry.domain = normDomain;
            if (normOccupation) entry.occupation = normOccupation;
            if (normTags) entry.tags = normTags;
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
        
        // Helper to update or insert frontmatter property
        const updateOrInsert = (prop: string, val: string) => {
          const regex = new RegExp(`${prop}:\\s*(.+)`, "i");
          if (regex.test(content)) {
            content = content.replace(regex, `${prop}: ${val}`);
          } else {
            if (content.startsWith("---")) {
              content = content.replace("---", `---\n${prop}: ${val}`);
            } else {
              content = `---\n${prop}: ${val}\n---\n\n${content}`;
            }
          }
        };

        if (normCategory) updateOrInsert("category", normCategory);
        if (normDomain) updateOrInsert("domain", normDomain);
        if (normOccupation) updateOrInsert("occupation", normOccupation);
        if (normTags) {
          const tagsStr = `[${normTags.join(", ")}]`;
          updateOrInsert("tags", tagsStr);
        }

        await fsPromises.writeFile(filePath, content, "utf-8");
        updatedSomething = true;
      } catch (e) {}
    }
  }

  // Resync cache
  await syncTaxonomyCache();
  return updatedSomething;
}

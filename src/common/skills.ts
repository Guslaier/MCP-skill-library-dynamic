import fs, { promises as fsPromises } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getValidSkillsList, findSkillDirectory, getMarkdownFiles, clearSkillsCache, SKILLS_DIRS } from "./paths.js";
import { 
  normalizeCanonicalTerm, 
  normalizeTag,
  expandSearchQueryWithWeights, 
  isNonInitKeyword, 
  STOPWORDS, 
  tokenizeText 
} from "./aliases.js";
import { isFuzzyMatch, stringSimilarity } from "./fuzzy.js";

function matchToken(text: string, term: string): boolean {
  if (!text || !term) return false;
  const lowerText = text.toLowerCase();
  const lowerTerm = term.toLowerCase();
  if (lowerTerm.length <= 3) {
    const tokens = tokenizeText(lowerText);
    return tokens.includes(lowerTerm);
  }
  return lowerText.includes(lowerTerm);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CatalogSkill {
  name: string;
  githubUrl?: string;
  description?: string;
  category?: string;
  domain?: string;
  occupation?: string;
  tags?: string[];
}

/**
 * Retrieve skills catalog from skills-base.json.
 */
export async function getSkillsCatalog(): Promise<CatalogSkill[]> {
  const candidates = [
    path.resolve(process.cwd(), "skills-base.json"),
    path.resolve(__dirname, "..", "skills-base.json"),
    path.resolve(__dirname, "..", "..", "skills-base.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const raw = await fsPromises.readFile(p, "utf-8");
        const catalog = JSON.parse(raw) as CatalogSkill[];
        return catalog;
      } catch {}
    }
  }
  return [];
}

/**
 * In-memory frontmatter cache for on-the-fly local skill extraction
 */
const localFrontmatterCache = new Map<string, { category?: string; domain?: string; occupation?: string; tags?: string[]; description?: string }>();

async function getOrExtractLocalMetadata(skillName: string): Promise<{ category?: string; domain?: string; occupation?: string; tags?: string[]; description?: string } | null> {
  const lower = skillName.toLowerCase();
  if (localFrontmatterCache.has(lower)) {
    return localFrontmatterCache.get(lower)!;
  }
  const targetDir = await findSkillDirectory(skillName);
  if (!targetDir) return null;

  const mdFiles = await getMarkdownFiles(targetDir);
  if (mdFiles.length === 0) return null;

  try {
    const content = await fsPromises.readFile(mdFiles[0], "utf-8");
    const meta: { category?: string; domain?: string; occupation?: string; tags?: string[]; description?: string } = {};

    const catMatch = content.match(/category:\s*([a-zA-Z0-9_-]+)/i);
    if (catMatch && catMatch[1]) meta.category = normalizeCanonicalTerm(catMatch[1], "category");

    const domMatch = content.match(/domain:\s*([a-zA-Z0-9_-]+)/i);
    if (domMatch && domMatch[1]) meta.domain = normalizeCanonicalTerm(domMatch[1], "domain");

    const occMatch = content.match(/occupation:\s*([a-zA-Z0-9_-]+)/i);
    if (occMatch && occMatch[1]) meta.occupation = normalizeCanonicalTerm(occMatch[1], "occupation");

    const tagsMatch = content.match(/tags:\s*\[(.*?)\]/i);
    if (tagsMatch && tagsMatch[1]) {
      meta.tags = tagsMatch[1].split(",").map(t => normalizeTag(t.trim())).filter(t => t);
    }

    const descMatch = content.match(/description:\s*(.+)/i);
    if (descMatch && descMatch[1]) {
      meta.description = descMatch[1].replace(/^["']|["']$/g, "").trim();
    } else {
      // Fallback: use the first meaningful paragraph as description
      const lines = content.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#") && !l.startsWith("---") && !l.startsWith("title:") && !l.startsWith("category:"));
      if (lines.length > 0) {
        meta.description = lines[0].substring(0, 200);
      }
    }

    localFrontmatterCache.set(lower, meta);
    return meta;
  } catch {
    return null;
  }
}

async function getTaxonomyCache(): Promise<Record<string, { category?: string; domain?: string; occupation?: string; tags?: string[]; description?: string }>> {
  try {
    const candidates = [
      path.resolve(process.cwd(), ".data", "taxonomy.json"),
      path.resolve(__dirname, "..", ".data", "taxonomy.json"),
      path.resolve(__dirname, "..", "..", ".data", "taxonomy.json"),
    ];
    for (const taxPath of candidates) {
      if (fs.existsSync(taxPath)) {
        const raw = await fsPromises.readFile(taxPath, "utf-8");
        return JSON.parse(raw);
      }
    }
  } catch {}
  return {};
}

/**
 * Smart Zero-Loss discovery search across installed skills & catalog.
 */
export async function findSkillsHelper(params: {
  query?: string;
  category?: string;
  domain?: string;
  occupation?: string;
  tags?: string[];
  installed_only?: boolean;
  limit?: number;
  page?: number;
}) {
  const query = params.query?.trim().toLowerCase() || "";
  const rawCatFilter = params.category?.trim().toLowerCase() || "";
  const categoryFilter = rawCatFilter ? normalizeCanonicalTerm(rawCatFilter, "category") : "";
  const rawDomFilter = params.domain?.trim().toLowerCase() || "";
  const domainFilter = rawDomFilter ? normalizeCanonicalTerm(rawDomFilter, "domain") : "";
  const rawOccFilter = params.occupation?.trim().toLowerCase() || "";
  const occupationFilter = rawOccFilter ? normalizeCanonicalTerm(rawOccFilter, "occupation") : "";
  const tagsFilter = (params.tags || []).map(t => normalizeTag(t.trim())).filter(t => t);
  const installedOnly = !!params.installed_only;

  const installedSkills = await getValidSkillsList();
  const installedSet = new Set(installedSkills.map((s) => s.toLowerCase()));

  // Dynamic live taxonomy cache
  const taxonomyMap = await getTaxonomyCache();
  const catalog = await getSkillsCatalog();
  const catalogMap = new Map<string, CatalogSkill>();
  for (const item of catalog) {
    catalogMap.set(item.name.toLowerCase(), item);
  }

  // Pre-expand query terms with synonyms and weights
  const { primaryTerms, expandedSynonyms } = expandSearchQueryWithWeights(query);

  const allNames = new Set<string>();
  for (const name of installedSkills) allNames.add(name);
  for (const item of catalog) allNames.add(item.name);

  // Pure taxonomy browse mode (no query, but has category/domain/occupation/tags)
  const isBrowseMode = !query && (!!categoryFilter || !!domainFilter || !!occupationFilter || tagsFilter.length > 0);
  const isSearchMode = !!query || tagsFilter.length > 0;

  const results: Array<{
    name: string;
    description: string;
    category: string;
    domain?: string;
    occupation?: string;
    tags?: string[];
    is_installed: boolean;
    source: string;
    is_default?: boolean;
    score: number;
  }> = [];

  for (const name of allNames) {
    const isInstalled = installedSet.has(name.toLowerCase());
    if (installedOnly && !isInstalled) continue;

    const catItem = catalogMap.get(name.toLowerCase());
    let taxItem: { category?: string; domain?: string; occupation?: string; tags?: string[]; description?: string } | undefined = taxonomyMap[name.toLowerCase()];
    
    // Dynamic on-the-fly metadata fallback for local skills if missing or lacking description
    if ((!taxItem || !taxItem.description) && isInstalled) {
      const localMeta = await getOrExtractLocalMetadata(name);
      if (localMeta) {
        taxItem = { ...taxItem, ...localMeta, description: localMeta.description || taxItem?.description };
      }
    }

    const desc = catItem?.description || taxItem?.description || (isInstalled ? "Locally installed skill" : "");
    const cat = catItem?.category || taxItem?.category || "general";
    const dom = catItem?.domain || taxItem?.domain;
    const occ = catItem?.occupation || taxItem?.occupation;
    const itemTags = (catItem?.tags && catItem.tags.length > 0) ? catItem.tags : (taxItem?.tags || []);
    const src = catItem?.githubUrl || (isInstalled ? "local" : "");

    // Check noninit status
    const isNonInit = (!dom && !occ && (!itemTags || itemTags.length === 0)) || 
                      cat.toLowerCase() === "general" || 
                      cat.toLowerCase() === "noninit" || 
                      cat.toLowerCase() === "uncategorized";

    // Multi-dimensional strict filters (applied in pure browsing mode, except noninit which is always strict)
    if (categoryFilter) {
      if (categoryFilter === "noninit" || isNonInitKeyword(rawCatFilter)) {
        if (!isNonInit) continue;
      } else if (!isSearchMode && !cat.toLowerCase().includes(categoryFilter)) {
        continue;
      }
    }
    if (!isSearchMode) {
      if (domainFilter && (!dom || dom.toLowerCase() !== domainFilter)) continue;
      if (occupationFilter && (!occ || occ.toLowerCase() !== occupationFilter)) continue;
    }

    let score = 0;
    let hasExplicitMatch = false;
    let matchedEntityCount = 0;
    let matchedGenericCount = 0;

    // 0. Soft Domain & Occupation & Category Boosters (in Search Mode)
    if (isSearchMode) {
      if (domainFilter && dom && dom.toLowerCase() === domainFilter) {
        score += 20; // Domain match booster
      }
      if (occupationFilter && occ && occ.toLowerCase() === occupationFilter) {
        score += 15; // Occupation match booster
      }
      if (categoryFilter && categoryFilter !== "noninit" && cat.toLowerCase().includes(categoryFilter)) {
        score += 10; // Category match booster
      }
    }

    // 1. Soft Tag Filter Boosters
    let matchedTagCount = 0;
    if (tagsFilter.length > 0) {
      const lowerItemTags = itemTags.map(t => t.toLowerCase());
      for (const reqTag of tagsFilter) {
        if (lowerItemTags.includes(reqTag)) {
          score += 45; // Heavy exact tag match
          hasExplicitMatch = true;
          matchedTagCount++;
        } else if (lowerItemTags.some(t => isFuzzyMatch(reqTag, t, 0.75))) {
          score += 25; // Fuzzy tag match
          hasExplicitMatch = true;
          matchedTagCount++;
        }
      }
      if (matchedTagCount > 0) {
        score += 60; // Strong tag alignment bonus
      }
    }

    // 2. Query Search Terms Scoring
    if (query) {
      const { primaryTerms, expandedSynonyms } = expandSearchQueryWithWeights(query);
      const lowerName = name.toLowerCase();
      const lowerDesc = desc.toLowerCase();
      const lowerCat = cat.toLowerCase();
      const lowerDom = dom?.toLowerCase() || "";
      const lowerOcc = occ?.toLowerCase() || "";
      const lowerTagsStr = itemTags.join(" ").toLowerCase();
      const nameTokens = tokenizeText(lowerName);

      // Primary User Terms (Entity-Aware High Weight)
      for (const term of primaryTerms) {
        const isStopword = STOPWORDS.has(term);
        let termMatched = false;
        let isEntityMatch = false;

        if (lowerName === term) {
          score += isStopword ? 20 : 50; // Full name match
          termMatched = true;
          isEntityMatch = !isStopword;
        } else if (nameTokens.includes(term)) {
          score += isStopword ? 15 : 35; // Exact sub-token match in name
          termMatched = true;
          isEntityMatch = !isStopword;
        } else if (matchToken(lowerName, term)) {
          score += isStopword ? 10 : 25; // Substring in name
          termMatched = true;
          isEntityMatch = !isStopword;
        } else if (matchToken(lowerTagsStr, term)) {
          score += isStopword ? 8 : 25; // Tag match from query
          termMatched = true;
          isEntityMatch = !isStopword;
        } else if (term.length > 3 && isFuzzyMatch(term, lowerName, 0.75)) {
          score += isStopword ? 5 : 15; // Fuzzy name match
          termMatched = true;
          isEntityMatch = !isStopword;
        } else if (term.length > 3 && itemTags.some(t => isFuzzyMatch(term, t.toLowerCase(), 0.75))) {
          score += isStopword ? 5 : 15; // Fuzzy tag match
          termMatched = true;
          isEntityMatch = !isStopword;
        } else if (matchToken(lowerDesc, term)) {
          score += isStopword ? 2 : 6; // Description match
          termMatched = true;
        } else if (matchToken(lowerDom, term) || matchToken(lowerOcc, term)) {
          score += isStopword ? 1 : 4; // Domain/Occupation match
          termMatched = true;
        } else if (matchToken(lowerCat, term)) {
          score += isStopword ? 1 : 3; // Category match
          termMatched = true;
        }

        if (termMatched) {
          hasExplicitMatch = true;
          if (isEntityMatch) {
            matchedEntityCount++;
          } else {
            matchedGenericCount++;
          }
        }
      }

      // Expanded Synonyms (Secondary Weight)
      for (const term of expandedSynonyms) {
        if (nameTokens.includes(term) || matchToken(lowerName, term)) {
          score += 12;
          hasExplicitMatch = true;
        } else if (matchToken(lowerTagsStr, term)) {
          score += 10;
          hasExplicitMatch = true;
        } else if (matchToken(lowerDesc, term)) {
          score += 3;
          hasExplicitMatch = true;
        }
      }

      // Multi-term compound boost (Weighted by Entity significance)
      if (matchedEntityCount >= 2) {
        score = Math.round(score * 1.7);
      } else if (matchedEntityCount >= 1 && matchedGenericCount >= 2) {
        score = Math.round(score * 1.4);
      } else if (matchedGenericCount >= 3) {
        score = Math.round(score * 1.2);
      }

      if (!hasExplicitMatch) {
        continue;
      }
    } else if (tagsFilter.length > 0 && !hasExplicitMatch) {
      continue;
    }

    results.push({
      name,
      description: desc || "Skill guideline and best practice rules.",
      category: cat,
      domain: dom,
      occupation: occ,
      tags: itemTags,
      is_installed: isInstalled,
      source: src,
      is_default: name === "find-skills",
      score,
    });
  }

  // 3. Adaptive Thresholding (Zero-Loss / Never Empty Guarantee)
  let filteredResults = results;
  if (isSearchMode && results.length > 0) {
    const maxScore = Math.max(...results.map(r => r.score));
    
    // Adaptive cutoff: if plenty of results, use 35%; if few, relax to 15%
    const cutoffPercentage = results.length >= 10 ? 0.35 : 0.15;
    const cutoffScore = Math.max(3, maxScore * cutoffPercentage);
    filteredResults = results.filter(r => r.name === "find-skills" || r.score >= cutoffScore);
  }

  // 4. Pass 3 Fallback: If 0 results in search mode, perform full fuzzy trigram/Levenshtein recovery
  if (isSearchMode && filteredResults.length <= 1 && results.length === 0) {
    const fallbackCandidates: Array<typeof results[0]> = [];
    for (const name of allNames) {
      const isInstalled = installedSet.has(name.toLowerCase());
      const catItem = catalogMap.get(name.toLowerCase());
      const taxItem = taxonomyMap[name.toLowerCase()];
      const desc = catItem?.description || taxItem?.description || "";
      const cat = catItem?.category || taxItem?.category || "general";
      const dom = catItem?.domain || taxItem?.domain;
      const occ = catItem?.occupation || taxItem?.occupation;
      const itemTags = (catItem?.tags && catItem.tags.length > 0) ? catItem.tags : (taxItem?.tags || []);

      const simName = stringSimilarity(query, name);
      const simTags = itemTags.map(t => stringSimilarity(query, t)).reduce((max, s) => Math.max(max, s), 0);
      const bestSim = Math.max(simName, simTags);

      if (bestSim >= 0.30) {
        fallbackCandidates.push({
          name,
          description: desc || "Skill guideline and best practice rules.",
          category: cat,
          domain: dom,
          occupation: occ,
          tags: itemTags,
          is_installed: isInstalled,
          source: catItem?.githubUrl || (isInstalled ? "local" : ""),
          is_default: name === "find-skills",
          score: Math.round(bestSim * 50),
        });
      }
    }
    if (fallbackCandidates.length > 0) {
      filteredResults = fallbackCandidates;
    }
  }

  // Sort: default skill first, then by score (desc), then installed skills, then alphabetically
  filteredResults.sort((a, b) => {
    if (a.name === "find-skills") return -1;
    if (b.name === "find-skills") return 1;
    if (b.score !== a.score) return b.score - a.score;
    if (a.is_installed !== b.is_installed) return a.is_installed ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const limit = params.limit && params.limit > 0 ? params.limit : 20;
  const page = params.page && params.page > 0 ? params.page : 1;
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;

  return {
    default_skill: "find-skills",
    count: Math.min(filteredResults.length - startIndex, limit),
    skills: filteredResults.slice(startIndex, endIndex),
    total_matches: filteredResults.length,
    page,
    total_pages: Math.ceil(filteredResults.length / limit),
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

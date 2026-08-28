import fs, { promises as fsPromises } from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolve all candidate directories where skills might reside.
 */
export function resolveSkillsDirs(): string[] {
  const candidates: string[] = [];

  if (process.env.SKILLS_DIR) {
    candidates.push(path.resolve(process.env.SKILLS_DIR));
  }

  // Standard locations (workspace & global)
  candidates.push(
    path.resolve(process.cwd(), ".agents", "skills"),
    path.resolve(process.cwd(), "skills"),
    path.resolve(__dirname, "..", "..", ".agents", "skills"),
    path.resolve(__dirname, "..", "..", "skills"),
    path.resolve(__dirname, "..", ".agents", "skills"),
    path.resolve(__dirname, "..", "skills"),
    path.join(os.homedir(), ".gemini", "config", "skills"),
    path.join(os.homedir(), ".agents", "skills")
  );

  const existingDirs = candidates.filter((dir, idx, self) => {
    return self.indexOf(dir) === idx && fs.existsSync(dir);
  });

  return existingDirs.length > 0 ? existingDirs : [path.resolve(process.cwd(), "skills")];
}

export const SKILLS_DIRS = resolveSkillsDirs();

// Ensure at least primary skills dir exists
if (!fs.existsSync(SKILLS_DIRS[0])) {
  try {
    fs.mkdirSync(SKILLS_DIRS[0], { recursive: true });
  } catch (err) {
    console.error(`[ERROR] Failed to create primary SKILLS_DIR at: ${SKILLS_DIRS[0]}`);
  }
}

/**
 * Recursively find all markdown (.md) files in a directory.
 */
export async function getMarkdownFiles(dir: string): Promise<string[]> {
  const mdFiles: string[] = [];
  async function scan(currentDir: string) {
    const entries = await fsPromises.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        mdFiles.push(fullPath);
      }
    }
  }
  await scan(dir);
  return mdFiles;
}

// ── Cache State ────────────────────────────────────────────────
let cachedSkillsList: string[] | null = null;
let skillsCacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 1000;

export function clearSkillsCache(): void {
  cachedSkillsList = null;
  skillsCacheTimestamp = 0;
}

/**
 * Retrieve list of all valid skills containing markdown files.
 */
export async function getValidSkillsList(): Promise<string[]> {
  const now = Date.now();
  if (cachedSkillsList && now - skillsCacheTimestamp < CACHE_TTL_MS) {
    return cachedSkillsList;
  }

  const validSkillsSet = new Set<string>();

  for (const dir of SKILLS_DIRS) {
    try {
      const dirents = await fsPromises.readdir(dir, { withFileTypes: true });
      for (const dirent of dirents) {
        if (dirent.isDirectory()) {
          const fullPath = path.join(dir, dirent.name);
          try {
            const mdFiles = await getMarkdownFiles(fullPath);
            if (mdFiles.length > 0) {
              validSkillsSet.add(dirent.name);
            }
          } catch {
            // Skip unreadable directories
          }
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  const validSkills = Array.from(validSkillsSet).sort();
  cachedSkillsList = validSkills;
  skillsCacheTimestamp = Date.now();
  return validSkills;
}

/**
 * Find exact directory of a specific skill.
 */
export async function findSkillDirectory(skillName: string): Promise<string | null> {
  const cleanName = skillName.trim();
  for (const baseDir of SKILLS_DIRS) {
    const targetDir = path.resolve(baseDir, cleanName);
    if (fs.existsSync(targetDir)) {
      return targetDir;
    }
  }
  return null;
}

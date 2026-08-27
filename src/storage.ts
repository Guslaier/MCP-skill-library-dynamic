import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolve the data directory used for JSON persistence.
 *
 * Priority:
 *  1. SKILL_LIBRARY_DATA_DIR env var (explicit override)
 *  2. <project-root>/.data (resolved relative to this file: dist/../.data or src/../.data)
 *
 * NOTE (STEP 2 alternatives): JSON files are the default per requirements.
 * Lighter/faster alternatives for high-volume or concurrent access:
 *  - SQLite via better-sqlite3 (single file, transactional, indexed)
 *  - Flat file per record (one file per session/key, avoids read-modify-write races)
 *  - OS keychain (Windows Credential Manager / macOS Keychain) for secrets
 */
export function resolveDataDir(): string {
  if (process.env.SKILL_LIBRARY_DATA_DIR) {
    return path.resolve(process.env.SKILL_LIBRARY_DATA_DIR);
  }
  return path.resolve(__dirname, "..", ".data");
}

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err: any) {
    if (err && err.code === "ENOENT") return fallback;
    throw err;
  }
}

export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmpPath, filePath);
}
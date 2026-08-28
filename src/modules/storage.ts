import fs, { promises as fsPromises } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolve the data directory used for JSON persistence.
 *
 * Priority:
 *  1. SKILL_LIBRARY_DATA_DIR env var (explicit override)
 *  2. <project-root>/.data (resolved relative to this file or cwd)
 */
export function resolveDataDir(): string {
  if (process.env.SKILL_LIBRARY_DATA_DIR) {
    return path.resolve(process.env.SKILL_LIBRARY_DATA_DIR);
  }
  const rootRelative = path.resolve(__dirname, "..", "..", ".data");
  if (fs.existsSync(rootRelative)) {
    return rootRelative;
  }
  const oneLevel = path.resolve(__dirname, "..", ".data");
  if (fs.existsSync(oneLevel)) {
    return oneLevel;
  }
  return path.resolve(process.cwd(), ".data");
}

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fsPromises.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err: any) {
    if (err && err.code === "ENOENT") return fallback;
    throw err;
  }
}

export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await fsPromises.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  await fsPromises.rename(tmpPath, filePath);
}

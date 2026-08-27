import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

interface SkillItem {
  name: string;
  githubUrl: string;
  description?: string;
  category?: string;
}

const BATCH_SIZE = 8;
const MAX_RETRIES = 2;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function installWithSpawn(name: string, githubUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['-y', 'skills', 'add', githubUrl, '--skill', name, '--agent', '*', '-y'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timeout = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      reject(new Error(`Timeout after 40s installing ${name}`));
    }, 40_000);

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Exit code ${code}: ${stderr.slice(-200) || stdout.slice(-200)}`));
      } else {
        resolve();
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function installSkillWithRetry(
  name: string,
  githubUrl: string,
  retryCount = 0,
  overallIndex?: number,
  totalSkills?: number
): Promise<boolean> {
  try {
    await installWithSpawn(name, githubUrl);
    console.log(`  ✓ [${overallIndex ?? '?'}/${totalSkills ?? '?'}] Installed: ${name}`);
    return true;
  } catch (err: any) {
    if (retryCount < MAX_RETRIES) {
      const backoff = (retryCount + 1) * 1500;
      await sleep(backoff);
      return installSkillWithRetry(name, githubUrl, retryCount + 1, overallIndex, totalSkills);
    }
    console.warn(`  ✗ [${overallIndex ?? '?'}/${totalSkills ?? '?'}] Skipped ${name}: ${err.message.split('\n')[0]}`);
    return false;
  }
}

async function downloadFromBaseJson() {
  const jsonPath = path.resolve('skills-base.json');
  if (!fs.existsSync(jsonPath)) {
    console.error(`Error: Base JSON file not found at ${jsonPath}`);
    process.exit(1);
  }

  const baseSkills: SkillItem[] = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`\n=== Total skills in skills-base.json: ${baseSkills.length} ===`);

  const skillsDir = path.resolve('.agents/skills');
  fs.mkdirSync(skillsDir, { recursive: true });

  const existingSkills = new Set(
    fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  );

  const arg = process.argv[2];
  let targetSkills = baseSkills;

  if (arg && arg !== '--all' && arg !== '--force') {
    targetSkills = baseSkills.filter((s) => s.name.toLowerCase().includes(arg.toLowerCase()));
    console.log(`Filtered skills matching "${arg}": ${targetSkills.length} found.`);
  }

  const forceReinstall = process.argv.includes('--force');
  const missingSkills = forceReinstall
    ? targetSkills
    : targetSkills.filter((s) => !existingSkills.has(s.name));

  console.log(`Already installed: ${targetSkills.length - missingSkills.length}`);
  console.log(`To install: ${missingSkills.length}`);

  const totalSkills = missingSkills.length;
  if (totalSkills === 0) {
    console.log('\nAll targeted skills are already installed!');
    cleanup();
    return;
  }

  console.log(`\n=== Installing ${totalSkills} missing skills in batches of ${BATCH_SIZE} ===`);
  let successCount = 0;

  for (let i = 0; i < totalSkills; i += BATCH_SIZE) {
    const batch = missingSkills.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(totalSkills / BATCH_SIZE);
    const progress = `${batchNum}/${totalBatches}`;
    console.log(`\n--- Batch ${progress} | Skills ${i + 1}-${Math.min(i + BATCH_SIZE, totalSkills)} of ${totalSkills} ---`);

    const results = await Promise.allSettled(
      batch.map((skill: SkillItem, idx: number) => {
        const overallIndex = i + idx + 1;
        return installSkillWithRetry(skill.name, skill.githubUrl, 0, overallIndex, totalSkills);
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) successCount++;
    }
  }

  console.log(`\nDone! Successfully processed ${totalSkills} skills.`);
  cleanup();
}

function cleanup() {
  const dirsToRemove = ['.claude', 'agent'];
  for (const dir of dirsToRemove) {
    const fullPath = path.join(process.cwd(), dir);
    try {
      if (fs.existsSync(fullPath)) {
        fs.rmSync(fullPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
      }
    } catch {}
  }
}

downloadFromBaseJson();

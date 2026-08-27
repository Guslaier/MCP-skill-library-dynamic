import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

interface SkillItem {
  name: string;
  githubUrl: string;
  description?: string;
}

const BATCH_SIZE = 5;
const MAX_RETRIES = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function installWithSpawn(name: string, githubUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = `npx -y skills add ${githubUrl} --skill ${name} --agent '*' -y`;
    console.log(`    [${name}] DEBUG executing: ${cmd} (cwd: ${process.cwd()})`);
    const child = spawn('npx', ['-y', 'skills', 'add', githubUrl, '--skill', name, '--agent', '*', '-y'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });
    child.stdout.on('data', (chunk: Buffer) => {
      const line = chunk.toString().trim();
      if (line) console.log(`    [${name}] ${line}`);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const line = chunk.toString().trim();
      if (line) console.log(`    [${name}] STDERR: ${line}`);
    });
    child.on('close', (code) => {
      console.log(`    [${name}] DEBUG exit code: ${code}`);
      if (code !== 0) {
        reject(new Error(`npx skills add exited with code ${code}`));
      } else {
        resolve();
      }
    });
    child.on('error', (err) => {
      console.error(`    [${name}] DEBUG spawn error: ${err.message}`);
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
): Promise<void> {
  try {
    await installWithSpawn(name, githubUrl);
    console.log(`  ✓ [${overallIndex ?? '?'}/${totalSkills ?? '?'}] Successfully installed ${name}`);
  } catch (err: any) {
    if (retryCount < MAX_RETRIES) {
      const backoff = Math.pow(2, retryCount) * 1000;
      console.warn(`  ! Retrying ${name} in ${backoff}ms...`);
      await sleep(backoff);
      return installSkillWithRetry(name, githubUrl, retryCount + 1, overallIndex, totalSkills);
    }
    console.error(`  ✗ [${overallIndex ?? '?'}/${totalSkills ?? '?'}] Failed to install ${name} after ${MAX_RETRIES} attempts:`, err.message);
  }
}

async function downloadFromBaseJson() {
  const jsonPath = path.resolve('skills-base.json');
  if (!fs.existsSync(jsonPath)) {
    console.error(`Error: Base JSON file not found at ${jsonPath}`);
    process.exit(1);
  }

  const baseSkills: SkillItem[] = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`\n=== Loaded ${baseSkills.length} base skills from skills-base.json ===`);

  const arg = process.argv[2];
  let targetSkills = baseSkills;

  if (arg && arg !== '--all') {
    targetSkills = baseSkills.filter(s => s.name.toLowerCase().includes(arg.toLowerCase()));
    console.log(`Filtered skills matching "${arg}": ${targetSkills.length} found.`);
  }

  const totalSkills = targetSkills.length;
  if (totalSkills === 0) {
    console.log('No skills to install.');
    return;
  }

  console.log(`\n=== Installing ${totalSkills} skills in batches of ${BATCH_SIZE} ===`);
  for (let i = 0; i < totalSkills; i += BATCH_SIZE) {
    const batch = targetSkills.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(totalSkills / BATCH_SIZE);
    const progress = `${batchNum}/${totalBatches}`;
    console.log(`\n--- Batch ${progress} | Processing ${batch.length} skills (${i + 1}-${Math.min(i + BATCH_SIZE, totalSkills)} of ${totalSkills}) ---`);

    await Promise.allSettled(
      batch.map((skill: SkillItem, idx: number) => {
        const overallIndex = i + idx + 1;
        console.log(`\n  Installing skill ${overallIndex}/${totalSkills}: ${skill.name}...`);
        return installSkillWithRetry(skill.name, skill.githubUrl, 0, overallIndex, totalSkills);
      })
    );
  }

  console.log(`\nDone! Processed all ${totalSkills} skills.`);

  console.log('\n=== Cleanup: Removing .claude/ and agent/ directories ===');
  const dirsToRemove = ['.claude', 'agent'];
  for (const dir of dirsToRemove) {
    const fullPath = path.join(process.cwd(), dir);
    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(`  ✓ Deleted ${dir}/`);
    } else {
      console.log(`  - ${dir}/ not found, skipping`);
    }
  }
}

downloadFromBaseJson();

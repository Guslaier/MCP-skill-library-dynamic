import https from 'https';
import { IncomingMessage } from 'http';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
const BATCH_SIZE = 5;
const MAX_RETRIES = 3;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchPage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res: IncomingMessage) => {
      let data = "";
      res.on("data", (chunk: any) => data += chunk);
      res.on("end", () => {
        clearTimeout(timeoutId);
        resolve(data);
      });
      res.on("error", (err) => {
        clearTimeout(timeoutId);
        reject(err);
      });
    }).on("error", (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });

    const timeoutId = setTimeout(() => {
      req.destroy(new Error(`Request to ${url} timed out after 10s`));
    }, 10_000);
  });
}

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

async function fetchAllSkillsList(startPage = 1, maxPages = 15): Promise<{ name: string; githubUrl: string }[]> {
  const allSkills: { name: string; githubUrl: string }[] = [];

  for (let page = startPage; page <= maxPages; page++) {
    const url = `https://skillsmp.com/skills/page/${page}`;
    console.log(`\n--- Fetching skills from ${url} ---`);

    try {
      const data = await fetchPage(url);
      const ldJsonRegex = /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g;
      let json: any = null;
      let ldMatch: RegExpExecArray | null;
      while ((ldMatch = ldJsonRegex.exec(data)) !== null) {
        try {
          const parsed = JSON.parse(ldMatch[1]);
          if (parsed?.['@type'] === 'CollectionPage') {
            json = parsed;
            break;
          }
        } catch {}
      }

      if (!json) {
        console.log(`No skills JSON found on page ${page}. Stopping pagination.`);
        break;
      }
      const items = json.mainEntity?.itemListElement;

      if (!items || items.length === 0) {
        console.log(`No items found on page ${page}. Stopping.`);
        break;
      }

      const validSkills = items.map((item: any) => {
        const match = item.url.match(/https:\/\/skillsmp\.com\/creators\/([^/]+)\/([^/]+)\/([^/]+)/);
        if (match) {
          return {
            name: item.name,
            githubUrl: `https://github.com/${match[1]}/${match[2]}`
          };
        }
        return null;
      }).filter(Boolean);

      console.log(`Found ${validSkills.length} skills on page ${page}.`);
      allSkills.push(...validSkills);
    } catch (err: any) {
      console.error(`Error on page ${page}:`, err.message);
      break;
    }
  }

  return allSkills;
}

async function downloadSkillsmpAllPages(startPage = 1, maxPages = 15) {
  console.log(`\n=== Phase 1: Fetching all skill listings ===`);
  const allSkills = await fetchAllSkillsList(startPage, maxPages);
  console.log(`\nTotal skills found: ${allSkills.length}`);

  console.log('\n--- Skills List ---');
  allSkills.forEach((s, i) => console.log(`${i + 1}. ${s.name}`));
  console.log('--- End of List ---\n');

  const totalSkills = allSkills.length;
  console.log(`\n=== Phase 2: Installing all ${totalSkills} skills in batches of ${BATCH_SIZE} ===`);
  for (let i = 0; i < totalSkills; i += BATCH_SIZE) {
    const batch = allSkills.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(totalSkills / BATCH_SIZE);
    const progress = `${batchNum}/${totalBatches}`;
    console.log(`\n--- Batch ${progress} | Processing ${batch.length} skills (${i + 1}-${Math.min(i + BATCH_SIZE, totalSkills)} of ${totalSkills}) ---`);

    await Promise.allSettled(
      batch.map((skill: { name: string; githubUrl: string }, idx: number) => {
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

const pageCount = parseInt(process.argv[2] || '15', 10);
if (isNaN(pageCount) || pageCount < 1) {
  console.error('Usage: npm run download -- <pages>\n  <pages> must be a positive integer.');
  process.exit(1);
}
console.log(`Downloading ${pageCount} pages...`);
downloadSkillsmpAllPages(1, pageCount);

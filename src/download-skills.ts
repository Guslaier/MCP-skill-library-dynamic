import https from 'https';
import { IncomingMessage } from 'http';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const BATCH_SIZE = 5;
const MAX_RETRIES = 3;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchPage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res: IncomingMessage) => {
      let data = "";
      res.on("data", (chunk: any) => data += chunk);
      res.on("end", () => resolve(data));
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function installSkillWithRetry(name: string, githubUrl: string, retryCount = 0): Promise<void> {
  try {
    await execAsync(`npx -y skills add ${githubUrl} --skill ${name}`, { cwd: process.cwd() });
    console.log(`  ✓ Successfully installed ${name}`);
  } catch (err: any) {
    if (retryCount < MAX_RETRIES) {
      const backoff = Math.pow(2, retryCount) * 1000;
      console.warn(`  ! Retrying ${name} in ${backoff}ms...`);
      await sleep(backoff);
      return installSkillWithRetry(name, githubUrl, retryCount + 1);
    }
    console.error(`  ✗ Failed to install ${name} after ${MAX_RETRIES} attempts:`, err.message);
  }
}

async function downloadSkillsmpAllPages(startPage = 1, maxPages = 15) {
  for (let page = startPage; page <= maxPages; page++) {
    const url = `https://skillsmp.com/skills/page/${page}`;
    console.log(`\n--- Fetching skills from ${url} ---`);

    try {
      const data = await fetchPage(url);
      const startStr = '{"@context":"https://schema.org","@type":"CollectionPage"';
      const endStr = '</script>';
      const startIndex = data.indexOf(startStr);
      
      if (startIndex === -1) {
        console.log(`No skills JSON found on page ${page}. Stopping pagination.`);
        break; // Probably reached the end of the list
      }
      
      const endIndex = data.indexOf(endStr, startIndex);
      if (endIndex === -1) throw new Error("Could not find the end of JSON-LD.");
      
      const jsonStr = data.substring(startIndex, endIndex);
      const json = JSON.parse(jsonStr);
      const items = json.mainEntity?.itemListElement;

      if (!items || items.length === 0) {
        console.log(`No items found on page ${page}. Stopping.`);
        break;
      }

      // Filter valid items
      const validSkills = items.map((item: any) => {
        const match = item.url.match(/https:\/\/skillsmp\.com\/creators\/([^/]+)\/([^/]+)\//);
        if (match) {
          return {
            name: item.name,
            githubUrl: `https://github.com/${match[1]}/${match[2]}`
          };
        }
        return null;
      }).filter(Boolean);

      console.log(`Found ${validSkills.length} skills on page ${page}. Processing in batches of ${BATCH_SIZE}...`);

      for (let i = 0; i < validSkills.length; i += BATCH_SIZE) {
        const batch = validSkills.slice(i, i + BATCH_SIZE);
        console.log(`\nProcessing Batch ${Math.floor(i / BATCH_SIZE) + 1} of Page ${page}...`);
        
        await Promise.all(
          batch.map((skill: { name: string, githubUrl: string }) => 
            installSkillWithRetry(skill.name, skill.githubUrl)
          )
        );
      }
    } catch (err: any) {
      console.error(`Error on page ${page}:`, err.message);
      break;
    }
  }
  
  console.log("\nDone downloading skills from all pages.");
}

downloadSkillsmpAllPages(1, 15);

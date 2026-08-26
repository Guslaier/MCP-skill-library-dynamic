import fs from 'fs';
import https from 'https';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function downloadSkillsmpPage1() {
  const url = "https://skillsmp.com/skills/page/1";
  console.log(`Fetching skills from ${url}...`);

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", async () => {
        try {
          const startStr = '{"@context":"https://schema.org","@type":"CollectionPage"';
          const endStr = '</script>';
          const startIndex = data.indexOf(startStr);
          if (startIndex === -1) {
             throw new Error("Could not find JSON-LD in the page content.");
          }
          const endIndex = data.indexOf(endStr, startIndex);
          if (endIndex === -1) {
             throw new Error("Could not find the end of JSON-LD.");
          }
          const jsonStr = data.substring(startIndex, endIndex);
          const json = JSON.parse(jsonStr);
          const items = json.mainEntity.itemListElement;
          
          let count = 0;
          for (const item of items) {
             const name = item.name;
             const itemUrl = item.url;
             const match = itemUrl.match(/https:\/\/skillsmp\.com\/creators\/([^/]+)\/([^/]+)\//);
             if (match) {
                 const user = match[1];
                 const repo = match[2];
                 const githubUrl = `https://github.com/${user}/${repo}`;
                 count++;
                 console.log(`[${count}/${items.length}] Installing ${name} from ${githubUrl}...`);
                 try {
                     await execAsync(`npx -y skills add ${githubUrl} --skill ${name}`, { cwd: process.cwd() });
                     console.log(`  ✓ Successfully installed ${name}`);
                 } catch (err) {
                     console.error(`  ✗ Failed to install ${name}:`, err.message);
                 }
             }
          }
          console.log("Done downloading skills.");
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    }).on("error", reject);
  });
}

downloadSkillsmpPage1().catch(console.error);

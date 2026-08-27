#!/usr/bin/env node
import { serviceStart, serviceStop, serviceList } from "./service.js";
import { oauthGenerateKey, oauthValidateKey, oauthListKeys, oauthRegenKey, oauthDeleteKey } from "./auth.js";
import { sessionCreate, sessionGet, sessionList, sessionDelete } from "./session.js";

interface ParsedArgs {
  flags: Record<string, string>;
  positionals: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string> = {};
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    } else {
      positionals.push(arg);
    }
  }

  return { flags, positionals };
}

function requireFlag(flags: Record<string, string>, name: string): string {
  const v = flags[name];
  if (!v || v.trim() === "" || v === "true") {
    throw new Error(`Missing required flag: --${name}`);
  }
  return v.trim();
}

function printHelp(): void {
  const helpText = `
Skill Library MCP CLI

Usage:
  skill-library service start --name <n> [--command <c>] [--port <p>]
  skill-library service stop (--name <n> | --id <id>)
  skill-library service list

  skill-library oauth generate-key [--label <l>] [--ttl <sec>]
  skill-library oauth regen-key (--id <id> | --label <l>) [--ttl <sec>]
  skill-library oauth delete-key (--id <id> | --label <l>)
  skill-library oauth validate-key --key <token>
  skill-library oauth list-keys

  skill-library session create --name <n> [--data '<json>']
  skill-library session get --name <n>
  skill-library session list
  skill-library session delete --name <n>
`;
  process.stdout.write(helpText);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { flags, positionals } = parseArgs(argv);

  const [group, action] = positionals;

  if (group === "help" || action === "help") {
    printHelp();
    process.exit(0);
  }

  if (!group) {
    // Legacy invocation (no args): delegate to the MCP server entry,
    // which auto-starts the stdio server on import.
    await import("./index.js");
    return;
  }

  if (!action) {
    printHelp();
    process.exit(1);
  }

  let result: unknown;

  switch (group) {
    case "service": {
      switch (action) {
        case "start": {
          const name = requireFlag(flags, "name");
          const command = flags.command;
          const port = flags.port !== undefined ? Number(flags.port) : undefined;
          result = await serviceStart({ name, command, port });
          break;
        }
        case "stop": {
          const name = flags.name ?? flags.id;
          if (!name) throw new Error("Missing required flag: --name (or --id)");
          result = await serviceStop({ name });
          break;
        }
        case "list": {
          result = await serviceList();
          break;
        }
        default:
          throw new Error(`Unknown service action: ${action}`);
      }
      break;
    }

    case "oauth": {
      switch (action) {
        case "generate":
        case "generate-key": {
          const label = flags.label;
          const ttlRaw = flags.ttl;
          const ttlSeconds = ttlRaw !== undefined ? Number(ttlRaw) : undefined;
          if (ttlSeconds !== undefined && (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0)) {
            throw new Error("--ttl must be a positive number (seconds)");
          }
          result = await oauthGenerateKey({ label, ttlSeconds });
          break;
        }
        case "regen":
        case "regen-key": {
          const id = flags.id ?? flags.label;
          if (!id) throw new Error("Missing required flag: --id (or --label)");
          const ttlRaw = flags.ttl;
          const ttlSeconds = ttlRaw !== undefined ? Number(ttlRaw) : undefined;
          result = await oauthRegenKey({ id, ttlSeconds });
          break;
        }
        case "delete":
        case "delete-key": {
          const id = flags.id ?? flags.label;
          if (!id) throw new Error("Missing required flag: --id (or --label)");
          result = await oauthDeleteKey({ id });
          break;
        }
        case "validate":
        case "validate-key": {
          const key = requireFlag(flags, "key");
          result = await oauthValidateKey({ key });
          break;
        }
        case "list":
        case "list-keys": {
          result = await oauthListKeys();
          break;
        }
        default:
          throw new Error(`Unknown oauth action: ${action}`);
      }
      break;
    }

    case "session": {
      switch (action) {
        case "create": {
          const name = requireFlag(flags, "name");
          let data: unknown = {};
          if (flags.data !== undefined) {
            try {
              data = JSON.parse(flags.data);
            } catch {
              throw new Error("--data must be valid JSON (e.g. '{\"a\":1}')");
            }
          }
          result = await sessionCreate({ name, data });
          break;
        }
        case "get": {
          const name = requireFlag(flags, "name");
          result = await sessionGet({ name });
          break;
        }
        case "list": {
          result = await sessionList();
          break;
        }
        case "delete": {
          const name = requireFlag(flags, "name");
          result = await sessionDelete({ name });
          break;
        }
        default:
          throw new Error(`Unknown session action: ${action}`);
      }
      break;
    }

    default:
      throw new Error(`Unknown command group: ${group}`);
  }

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(1);
});
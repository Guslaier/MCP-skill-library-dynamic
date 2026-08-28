import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import fs, { promises as fsPromises } from "fs";
import path from "path";
import {
  getValidSkillsList,
  findSkillDirectory,
  getMarkdownFiles,
  findSkillsHelper,
  getSkillInfoHelper,
  installSkillHelper,
  uninstallSkillHelper,
  getSystemStatusData,
} from "../common/index.js";
import {
  serviceStart,
  serviceStop,
  serviceList,
  oauthGenerateKey,
  oauthValidateKey,
  oauthListKeys,
  oauthRegenKey,
  oauthDeleteKey,
  sessionCreate,
  sessionGet,
  sessionList,
  sessionDelete,
} from "../modules/index.js";

/**
 * Handle incoming MCP tool call execution with role-based permission checks.
 */
export async function handleToolCall(
  name: string,
  args: any,
  role: "admin" | "standard" = "standard"
): Promise<{ content: Array<{ type: string; text: string }>; structuredContent?: any }> {
  // ── RBAC Security Guard ───────────────────────────────────────
  if (
    name.startsWith("session_") ||
    name.startsWith("oauth_") ||
    name.startsWith("service_") ||
    name === "system_status"
  ) {
    if (role !== "admin") {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Unauthorized: Admin privileges required for tool '${name}'.`
      );
    }
  }

  // ── Public AI Tools ───────────────────────────────────────────
  if (name === "find_skills") {
    try {
      const query = typeof args?.query === "string" ? args.query : undefined;
      const category = typeof args?.category === "string" ? args.category : undefined;
      const installed_only = typeof args?.installed_only === "boolean" ? args.installed_only : undefined;
      const result = await findSkillsHelper({ query, category, installed_only });

      let summaryText = `Found ${result.total_matches} skills matching criteria (showing top ${result.skills.length}):\n`;
      summaryText += `💡 Default Gateway Skill: 'find-skills' (Use 'fetch_skill_rule' with skill_name='find-skills')\n\n`;
      for (const s of result.skills) {
        const status = s.is_installed ? "✓ [INSTALLED]" : "○ [AVAILABLE]";
        const defFlag = s.is_default ? " ★ DEFAULT" : "";
        summaryText += `${status}${defFlag} ${s.name} (${s.category})\n  ${s.description}\n`;
      }

      return {
        content: [{ type: "text", text: summaryText }],
        structuredContent: result,
      };
    } catch (error: any) {
      throw new McpError(ErrorCode.InternalError, `find_skills failed: ${error?.message || error}`);
    }
  }

  if (name === "get_skill_info") {
    const skillName = args?.skill_name as string | undefined;
    if (!skillName || typeof skillName !== "string") {
      throw new McpError(ErrorCode.InvalidParams, "skill_name parameter is required and must be a string.");
    }
    try {
      const info = await getSkillInfoHelper(skillName);
      return {
        content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
        structuredContent: info,
      };
    } catch (error: any) {
      throw new McpError(ErrorCode.InternalError, `get_skill_info failed: ${error?.message || error}`);
    }
  }

  if (name === "install_skill") {
    const skillName = args?.skill_name as string | undefined;
    if (!skillName || typeof skillName !== "string") {
      throw new McpError(ErrorCode.InvalidParams, "skill_name parameter is required and must be a string.");
    }
    try {
      const res = await installSkillHelper({
        skill_name: skillName,
        source: typeof args?.source === "string" ? args.source : undefined,
        content: typeof args?.content === "string" ? args.content : undefined,
        description: typeof args?.description === "string" ? args.description : undefined,
        category: typeof args?.category === "string" ? args.category : undefined,
      });
      return {
        content: [{ type: "text", text: res.message }],
        structuredContent: res,
      };
    } catch (error: any) {
      throw new McpError(ErrorCode.InternalError, `install_skill failed: ${error?.message || error}`);
    }
  }

  if (name === "uninstall_skill") {
    const skillName = args?.skill_name as string | undefined;
    if (!skillName || typeof skillName !== "string") {
      throw new McpError(ErrorCode.InvalidParams, "skill_name parameter is required and must be a string.");
    }
    try {
      const res = await uninstallSkillHelper(skillName);
      return {
        content: [{ type: "text", text: res.message }],
        structuredContent: res,
      };
    } catch (error: any) {
      throw new McpError(ErrorCode.InternalError, `uninstall_skill failed: ${error?.message || error}`);
    }
  }

  if (name === "list_skills") {
    try {
      const allSkills = await getValidSkillsList();
      const query = typeof args?.query === "string" ? args.query.trim().toLowerCase() : "";

      const sortedSkills = [...allSkills].sort((a, b) => {
        if (a === "find-skills") return -1;
        if (b === "find-skills") return 1;
        return a.localeCompare(b);
      });

      const filteredSkills = query
        ? sortedSkills.filter((s) => s.toLowerCase().includes(query))
        : sortedSkills;

      if (filteredSkills.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: query
                ? `No skills found matching query '${query}'. Use 'find_skills' to search the full online catalog (580+ skills).`
                : "No valid skills with markdown rules found in the library.",
            },
          ],
          structuredContent: { default_skill: "find-skills", skills: [], count: 0 },
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Available skills (${filteredSkills.length}${query ? ` matching '${query}'` : ""}):\n★ [DEFAULT] find-skills (Master Skill Discovery)\n${filteredSkills.filter(s => s !== "find-skills").join("\n")}`,
          },
        ],
        structuredContent: { default_skill: "find-skills", skills: filteredSkills, count: filteredSkills.length },
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Could not read skills directory: ${error}`
      );
    }
  }

  if (name === "fetch_skill_rule") {
    const skillName = args?.skill_name as string | undefined;

    if (!skillName || typeof skillName !== "string") {
      throw new McpError(ErrorCode.InvalidParams, "skill_name parameter is required and must be a string.");
    }

    const cleanSkillName = skillName.trim();
    const targetDir = await findSkillDirectory(cleanSkillName);

    if (!targetDir) {
      throw new McpError(ErrorCode.InvalidRequest, `Skill directory not found: ${cleanSkillName}`);
    }

    try {
      const mdFiles = await getMarkdownFiles(targetDir);

      if (mdFiles.length === 0) {
        return {
          content: [{ type: "text", text: `Skill "${cleanSkillName}" found, but contains no markdown (.md) rule files.` }],
          structuredContent: { skill_name: cleanSkillName, files: [], content: "" },
        };
      }

      const relativePaths = mdFiles.map((f) => path.relative(targetDir, f));
      const ruleSections: string[] = [];

      for (const filePath of mdFiles) {
        const relPath = path.relative(targetDir, filePath);
        const fileContent = await fsPromises.readFile(filePath, "utf-8");
        ruleSections.push(`=== FILE: ${relPath} ===\n\n${fileContent}`);
      }

      const combinedContent = ruleSections.join("\n\n" + "-".repeat(40) + "\n\n");

      return {
        content: [{ type: "text", text: combinedContent }],
        structuredContent: {
          skill_name: cleanSkillName,
          files: relativePaths,
          content: combinedContent,
        },
      };
    } catch (error: any) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, `Failed to read rule files for ${cleanSkillName}: ${error?.message || error}`);
    }
  }

  // ── Admin & Dashboard Tools ───────────────────────────────────
  if (name === "system_status") {
    try {
      const data = await getSystemStatusData();
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        structuredContent: data,
      };
    } catch (error: any) {
      throw new McpError(ErrorCode.InternalError, `Failed to get system status: ${error.message}`);
    }
  }

  if (name === "service_start" || name === "service_stop") {
    if (role !== "admin") {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Forbidden: Starting and stopping services is restricted to admin only.`
      );
    }
    try {
      const result = name === "service_start" ? await serviceStart(args) : await serviceStop(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } catch (error: any) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, `Service operation failed: ${error.message}`);
    }
  }

  if (name === "service_list") {
    try {
      const result = await serviceList();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } catch (error: any) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, `Service list failed: ${error.message}`);
    }
  }

  if (
    name === "oauth_generate_key" ||
    name === "oauth_validate_key" ||
    name === "oauth_list_keys" ||
    name === "oauth_regen_key" ||
    name === "oauth_delete_key"
  ) {
    try {
      const result =
        name === "oauth_generate_key" ? await oauthGenerateKey(args) :
        name === "oauth_validate_key" ? await oauthValidateKey(args) :
        name === "oauth_regen_key" ? await oauthRegenKey(args) :
        name === "oauth_delete_key" ? await oauthDeleteKey(args) :
        await oauthListKeys();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } catch (error: any) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, `OAuth operation failed: ${error.message}`);
    }
  }

  if (name === "session_create" || name === "session_get" || name === "session_list" || name === "session_delete") {
    try {
      const result =
        name === "session_create" ? await sessionCreate(args) :
        name === "session_get" ? await sessionGet(args) :
        name === "session_delete" ? await sessionDelete(args) :
        await sessionList();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } catch (error: any) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, `Session operation failed: ${error.message}`);
    }
  }

  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
}

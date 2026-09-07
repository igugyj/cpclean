// src/services/config.ts
import * as fs from "fs/promises";
import * as path from "path";
import stripJsonComments from "strip-json-comments";
import { CleanerConfig } from "../engine/types";

// 默认配置
export const DEFAULT_CONFIG: CleanerConfig = {
  referenceExtensions: ["md", "txt", "rst"],
  targetExtensions: ["png", "jpg", "jpeg", "gif", "svg", "ico", "webp"],
  excludeFolders: ["node_modules", "dist", ".git", "__pycache__"],
  pairs: {
    "(": ")",
    '"': '"',
    "'": "'",
    "`": "`",
    "[": "]",
    "<": ">",
  },
  scanRoot: "",
  allowExternalScan: false,
};

// 读取配置
export async function loadConfig(
  workspaceRoot: string,
): Promise<CleanerConfig> {
  const configPath = path.join(workspaceRoot, ".vscode", "cpcleaner.jsonc");

  try {
    const rawContent = await fs.readFile(configPath, "utf-8");
    const cleanContent = stripJsonComments(rawContent);
    const userConfig = JSON.parse(cleanContent);

    // 合并：默认值 + 用户配置（用户配置覆盖默认值）
    return {
      ...DEFAULT_CONFIG,
      ...userConfig,
    };
  } catch (error: any) {
    if (error.code === "ENOENT") {
      // 配置文件不存在，返回默认配置
      return { ...DEFAULT_CONFIG };
    }
    // 其他错误（如 JSON 格式错误），抛出
    throw new Error(`Failed to parse cpcleaner.jsonc: ${error.message}`);
  }
}

// 生成配置模板
export async function generateConfigTemplate(
  workspaceRoot: string,
): Promise<void> {
  const vscodeDir = path.join(workspaceRoot, ".vscode");
  const configPath = path.join(vscodeDir, "cpcleaner.jsonc");

  // 确保 .vscode 目录存在
  await fs.mkdir(vscodeDir, { recursive: true });

  const template = `{
    // File extensions for reference files (without dot)
    // These files will be read as content sources
    "referenceExtensions": ["md", "txt", "rst"],

    // File extensions for target files (without dot)
    // These files will be checked against reference content
    "targetExtensions": ["png", "jpg", "jpeg", "gif", "svg", "ico", "webp"],

    // Additional folders to exclude (merged with .gitignore)
    "excludeFolders": ["node_modules", "dist", ".git", "__pycache__"],

    // Paired delimiters for token extraction
    // Default pairs are sufficient for most use cases
    "pairs": {
        "(": ")",
        "\"": "\"",
        "'": "'",
        "\`": "\`",
        "[": "]",
        "<": ">"
    },

    // Scan root directory (relative to workspace root)
    // Leave empty to use workspace root
    "scanRoot": "",

    // Allow scanning outside workspace (default: false)
    "allowExternalScan": false
}`;

  await fs.writeFile(configPath, template, "utf-8");
}

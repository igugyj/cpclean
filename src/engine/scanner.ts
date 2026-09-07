import * as fs from "fs/promises";
import * as path from "path";
import { ScanOptions, FileInfo, ScanResult } from "./types";
/**
 * 递归遍历目录，收集符合扩展名规则的所有文件
 */
async function collectTargetFiles(
  rootDir: string,
  targetExtensions: string[],
  excludeFolders: string[],
  baseDir: string = rootDir,
  ignoreMatcher?: any,
): Promise<FileInfo[]> {
  const results: FileInfo[] = [];

  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(rootDir, entry.name);
      // ===== 实时匹配 .gitignore =====
      if (ignoreMatcher) {
        const relativePath = path.relative(baseDir, fullPath);
        if (ignoreMatcher.ignores(relativePath)) {
          continue;
        }
      }
      // 排除指定的文件夹
      if (entry.isDirectory() && excludeFolders.includes(entry.name)) {
        continue;
      }

      if (entry.isDirectory()) {
        // 递归进入子目录
        const subResults = await collectTargetFiles(
          fullPath,
          targetExtensions,
          excludeFolders,
          baseDir,
        );
        results.push(...subResults);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).replace(".", ""); // 去掉点
        if (targetExtensions.includes(ext)) {
          const stats = await fs.stat(fullPath);
          results.push({
            path: fullPath,
            name: entry.name,
            relativePath: path.relative(baseDir, fullPath),
            size: stats.size,
            mtime: stats.mtime.getTime(),
          });
        }
      }
    }
  } catch (error) {
    // 权限不足或其他错误，跳过该目录
    console.warn(`Skipping directory ${rootDir}:`, error);
  }

  return results;
}

/**
 * 从文本内容中提取文件名令牌
 * 使用配对定界符提取被包围的完整文件名（含扩展名）
 */
function extractTokens(
  content: string,
  pairs: Record<string, string>,
): Set<string> {
  const tokens = new Set<string>();

  for (const [left, right] of Object.entries(pairs)) {
    const escapedLeft = left.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedRight = right.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const regex = new RegExp(
      `${escapedLeft}([^${escapedRight}]+\\.[a-zA-Z0-9]+)${escapedRight}`,
      "g",
    );

    let match;
    while ((match = regex.exec(content)) !== null) {
      const fullToken = match[1];
      const fileName = path.basename(fullToken); // ← 关键修改
      tokens.add(fileName);
    }
  }

  return tokens;
}

/**
 * 读取所有参考文件，提取合并后的令牌集合
 */
async function extractAllTokens(
  refFiles: string[],
  pairs: Record<string, string>,
): Promise<Set<string>> {
  const allTokens = new Set<string>();

  for (const filePath of refFiles) {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const fileTokens = extractTokens(content, pairs);
      for (const token of fileTokens) {
        allTokens.add(token);
      }
    } catch (error) {
      // 跳过读取失败的文件（可能不是文本文件）
      console.warn(`Skipping reference file ${filePath}:`, error);
    }
  }
  const sample = Array.from(allTokens).slice(0, 5);
  console.log(`[extractTokens] Sample tokens:`, sample);
  console.log(`[extractTokens] Total tokens: ${allTokens.size}`);
  return allTokens;
}

/**
 * 主扫描函数：遍历目标文件，与参考令牌比对，返回未引用列表
 */
export async function scan(options: ScanOptions): Promise<ScanResult> {
  const {
    scanRoots,
    refFiles,
    targetExtensions,
    excludeFolders,
    pairs,
    ignoreMatcher,
  } = options;

  // 1. 收集所有目标文件（并行遍历多个根目录）
  const allTargetFiles: FileInfo[] = [];
  for (const root of scanRoots) {
    const files = await collectTargetFiles(
      root,
      targetExtensions,
      excludeFolders,
      root,
      ignoreMatcher,
    );
    allTargetFiles.push(...files);
  }

  // 2. 提取参考令牌
  const referencedTokens = await extractAllTokens(refFiles, pairs);

  // 3. 差集计算
  const unused: FileInfo[] = [];
  let matchedCount = 0;

  for (const file of allTargetFiles) {
    if (referencedTokens.has(file.name)) {
      matchedCount++;
    } else {
      unused.push(file);
    }
  }

  return {
    unused,
    totalScanned: allTargetFiles.length,
    matchedCount,
  };
}

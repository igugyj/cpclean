import * as fs from "fs/promises";
import * as path from "path";
import crypto from "crypto";

export interface CacheEntry {
  mtime: number;
  size: number;
  isReferenced: boolean;
}

export interface CacheData {
  version: string;
  configHash: string;
  files: Record<string, CacheEntry>;
  lastScanTime: string;
}

const CACHE_VERSION = "1.0";

/**
 * 获取缓存文件路径
 */
function getCachePath(rootDir: string): string {
  return path.join(rootDir, ".cpcleaner-cache", "cache.json");
}

/**
 * 确保缓存目录存在
 */
async function ensureCacheDir(rootDir: string): Promise<void> {
  const cacheDir = path.join(rootDir, ".cpcleaner-cache");
  await fs.mkdir(cacheDir, { recursive: true });
}

/**
 * 计算配置文件的哈希
 */
export async function computeConfigHash(rootDir: string): Promise<string> {
  const configPath = path.join(rootDir, ".vscode", "cpcleaner.jsonc");
  try {
    const content = await fs.readFile(configPath, "utf-8");
    return crypto
      .createHash("sha256")
      .update(content)
      .digest("hex")
      .slice(0, 8);
  } catch {
    // 配置文件不存在，返回默认哈希
    return "default";
  }
}

/**
 * 读取缓存
 */
export async function loadCache(rootDir: string): Promise<CacheData | null> {
  const cachePath = getCachePath(rootDir);
  try {
    const content = await fs.readFile(cachePath, "utf-8");
    const data = JSON.parse(content);
    // 验证版本
    if (data.version !== CACHE_VERSION) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/**
 * 保存缓存
 */
export async function saveCache(
  rootDir: string,
  files: Record<string, CacheEntry>,
  configHash: string,
): Promise<void> {
  await ensureCacheDir(rootDir);
  const cachePath = getCachePath(rootDir);
  const data: CacheData = {
    version: CACHE_VERSION,
    configHash,
    files,
    lastScanTime: new Date().toISOString(),
  };
  await fs.writeFile(cachePath, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * 清理过期缓存（移除已不存在的文件）
 */
export function pruneCache(
  cache: CacheData,
  existingFiles: Set<string>,
): CacheData {
  const pruned: Record<string, CacheEntry> = {};
  for (const [path, entry] of Object.entries(cache.files)) {
    if (existingFiles.has(path)) {
      pruned[path] = entry;
    }
  }
  return {
    ...cache,
    files: pruned,
  };
}

/**
 * 清理缓存（删除缓存目录）
 */
export async function clearCache(rootDir: string): Promise<void> {
  const cacheDir = path.join(rootDir, ".cpcleaner-cache");
  try {
    await fs.rm(cacheDir, { recursive: true, force: true });
  } catch (error) {
    // 目录不存在时忽略错误
    if ((error as any).code !== "ENOENT") {
      throw error;
    }
  }
}

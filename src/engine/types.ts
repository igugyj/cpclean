// src/engine/types.ts

/**
 * 扫描引擎的输入参数
 */
export interface ScanOptions {
  /** 要扫描的文件夹绝对路径列表 */
  scanRoots: string[];
  /** 参考文件的绝对路径列表 */
  refFiles: string[];
  /** 目标文件扩展名列表（不带点），如 ['png', 'jpg'] */
  targetExtensions: string[];
  /** 排除的文件夹名称列表（如 node_modules） */
  excludeFolders: string[];
  /** 定界符列表，用于从文本中提取文件名令牌 */
  pairs: Record<string, string>;
  ignoreMatcher?: any;
  /** 取消信号 */
  abortSignal?: AbortSignal;
  cacheData?: {
    files: Record<
      string,
      { mtime: number; size: number; isReferenced: boolean }
    >;
  };
}

/**
 * 文件信息（扫描结果中的每一项）
 */
export interface FileInfo {
  /** 文件的绝对路径 */
  path: string;
  /** 文件名（含扩展名） */
  name: string;
  /** 相对于扫描根目录的路径 */
  relativePath: string;
  /** 文件大小（字节） */
  size: number;
  /** 最后修改时间（Unix 时间戳） */
  mtime: number;
}

/**
 * 扫描结果
 */
export interface ScanResult {
  /** 未引用的文件列表 */
  unused: FileInfo[];
  /** 扫描过的目标文件总数 */
  totalScanned: number;
  /** 被引用的文件数量 */
  matchedCount: number;
  /** 所有文件的匹配状态（用于保存缓存） */
  filesStatus?: Record<string, { isReferenced: boolean }>;
  /** 所有文件信息（用于保存缓存） */
  allFileInfos?: FileInfo[];
}

/**
 * 插件配置（从 .vscode/cpcleaner.jsonc 读取）
 */
export interface CleanerConfig {
  /** 参考文件扩展名列表（不带点），如 ["md", "txt"] */
  referenceExtensions: string[];
  /** 目标文件扩展名列表（不带点），如 ["png", "jpg"] */
  targetExtensions: string[];
  /** 额外排除的文件夹名称（合并 .gitignore） */
  excludeFolders: string[];
  /** 配对定界符，如 { "(": ")", """: """ } */
  pairs: Record<string, string>;
  /** 扫描根目录（相对于工作区根目录），空字符串表示使用工作区根目录 */
  scanRoot: string;
  /** 是否允许扫描工作区外的目录，默认 false */
  allowExternalScan: boolean;
}

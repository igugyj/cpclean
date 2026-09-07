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
}

import * as vscode from "vscode";
import { PanelState } from "./PanelState";
import { scan } from "../engine/scanner";
import { collectRefFiles } from "../services/refCollector";
import { ScanOptions, ScanResult } from "../engine/types";
import * as fs from "fs/promises";
import * as path from "path";
import ignore from "ignore";
import { loadCache, saveCache, computeConfigHash } from "../services/cache";
import { clearCache as clearCacheFile } from "../services/cache"; // 顶部导入
import {
  loadConfig,
  ensureConfigFile,
  DEFAULT_CONFIG,
} from "../services/config";
import trash from "trash";

async function loadGitignoreMatcher(rootDir: string): Promise<any> {
  const gitignorePath = path.join(rootDir, ".gitignore");
  try {
    const content = await fs.readFile(gitignorePath, "utf-8");
    return ignore().add(content);
  } catch {
    return null;
  }
}

export function createMessageRouter(
  state: PanelState,
  panel: vscode.WebviewPanel,
) {
  let currentUnused = state.unused;
  let currentTotalScanned = state.totalScanned;
  let currentFolders = state.folders;
  let currentRefs = state.refs;
  let currentAbortController: AbortController | null = null;
  const workspaceRoot = state.workspaceRoot;

  async function send(type: string, payload?: any) {
    await panel.webview.postMessage({ type, payload });
  }

  // ===== 扫描 =====
  async function handleScan() {
    // 取消正在进行的扫描
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }

    if (currentFolders.length === 0) {
      vscode.window.showErrorMessage("Please add at least one scan directory");
      await send("error", {
        message: "Please add at least one scan directory",
      });
      return;
    }

    const abortController = new AbortController();
    currentAbortController = abortController;

    // 1. 加载配置（带容错）
    let config;
    try {
      config = await loadConfig(workspaceRoot);
    } catch (error: any) {
      const msg = `Config file parsing failed, using default config: ${error.message}`;
      vscode.window.showWarningMessage(msg);
      console.warn(
        "[CompareCleaner] Config parsing failed, using default config:",
        error,
      );
      config = { ...DEFAULT_CONFIG };
    }

    // 加载缓存
    const configHash = await computeConfigHash(workspaceRoot);
    const cache = await loadCache(workspaceRoot);
    const cacheValid = cache && cache.configHash === configHash;

    // 2. 外部目录权限检查
    if (!config.allowExternalScan) {
      for (const root of currentFolders) {
        const normalizedRoot = path.normalize(root);
        const normalizedWorkspace = path.normalize(workspaceRoot);
        if (!normalizedRoot.startsWith(normalizedWorkspace)) {
          const msg = `Scan directory "${root}" is outside workspace, set "allowExternalScan": true to allow external scanning`;
          vscode.window.showErrorMessage(msg);
          await send("error", { message: msg });
          return;
        }
      }
    }

    // 3. 加载 .gitignore 匹配器
    const ignoreMatcher = await loadGitignoreMatcher(workspaceRoot);

    // 4. 收集参考文件
    let refFiles: string[] = [];
    if (currentRefs.length === 0) {
      refFiles = await collectRefFiles(
        workspaceRoot,
        config.referenceExtensions,
        config.excludeFolders,
        ignoreMatcher,
      );
      if (refFiles.length === 0) {
        vscode.window.showErrorMessage(
          `No reference files found (extensions: ${config.referenceExtensions.join(", ")})`,
        );
        await send("error", { message: "No reference files found" });
        return;
      }
    } else {
      refFiles = currentRefs;
    }

    // 5. 构造扫描选项
    const options: ScanOptions = {
      scanRoots: currentFolders,
      refFiles,
      targetExtensions: config.targetExtensions,
      excludeFolders: config.excludeFolders,
      pairs: config.pairs,
      ignoreMatcher,
      cacheData: cacheValid ? cache : undefined,
      abortSignal: abortController.signal,
    };

    // 6. 执行扫描（带原生进度通知）
    await send("scanStarted");

    let result: ScanResult;
    try {
      result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "CompareCleaner: Scanning unreferenced files...",
          cancellable: true,
        },
        async (progress, token) => {
          token.onCancellationRequested(() => {
            if (abortController) {
              abortController.abort();
            }
          });
          return await scan(options);
        },
      );
    } catch (error: any) {
      if (error.name === "AbortError" || abortController?.signal.aborted) {
        await send("scanCancelled");
        return;
      }
      await send("error", { message: error.message });
      vscode.window.showErrorMessage(`Scan failed: ${error.message}`);
      return;
    }

    // 检查是否被取消
    if (abortController?.signal.aborted) {
      await send("scanCancelled");
      return;
    }

    // 保存缓存
    if (result.filesStatus && result.allFileInfos) {
      const cacheEntries: Record<
        string,
        { mtime: number; size: number; isReferenced: boolean }
      > = {};
      for (const file of result.allFileInfos) {
        const status = result.filesStatus[file.path];
        if (status !== undefined) {
          cacheEntries[file.path] = {
            mtime: file.mtime,
            size: file.size,
            isReferenced: status.isReferenced,
          };
        }
      }
      await saveCache(workspaceRoot, cacheEntries, configHash);
    }

    currentUnused = result.unused;
    currentTotalScanned = result.totalScanned;
    await send("result", currentUnused);
    await send("scanFinished", {
      totalScanned: currentTotalScanned,
      matchedCount: result.matchedCount,
    });

    // 清理控制器
    currentAbortController = null;
  }
  // ===== 清理缓存 =====
  async function handleClearCache() {
    try {
      await clearCacheFile(workspaceRoot);
      vscode.window.showInformationMessage("Cache cleared");
      await send("cacheCleared");
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to clear cache: ${error.message}`);
    }
  }

  // ===== 取消扫描 =====
  function handleCancelScan() {
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
  }

  // ===== 移除选中 =====
  async function handleRemoveFromUnused(indices: number[]) {
    if (indices.length === 0 || currentUnused.length === 0) return;
    const sorted = [...indices].sort((a, b) => b - a);
    for (const idx of sorted) {
      if (idx >= 0 && idx < currentUnused.length) {
        currentUnused.splice(idx, 1);
      }
    }
    await send("result", currentUnused);
    await send("scanFinished", {
      totalScanned: currentTotalScanned,
      matchedCount: currentTotalScanned - currentUnused.length,
    });
  }

  // ===== 清除列表 =====
  async function handleClearUnused() {
    currentUnused = [];
    await send("result", []);
    await send("scanFinished", {
      totalScanned: currentTotalScanned || 0,
      matchedCount: currentTotalScanned || 0,
    });
  }
  // ===== 执行清理（删除文件） =====
  async function handleDeleteUnused(indices: number[]) {
    // 1. 检查是否有选中文件
    if (indices.length === 0 || currentUnused.length === 0) {
      vscode.window.showWarningMessage("Please select files to delete first");
      return;
    }

    // 2. 获取要删除的文件路径
    const filesToDelete = indices
      .map((idx) => currentUnused[idx])
      .filter(Boolean);
    if (filesToDelete.length === 0) return;

    // 3. 弹窗确认
    const answer = await vscode.window.showWarningMessage(
      `Are you sure you want to delete ${filesToDelete.length} file(s)? Files will be moved to trash.`,
      { modal: true },
      "Confirm Delete",
      "Cancel",
    );
    if (answer !== "Confirm Delete") return;

    // 4. 执行删除
    try {
      const paths = filesToDelete.map((f) => f.path);
      await trash(paths);

      // 5. 从列表中移除已删除的文件
      const sortedIndices = [...indices].sort((a, b) => b - a);
      for (const idx of sortedIndices) {
        if (idx >= 0 && idx < currentUnused.length) {
          currentUnused.splice(idx, 1);
        }
      }

      // 6. 更新前端
      await send("result", currentUnused);
      await send("scanFinished", {
        totalScanned: currentTotalScanned,
        matchedCount: currentTotalScanned - currentUnused.length,
      });
      vscode.window.showInformationMessage(
        `Successfully deleted ${filesToDelete.length} file(s)`,
      );
    } catch (error: any) {
      vscode.window.showErrorMessage(`Delete failed: ${error.message}`);
    }
  }
  // ===== 重置 =====
  async function handleReset() {
    currentUnused = [];
    currentTotalScanned = 0;
    currentFolders = [workspaceRoot];
    currentRefs = [];
    await send("result", []);
    await send("scanFinished", { totalScanned: 0, matchedCount: 0 });
    await send("foldersUpdated", currentFolders);
    await send("refsUpdated", currentRefs);
  }

  async function handleRequestResetConfirm() {
    const answer = await vscode.window.showWarningMessage(
      "Are you sure you want to reset all lists?",
      { modal: true },
      "Confirm",
    );
    if (answer === "Confirm") {
      await handleReset();
    }
  }

  // ===== 扫描范围 =====
  async function handleSelectFolders() {
    const uris = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: true,
      title: "Select Scan Folders",
      defaultUri: vscode.Uri.file(workspaceRoot),
    });
    if (uris && uris.length > 0) {
      currentFolders = currentFolders.concat(uris.map((u) => u.fsPath));
      await send("foldersUpdated", currentFolders);
    }
  }

  function handleRemoveFolder(idx: number) {
    if (idx !== undefined && idx >= 0 && idx < currentFolders.length) {
      currentFolders.splice(idx, 1);
      send("foldersUpdated", currentFolders);
    }
  }

  function handleClearFolders() {
    currentFolders = [];
    send("foldersUpdated", currentFolders);
  }

  // ===== 参考来源 =====
  async function handleSelectRefFiles() {
    const uris = await vscode.window.showOpenDialog({
      canSelectFolders: false,
      canSelectFiles: true,
      canSelectMany: true,
      title: "Select Reference Files",
      defaultUri: vscode.Uri.file(workspaceRoot),
    });
    if (uris && uris.length > 0) {
      currentRefs = currentRefs.concat(uris.map((u) => u.fsPath));
      await send("refsUpdated", currentRefs);
    }
  }

  function handleRemoveRef(idx: number) {
    if (idx !== undefined && idx >= 0 && idx < currentRefs.length) {
      currentRefs.splice(idx, 1);
      send("refsUpdated", currentRefs);
    }
  }

  function handleClearRefs() {
    currentRefs = [];
    send("refsUpdated", currentRefs);
  }

  // ===== 配置 =====
  async function handleOpenConfig() {
    try {
      const configPath = await ensureConfigFile(workspaceRoot);
      const doc = await vscode.workspace.openTextDocument(configPath);
      await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.Beside,
      });
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to open config: ${error.message}`);
    }
  }

  // ===== 初始化 =====
  async function handleReady() {
    console.log("[ready] workspaceRoot:", workspaceRoot);
    console.log("[ready] currentFolders:", currentFolders);

    // 加载配置获取 referenceExtensions
    let referenceExtensions: string[] = ["md", "txt", "rst"]; // 默认
    try {
      const config = await loadConfig(workspaceRoot);
      referenceExtensions = config.referenceExtensions || referenceExtensions;
    } catch {
      // 使用默认
    }

    await send("init", { workspaceRoot, referenceExtensions });
    await send("foldersUpdated", currentFolders);
    await send("refsUpdated", currentRefs);
  }

  return {
    handleReady,
    handleScan,
    handleCancelScan,
    handleRemoveFromUnused,
    handleClearUnused,
    handleDeleteUnused,
    handleRequestResetConfirm,
    handleSelectFolders,
    handleRemoveFolder,
    handleClearFolders,
    handleSelectRefFiles,
    handleRemoveRef,
    handleClearRefs,
    handleClearCache,
    handleOpenConfig,
  };
}

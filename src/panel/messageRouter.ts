import * as vscode from "vscode";
import { PanelState } from "./PanelState";
import { scan } from "../engine/scanner";
import { loadConfig, ensureConfigFile } from "../services/config";
import { collectRefFiles } from "../services/refCollector";
import { ScanOptions } from "../engine/types";
import trash from "trash";

export function createMessageRouter(
  state: PanelState,
  panel: vscode.WebviewPanel,
) {
  let currentUnused = state.unused;
  let currentTotalScanned = state.totalScanned;
  let currentFolders = state.folders;
  let currentRefs = state.refs;
  const workspaceRoot = state.workspaceRoot;

  async function send(type: string, payload?: any) {
    await panel.webview.postMessage({ type, payload });
  }

  // ===== 扫描 =====
  async function handleScan() {
    if (currentFolders.length === 0) {
      vscode.window.showErrorMessage("请至少添加一个扫描目录");
      await send("error", { message: "请至少添加一个扫描目录" });
      return;
    }

    let refFiles: string[] = [];
    if (currentRefs.length === 0) {
      const config = await loadConfig(workspaceRoot);
      refFiles = await collectRefFiles(
        workspaceRoot,
        config.referenceExtensions,
        config.excludeFolders,
      );
      if (refFiles.length === 0) {
        vscode.window.showErrorMessage(
          `未找到任何参考文件（扩展名: ${config.referenceExtensions.join(", ")}）`,
        );
        await send("error", { message: "未找到任何参考文件" });
        return;
      }
    } else {
      refFiles = currentRefs;
    }

    const config = await loadConfig(workspaceRoot);
    const options: ScanOptions = {
      scanRoots: currentFolders,
      refFiles,
      targetExtensions: config.targetExtensions,
      excludeFolders: config.excludeFolders,
      pairs: config.pairs,
    };

    await send("scanStarted");
    try {
      const result = await scan(options);
      currentUnused = result.unused;
      currentTotalScanned = result.totalScanned;
      await send("result", currentUnused);
      await send("scanFinished", {
        totalScanned: currentTotalScanned,
        matchedCount: result.matchedCount,
      });
    } catch (error: any) {
      await send("error", { message: error.message });
      vscode.window.showErrorMessage(`扫描失败: ${error.message}`);
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
      vscode.window.showWarningMessage("请先勾选要删除的文件");
      return;
    }

    // 2. 获取要删除的文件路径
    const filesToDelete = indices
      .map((idx) => currentUnused[idx])
      .filter(Boolean);
    if (filesToDelete.length === 0) return;

    // 3. 弹窗确认
    const answer = await vscode.window.showWarningMessage(
      `确定要删除 ${filesToDelete.length} 个文件吗？文件将移至回收站。`,
      { modal: true },
      "确认删除",
      "取消",
    );
    if (answer !== "确认删除") return;

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
        `成功删除 ${filesToDelete.length} 个文件`,
      );
    } catch (error: any) {
      vscode.window.showErrorMessage(`删除失败: ${error.message}`);
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
      "确定要重置所有列表吗？",
      { modal: true },
      "确认",
    );
    if (answer === "确认") {
      await handleReset();
    }
  }

  // ===== 扫描范围 =====
  async function handleSelectFolders() {
    const uris = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: true,
      title: "选择扫描文件夹",
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
      title: "选择参考文件",
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
      vscode.window.showErrorMessage(`打开配置失败: ${error.message}`);
    }
  }

  // ===== 初始化 =====
  async function handleReady() {
    console.log("[ready] workspaceRoot:", workspaceRoot);
    console.log("[ready] currentFolders:", currentFolders);
    await send("init", { workspaceRoot });
    await send("foldersUpdated", currentFolders);
    await send("refsUpdated", currentRefs);
  }

  return {
    handleReady,
    handleScan,
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
    handleOpenConfig,
  };
}

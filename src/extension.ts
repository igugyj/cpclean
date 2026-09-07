import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { scan } from "./engine/scanner";
import { ScanOptions } from "./engine/types";
import { loadConfig } from "./services/config";

/**
 * 递归收集工作区内所有符合扩展名规则的文件
 */
async function collectRefFiles(
  rootDir: string,
  extensions: string[],
  excludeFolders: string[],
): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && excludeFolders.includes(entry.name)) {
          continue;
        }
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).replace(".", "");
          if (extensions.includes(ext)) {
            results.push(fullPath);
          }
        }
      }
    } catch (error) {
      console.warn(`Skipping directory ${dir}:`, error);
    }
  }

  await walk(rootDir);
  return results;
}

/**
 * 执行扫描的核心函数（供命令和消息调用）
 */
async function performScan(workspaceRoot: string): Promise<{
  result: any;
  config: any;
  refFiles: string[];
  scanRoots: string[];
}> {
  // 1. 加载配置
  const config = await loadConfig(workspaceRoot);

  // 2. 构造扫描根目录
  const scanRoots = config.scanRoot
    ? [path.join(workspaceRoot, config.scanRoot)]
    : [workspaceRoot];

  // 3. 收集参考文件
  const refFiles = await collectRefFiles(
    workspaceRoot,
    config.referenceExtensions,
    config.excludeFolders,
  );

  if (refFiles.length === 0) {
    throw new Error(
      `未找到任何参考文件（扩展名: ${config.referenceExtensions.join(", ")}）`,
    );
  }

  // 4. 构造扫描选项
  const options: ScanOptions = {
    scanRoots,
    refFiles,
    targetExtensions: config.targetExtensions,
    excludeFolders: config.excludeFolders,
    pairs: config.pairs,
  };

  // 5. 执行扫描
  const result = await scan(options);

  return { result, config, refFiles, scanRoots };
}

export function activate(context: vscode.ExtensionContext) {
  console.log("CompareCleaner is now active!");

  // 注册命令
  const openPanelCommand = vscode.commands.registerCommand(
    "comparecleaner.openPanel",
    async () => {
      // 1. 获取工作区根目录
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showErrorMessage("请先打开一个项目文件夹");
        return;
      }

      // 2. 创建 Webview Panel（不自动扫描）
      const panel = vscode.window.createWebviewPanel(
        "comparecleaner",
        "CompareCleaner",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        },
      );

      // 3. 加载媒体资源
      const mediaPath = path.join(
        context.extensionPath,
        "src",
        "webview",
        "media",
      );
      const styleUri = panel.webview.asWebviewUri(
        vscode.Uri.file(path.join(mediaPath, "style.css")),
      );

      // 4. 读取 HTML 模板并替换占位符
      let htmlContent = await fs.readFile(
        path.join(mediaPath, "index.html"),
        "utf-8",
      );
      htmlContent = htmlContent.replace(/{{styleUri}}/g, styleUri.toString());

      panel.webview.html = htmlContent;

      // 5. 监听前端消息
      panel.webview.onDidReceiveMessage(
        async (message) => {
          switch (message.type) {
            case "ready": {
              await panel.webview.postMessage({
                type: "init",
                payload: { workspaceRoot },
              });
              break;
            }
            case "runScan": {
              console.log("[runScan] 收到前端扫描请求");
              // 通知前端扫描开始
              await panel.webview.postMessage({ type: "scanStarted" });

              try {
                // 重新执行扫描
                const newScanData = await performScan(workspaceRoot);
                console.log("[runScan] 扫描完成，unused数量:", newScanData.result.unused.length);
                // 发送结果
                await panel.webview.postMessage({
                  type: "result",
                  payload: newScanData.result.unused,
                });
                await panel.webview.postMessage({
                  type: "scanFinished",
                  payload: {
                    totalScanned: newScanData.result.totalScanned,
                    matchedCount: newScanData.result.matchedCount,
                  },
                });
                console.log("[runScan] 结果消息已发送");
              } catch (error: any) {
                await panel.webview.postMessage({
                  type: "error",
                  payload: { message: error.message },
                });
                vscode.window.showErrorMessage(`扫描失败: ${error.message}`);
              }
              break;
            }

            // 后续可扩展其他消息类型
            // case "selectFolders": ...
            // case "selectRefFiles": ...
            // case "reset": ...
            // case "openConfig": ...
            // case "deleteUnused": ...
          }
        },
        undefined,
        context.subscriptions,
      );
    },
  );
  context.subscriptions.push(openPanelCommand);

  // 状态栏按钮
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.text = "cpCleaner";
  statusBarItem.tooltip = "Open CompareCleaner Panel";
  statusBarItem.command = "comparecleaner.openPanel";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
}

export function deactivate() {
  console.log("CompareCleaner is deactivated.");
}
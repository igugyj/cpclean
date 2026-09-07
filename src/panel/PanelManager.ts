import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { createInitialState } from "./PanelState";
import { createMessageRouter } from "./messageRouter";

export async function createPanel(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
) {
  const panel = vscode.window.createWebviewPanel(
    "comparecleaner",
    "CompareCleaner",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    },
  );
  panel.iconPath = new vscode.ThemeIcon("search");

  // 初始化状态
  const state = createInitialState(workspaceRoot);

  // 加载资源
  const mediaPath = path.join(context.extensionPath, "src", "webview", "media");
  const styleUri = panel.webview.asWebviewUri(
    vscode.Uri.file(path.join(mediaPath, "style.css")),
  );
  const scriptUri = panel.webview.asWebviewUri(
    vscode.Uri.file(path.join(mediaPath, "script.js")),
  );

  let htmlContent = await fs.readFile(
    path.join(mediaPath, "index.html"),
    "utf-8",
  );
  htmlContent = htmlContent
    .replace(/{{styleUri}}/g, styleUri.toString())
    .replace(/{{scriptUri}}/g, scriptUri.toString());

  panel.webview.html = htmlContent;

  // 创建消息路由器
  const router = createMessageRouter(state, panel);

  // 监听消息
  panel.webview.onDidReceiveMessage(
    async (message) => {
      switch (message.type) {
        case "ready":
          await router.handleReady();
          break;
        case "runScan":
          await router.handleScan();
          break;
        case "cancelScan":
          router.handleCancelScan();
          break;
        case "removeFromUnused":
          await router.handleRemoveFromUnused(message.payload.indices || []);
          break;
        case "clearUnused":
          await router.handleClearUnused();
          break;
        case "deleteUnused":
          await router.handleDeleteUnused(message.payload.indices || []);
          break;
        case "requestResetConfirm":
          await router.handleRequestResetConfirm();
          break;
        case "selectFolders":
          await router.handleSelectFolders();
          break;
        case "removeFolder":
          await router.handleRemoveFolder(message.payload.index);
          break;
        case "clearFolders":
          await router.handleClearFolders();
          break;
        case "selectRefFiles":
          await router.handleSelectRefFiles();
          break;
        case "removeRefFile":
          await router.handleRemoveRef(message.payload.index);
          break;
        case "clearRefs":
          await router.handleClearRefs();
          break;
        case "openConfig":
          await router.handleOpenConfig();
          break;
        case "clearCache":
          await router.handleClearCache();
          break;
        case "openFile":
          const filePath = message.payload.path;
          if (filePath) {
            try {
              const uri = vscode.Uri.file(filePath);
              await vscode.commands.executeCommand("vscode.open", uri);
            } catch (error: any) {
              vscode.window.showErrorMessage(
                `Cannot open file: ${error.message}`,
              );
            }
          }
          break;
        default:
          console.warn("[PanelManager] Unknown message:", message.type);
      }
    },
    undefined,
    context.subscriptions,
  );

  return panel;
}

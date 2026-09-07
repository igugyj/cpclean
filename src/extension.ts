import * as vscode from "vscode";
import { createPanel } from "./panel/PanelManager";

export function activate(context: vscode.ExtensionContext) {
  console.log("CompareCleaner is now active!");

  // 注册命令（命令面板 + 状态栏共用）
  const openPanelCommand = vscode.commands.registerCommand(
    "comparecleaner.openPanel",
    async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      console.log("[openPanel] workspaceRoot:", workspaceRoot);
      console.log("[openPanel] all folders:", vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath));
      if (!workspaceRoot) {
        vscode.window.showErrorMessage("请先打开一个项目文件夹");
        return;
      }
      createPanel(context, workspaceRoot);
    },
  );
  context.subscriptions.push(openPanelCommand);

  // 状态栏按钮
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.text = "$(search) CPC";
  statusBarItem.tooltip = "CompareCleaner";
  statusBarItem.command = "comparecleaner.openPanel";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
}

export function deactivate() {
  console.log("CompareCleaner is deactivated.");
}
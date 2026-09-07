import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  console.log("CompareCleaner is now active!");

  // 1. 注册命令（用于命令面板）
  const openPanelCommand = vscode.commands.registerCommand(
    "comparecleaner.openPanel",
    () => {
      // 占位提示，第 3 步会替换为真正的 Webview Panel 创建逻辑
      vscode.window.showInformationMessage(
        "Hello CompareCleaner! (Panel will open here later)",
      );
    },
  );
  context.subscriptions.push(openPanelCommand);

  // 2. 状态栏按钮（右下角入口）
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

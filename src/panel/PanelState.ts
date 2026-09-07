export interface PanelState {
  workspaceRoot: string;
  folders: string[];
  refs: string[];
  unused: any[];
  totalScanned: number;
  isScanning: boolean;
}

export function createInitialState(workspaceRoot: string): PanelState {
  return {
    workspaceRoot,
    folders: [workspaceRoot],
    refs: [],
    unused: [],
    totalScanned: 0,
    isScanning: false,
  };
}

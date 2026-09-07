const { createApp, ref, computed, onMounted } = Vue;

const app = createApp({
  setup() {
    const vscode = acquireVsCodeApi();

    // ===== 响应式数据 =====
    const workspaceRoot = ref("");
    const folders = ref([]);
    const refs = ref([]);
    const unusedFiles = ref([]);
    const checkedIndices = ref([]);
    const isScanning = ref(false);
    const progressPercent = ref(0);
    const progressText = ref("Ready");
    const referenceExtensions = ref([]);
    // ===== 计算属性 =====
    const statusText = computed(() => {
      if (isScanning.value) {
        return `Scanning... ${Math.round(progressPercent.value)}%`;
      }
      if (progressPercent.value >= 100 && progressText.value === "Done") {
        return "Done";
      }
      return "Ready";
    });

    const statusClass = computed(() => {
      if (isScanning.value) return "scanning";
      if (progressPercent.value >= 100 && progressText.value === "Done")
        return "done";
      return "idle";
    });

    const allChecked = computed({
      get: () => {
        if (!unusedFiles.value.length) return false;
        return checkedIndices.value.length === unusedFiles.value.length;
      },
      set: (val) => {
        if (val) {
          checkedIndices.value = unusedFiles.value.map((_, i) => i);
        } else {
          checkedIndices.value = [];
        }
      },
    });

    // ===== 通信 =====
    function postMessage(type, payload = {}) {
      vscode.postMessage({ type, payload });
    }

    // ===== 消息接收 =====
    window.addEventListener("message", (event) => {
      const msg = event.data;
      console.log("[Vue] Received message:", msg);
      switch (msg.type) {
        case "init":
          workspaceRoot.value = msg.payload.workspaceRoot || "";
          referenceExtensions.value = msg.payload.referenceExtensions || [];
          break;
        case "result":
          unusedFiles.value = msg.payload || [];
          checkedIndices.value = [];
          isScanning.value = false;
          progressPercent.value = 100;
          progressText.value = "Done";
          break;
        case "scanStarted":
          isScanning.value = true;
          progressPercent.value = 0;
          progressText.value = "Scanning";
          break;
        case "scanFinished":
          isScanning.value = false;
          if (msg.payload.totalScanned === 0) {
            progressPercent.value = 0;
            progressText.value = "Ready";
          } else {
            progressPercent.value = 100;
            progressText.value = "Done";
          }
          break;
        case "scanCancelled":
          isScanning.value = false;
          progressText.value = "Cancelled";
          progressPercent.value = 0;
          break;
        case "error":
          isScanning.value = false;
          progressText.value = "Error";
          break;
        case "foldersUpdated":
          folders.value = msg.payload || [];
          break;
        case "refsUpdated":
          refs.value = msg.payload || [];
          break;
        default:
          console.warn("[Vue] Unknown message:", msg.type);
      }
    });

    // ===== UI 动作 =====
    function runScan() {
      if (isScanning.value) {
        postMessage("cancelScan");
        return;
      }
      postMessage("runScan");
    }

    function addFolder() {
      postMessage("selectFolders");
    }
    function addFile() {
      postMessage("selectRefFiles");
    }
    function clearFolders() {
      postMessage("clearFolders");
    }
    function clearRefs() {
      postMessage("clearRefs");
    }
    function removeFolder(idx) {
      postMessage("removeFolder", { index: idx });
    }
    function removeRef(idx) {
      postMessage("removeRefFile", { index: idx });
    }
    function clearList() {
      postMessage("clearUnused");
    }

    function removeSelected() {
      const indices = [...checkedIndices.value];
      if (indices.length === 0) return;
      postMessage("removeFromUnused", { indices });
      checkedIndices.value = [];
    }

    function deleteSelected() {
      const indices = [...checkedIndices.value];
      if (indices.length === 0) {
        vscode.postMessage({
          type: "warning",
          payload: "Please select files to delete first",
        });
        return;
      }
      postMessage("deleteUnused", { indices });
    }

    function reset() {
      postMessage("requestResetConfirm");
    }

    function openConfig() {
      postMessage("openConfig");
    }
    function clearCache() {
      postMessage("clearCache");
    }
    function toggleAll(e) {
      allChecked.value = e.target.checked;
    }

    // ===== 生命周期 =====
    onMounted(() => {
      postMessage("ready");
    });

    function openFile(filePath) {
      postMessage("openFile", { path: filePath });
    }

    return {
      workspaceRoot,
      folders,
      refs,
      unusedFiles,
      checkedIndices,
      isScanning,
      progressPercent,
      progressText,
      statusText,
      statusClass,
      allChecked,
      referenceExtensions,
      runScan,
      addFolder,
      addFile,
      clearFolders,
      clearRefs,
      removeFolder,
      removeRef,
      clearList,
      removeSelected,
      deleteSelected,
      reset,
      openConfig,
      toggleAll,
      clearCache,
      openFile,
    };
  },
});

app.mount("#app");

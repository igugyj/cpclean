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
    const progressText = ref("就绪");

    // ===== 计算属性 =====
    const statusText = computed(() => {
      if (isScanning.value) {
        return `扫描中... ${Math.round(progressPercent.value)}%`;
      }
      if (progressPercent.value >= 100 && progressText.value === "完成") {
        return "完成";
      }
      return "就绪";
    });

    const statusClass = computed(() => {
      if (isScanning.value) return "scanning";
      if (progressPercent.value >= 100 && progressText.value === "完成")
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
      console.log("[Vue] 收到消息:", msg);
      switch (msg.type) {
        case "init":
          workspaceRoot.value = msg.payload.workspaceRoot || "";
          break;
        case "result":
          unusedFiles.value = msg.payload || [];
          checkedIndices.value = [];
          isScanning.value = false;
          progressPercent.value = 100;
          progressText.value = "完成";
          break;
        case "scanStarted":
          isScanning.value = true;
          progressPercent.value = 0;
          progressText.value = "扫描中";
          break;
        case "scanFinished":
          isScanning.value = false;
          progressPercent.value = 100;
          progressText.value = "完成";
          break;
        case "error":
          isScanning.value = false;
          progressText.value = "错误";
          break;
        case "foldersUpdated":
          folders.value = msg.payload || [];
          break;
        case "refsUpdated":
          refs.value = msg.payload || [];
          break;
        default:
          console.warn("[Vue] 未知消息:", msg.type);
      }
    });

    // ===== UI 动作 =====
    function runScan() {
      if (isScanning.value) return;
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
          payload: "请先勾选要删除的文件",
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
    function showHelp() {
      postMessage("showHelp");
    }

    function toggleAll(e) {
      allChecked.value = e.target.checked;
    }

    // ===== 生命周期 =====
    onMounted(() => {
      postMessage("ready");
    });

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
      showHelp,
      toggleAll,
    };
  },
});

app.mount("#app");

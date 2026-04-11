<script setup lang="ts">
import type { Component } from "vue";

import { Play24Regular } from "@vicons/fluent";
import {
  NButton,
  NCard,
  NEmpty,
  NIcon,
  NLayout,
  NLayoutFooter,
  NSpace,
  NSplit,
  NTabPane,
  NTag,
  NTabs,
  useMessage,
} from "naive-ui";
import { computed, h, onBeforeUnmount, onMounted, reactive, watch } from "vue";

import { useRuntimeStore } from "@/ide/stores/runtime";
import { useVfsStore } from "@/ide/stores/vfs";

import CodeEditor from "./CodeEditor.vue";
import FileExplorerTree from "./FileExplorerTree.vue";
import OutputLogPanel from "./OutputLogPanel.vue";

const vfs = useVfsStore();
const runtime = useRuntimeStore();
const message = useMessage();
const tabContents = reactive<Record<string, string>>({});

const canRun = computed(() => !runtime.running && Boolean(vfs.activePath));
const hasTabs = computed(() => vfs.openedTabs.length > 0);
const AUTO_SAVE_DEBOUNCE_MS = 500;

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
let suppressAutoSave = false;

function icon(iconComp: unknown) {
  return () => h(NIcon, null, { default: () => h(iconComp as Component) });
}

async function runProgram(): Promise<void> {
  if (!vfs.activePath) {
    message.error("No file selected");
    return;
  }

  try {
    await persistActiveFile();
  } catch (error) {
    message.error(error instanceof Error ? error.message : "Failed to save file");
    return;
  }

  runtime.setActiveFile(vfs.activePath);
  await runtime.runActiveFile();
  if (runtime.lastRunSuccess) {
    message.success("Execution completed");
  } else {
    message.error(runtime.lastError ?? "Execution failed");
  }
}

function clearAutoSaveTimer(): void {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
}

async function persistActiveFile(): Promise<void> {
  clearAutoSaveTimer();
  const path = vfs.activePath;
  if (!path) {
    return;
  }
  await vfs.saveActiveFile(tabContents[path] ?? "");
}

function scheduleAutoSave(): void {
  clearAutoSaveTimer();
  autoSaveTimer = setTimeout(() => {
    const path = vfs.activePath;
    if (!path) {
      autoSaveTimer = null;
      return;
    }

    autoSaveTimer = null;
    void vfs.saveActiveFile(tabContents[path] ?? "");
  }, AUTO_SAVE_DEBOUNCE_MS);
}

async function openFile(path: string): Promise<void> {
  await persistActiveFile();
  suppressAutoSave = true;
  await vfs.openFile(path);
  tabContents[path] = vfs.activeContent;
  suppressAutoSave = false;
  runtime.setActiveFile(path);
}

function updateTabContent(path: string, content: string): void {
  tabContents[path] = content;
  if (path === vfs.activePath) {
    vfs.activeContent = content;
  }
}

function tabLabel(path: string): string {
  const chunks = path.split("/").filter(Boolean);
  return chunks[chunks.length - 1] ?? "untitled";
}

async function handleTabChange(name: string | number): Promise<void> {
  if (typeof name !== "string") {
    return;
  }
  await openFile(name);
}

async function handleCloseTab(name: string | number): Promise<void> {
  if (typeof name !== "string") {
    return;
  }

  await persistActiveFile();
  await vfs.closeTab(name);
  delete tabContents[name];
  if (vfs.activePath && tabContents[vfs.activePath] === undefined) {
    tabContents[vfs.activePath] = vfs.activeContent;
  }
  runtime.setActiveFile(vfs.activePath || "/main.pseudo");
}

onMounted(async () => {
  suppressAutoSave = true;
  await vfs.initialize();
  if (vfs.activePath) {
    tabContents[vfs.activePath] = vfs.activeContent;
  }
  suppressAutoSave = false;
  runtime.setActiveFile(vfs.activePath || "/main.pseudo");
});

onBeforeUnmount(() => {
  clearAutoSaveTimer();
});

watch(
  () => vfs.activeContent,
  () => {
    if (suppressAutoSave) {
      return;
    }
    scheduleAutoSave();
  },
);

watch(
  () => vfs.openedTabs.slice(),
  (tabs) => {
    const opened = new Set(tabs);
    for (const path of Object.keys(tabContents)) {
      if (!opened.has(path)) {
        delete tabContents[path];
      }
    }
  },
);
</script>

<template>
  <NLayout class="ide-shell">
    <NSplit direction="vertical" :default-size="0.66" :min="0.3" :max="0.88">
      <template #1>
        <NSplit direction="horizontal" :default-size="0.24" :min="0.16" :max="0.45">
          <template #1>
            <div class="explorer-pane">
              <FileExplorerTree @file-selected="openFile" />
            </div>
          </template>
          <template #2>
            <div style="display: flex; flex-direction: column; height: 100%">
              <NCard size="small" :bordered="false" content-style="padding: 8px 12px;">
                <NSpace justify="space-between" align="center">
                  <NSpace>
                    <NTag type="info" size="small">{{ vfs.activeFileName }}</NTag>
                    <NTag size="small" type="warning">CAIE PseudoCode</NTag>
                  </NSpace>

                  <NSpace>
                    <NButton
                      size="small"
                      type="primary"
                      :loading="runtime.running"
                      :disabled="!canRun"
                      :render-icon="icon(Play24Regular)"
                      @click="runProgram"
                    >
                      Run
                    </NButton>
                  </NSpace>
                </NSpace>
              </NCard>

              <NCard
                size="small"
                :bordered="false"
                content-style="padding: 6px 8px 0;"
                style="margin-top: 4px"
              >
                <NTabs
                  :value="vfs.activePath"
                  type="card"
                  closable
                  tab-style="min-width: 120px;"
                  @update:value="handleTabChange"
                  @close="handleCloseTab"
                >
                  <NTabPane
                    v-for="tabPath in vfs.openedTabs"
                    :key="tabPath"
                    :tab="tabLabel(tabPath)"
                    :name="tabPath"
                  />
                </NTabs>
              </NCard>

              <NCard
                class="editor-card"
                size="small"
                :bordered="false"
                content-style="height: 100%; padding: 0;"
                style="flex-grow: 1"
              >
                <div v-if="!hasTabs" class="empty-editor">
                  <NEmpty description="No file opened" />
                </div>
                <template v-else>
                  <div
                    v-for="tabPath in vfs.openedTabs"
                    :key="tabPath"
                    v-show="tabPath === vfs.activePath"
                    class="editor-instance"
                  >
                    <CodeEditor
                      :model-value="tabContents[tabPath] ?? ''"
                      @update:model-value="(value) => updateTabContent(tabPath, value)"
                    />
                  </div>
                </template>
              </NCard>
            </div>
          </template>
        </NSplit>
      </template>

      <template #2>
        <NLayoutFooter bordered class="console-panel">
          <OutputLogPanel />
        </NLayoutFooter>
      </template>
    </NSplit>
  </NLayout>
</template>

<style scoped>
.ide-shell {
  height: 100vh;
}

.console-panel {
  height: 100%;
  padding: 10px 14px;
}

.editor-card {
  height: 100%;
}

.explorer-pane {
  height: 100%;
  
}

.empty-editor {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.editor-instance {
  height: 100%;
}

@media (max-width: 900px) {
  .editor-card {
    min-height: 320px;
  }
}
</style>

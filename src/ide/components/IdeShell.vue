<script setup lang="ts">
import type { Component } from "vue";

import { Bug24Regular, Play24Regular, Stop24Regular } from "@vicons/fluent";
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
import { computed, h, nextTick, onBeforeUnmount, onMounted, reactive, watch } from "vue";

import { useRuntimeStore } from "@/ide/stores/runtime";
import { useVfsStore } from "@/ide/stores/vfs";

import CodeEditor from "./CodeEditor.vue";
import FileExplorerTree from "./FileExplorerTree.vue";
import OutputLogPanel from "./OutputLogPanel.vue";

const vfs = useVfsStore();
const runtime = useRuntimeStore();
const message = useMessage();
const tabContents = reactive<Record<string, string>>({});
const tabDirty = reactive<Record<string, boolean>>({});
const editorRefs = reactive<Record<string, { focusEditor?: () => void } | null>>({});

const canRun = computed(() => !runtime.running && Boolean(vfs.activePath));
const hasTabs = computed(() => vfs.openedTabs.length > 0);
const showDebugControls = computed(() => runtime.debugSessionActive);
const canDebugCommand = computed(() => runtime.debugSessionActive && runtime.debugPaused);
const runActionActive = computed(() => runtime.running && !runtime.debugMode);
const debugActionActive = computed(() => runtime.running && runtime.debugMode);
const runButtonLabel = computed(() => (runtime.running && !runtime.debugMode ? "Stop" : "Run"));
const debugButtonLabel = computed(() => (runtime.running && runtime.debugMode ? "Exit" : "Debug"));
const AUTO_SAVE_DEBOUNCE_MS = 500;

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
let suppressAutoSave = false;

function icon(iconComp: unknown) {
  return () => h(NIcon, null, { default: () => h(iconComp as Component) });
}

async function runProgram(): Promise<void> {
  if (runtime.running && !runtime.debugMode) {
    runtime.stopActiveRun();
    return;
  }

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
  await runtime.runActiveFile({ debug: false });
  if (runtime.lastRunSuccess) {
    message.success("Execution completed");
  } else {
    message.error(runtime.lastError ?? "Execution failed");
  }
}

async function debugProgram(): Promise<void> {
  if (runtime.running && runtime.debugMode) {
    runtime.stopActiveRun();
    return;
  }

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
  await runtime.runActiveFile({ debug: true });
  if (runtime.lastRunSuccess) {
    message.success("Debug execution completed");
  } else {
    message.error(runtime.lastError ?? "Debug execution failed");
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
  if (!tabDirty[path]) {
    return;
  }
  await vfs.saveActiveFile(tabContents[path] ?? "");
  tabDirty[path] = false;
}

function scheduleAutoSave(): void {
  clearAutoSaveTimer();
  autoSaveTimer = setTimeout(() => {
    const path = vfs.activePath;
    if (!path) {
      autoSaveTimer = null;
      return;
    }
    if (!tabDirty[path]) {
      autoSaveTimer = null;
      return;
    }

    autoSaveTimer = null;
    void vfs.saveActiveFile(tabContents[path] ?? "").then(() => {
      tabDirty[path] = false;
    });
  }, AUTO_SAVE_DEBOUNCE_MS);
}

async function openFile(path: string): Promise<void> {
  await persistActiveFile();
  suppressAutoSave = true;
  await vfs.openFile(path);
  tabContents[path] = vfs.activeContent;
  tabDirty[path] = false;
  suppressAutoSave = false;
  runtime.setActiveFile(path);
  await focusActiveEditor();
}

function updateTabContent(path: string, content: string): void {
  if (tabContents[path] !== content) {
    tabDirty[path] = true;
  }
  tabContents[path] = content;
  if (path === vfs.activePath) {
    vfs.activeContent = content;
  }
}

function setEditorRef(path: string, instance: unknown): void {
  editorRefs[path] = (instance as { focusEditor?: () => void } | null) ?? null;
}

async function focusActiveEditor(): Promise<void> {
  if (!vfs.activePath) {
    return;
  }
  await nextTick();
  editorRefs[vfs.activePath]?.focusEditor?.();
}

function tabLabel(path: string): string {
  const chunks = path.split("/").filter(Boolean);
  return chunks[chunks.length - 1] ?? "untitled";
}

function isPseudocodeFile(path: string): boolean {
  return path.toLowerCase().endsWith(".pseudo");
}

function activeDebugLineFor(path: string): number | null {
  if (path !== vfs.activePath) {
    return null;
  }
  return runtime.debugSnapshot?.location.line ?? null;
}

function toggleBreakpoint(path: string, line: number): void {
  runtime.toggleBreakpoint(path, line);
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
  delete tabDirty[name];
  delete editorRefs[name];
  if (vfs.activePath && tabContents[vfs.activePath] === undefined) {
    tabContents[vfs.activePath] = vfs.activeContent;
  }
  runtime.setActiveFile(vfs.activePath || "/main.pseudo");
  await focusActiveEditor();
}

onMounted(async () => {
  suppressAutoSave = true;
  await vfs.initialize();
  if (vfs.activePath) {
    tabContents[vfs.activePath] = vfs.activeContent;
    tabDirty[vfs.activePath] = false;
  }
  suppressAutoSave = false;
  runtime.setActiveFile(vfs.activePath || "/main.pseudo");
  await focusActiveEditor();
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
    for (const path of Object.keys(tabDirty)) {
      if (!opened.has(path)) {
        delete tabDirty[path];
      }
    }
    for (const path of Object.keys(editorRefs)) {
      if (!opened.has(path)) {
        delete editorRefs[path];
      }
    }
  },
);
</script>

<template>
  <NLayout class="ide-shell">
    <NSplit direction="horizontal" :default-size="0.3" :min="0.2" :max="0.5">
      <template #1>
        <div class="explorer-pane">
          <FileExplorerTree @file-selected="openFile" />
        </div>
      </template>
      <template #2>
        <NSplit direction="vertical" :default-size="0.75" :min="0.2" :max="0.9">
          <template #1>
            <div style="display: flex; flex-direction: column; height: 100%">
              <NCard
                size="small"
                :bordered="false"
                content-style="padding: 8px 12px;"
                v-if="hasTabs"
              >
                <NSpace justify="space-between" align="center">
                  <NSpace>
                    <NTag type="info" size="small">{{ vfs.activeFileName }}</NTag>
                    <NTag
                      v-if="vfs.activePath && isPseudocodeFile(vfs.activePath)"
                      size="small"
                      type="warning"
                    >
                      CAIE PseudoCode
                    </NTag>
                  </NSpace>

                  <NSpace>
                    <NTag v-if="showDebugControls" size="small" :type="runtime.debugPaused ? 'warning' : 'info'">
                      {{ runtime.debugPaused ? "Paused" : "Debugging" }}
                    </NTag>
                    <NButton
                      v-if="showDebugControls"
                      size="small"
                      tertiary
                      :disabled="!canDebugCommand"
                      @click="runtime.continueDebug"
                    >
                      Continue
                    </NButton>
                    <NButton
                      v-if="showDebugControls"
                      size="small"
                      tertiary
                      :disabled="!canDebugCommand"
                      @click="runtime.stepIntoDebug"
                    >
                      Step Into
                    </NButton>
                    <NButton
                      v-if="showDebugControls"
                      size="small"
                      tertiary
                      :disabled="!canDebugCommand"
                      @click="runtime.stepOverDebug"
                    >
                      Step Over
                    </NButton>
                    <NButton
                      size="small"
                      :type="runActionActive ? 'error' : 'primary'"
                      :disabled="!runActionActive && (!canRun || runtime.awaitingInput)"
                      :render-icon="icon(runActionActive ? Stop24Regular : Play24Regular)"
                      @click="runProgram"
                    >
                      {{ runButtonLabel }}
                    </NButton>
                    <NButton
                      size="small"
                      :type="debugActionActive ? 'error' : undefined"
                      :secondary="!debugActionActive"
                      :disabled="!debugActionActive && (!canRun || runtime.awaitingInput)"
                      :render-icon="icon(debugActionActive ? Stop24Regular : Bug24Regular)"
                      @click="debugProgram"
                    >
                      {{ debugButtonLabel }}
                    </NButton>
                  </NSpace>
                </NSpace>
              </NCard>

              <NCard
                v-if="hasTabs"
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
                      :ref="(el) => setEditorRef(tabPath, el)"
                      :breakpoints="runtime.getBreakpoints(tabPath)"
                      :active-debug-line="activeDebugLineFor(tabPath)"
                      :enable-pseudocode="isPseudocodeFile(tabPath)"
                      :model-value="tabContents[tabPath] ?? ''"
                      @toggle-breakpoint="(line) => toggleBreakpoint(tabPath, line)"
                      @update:model-value="(value) => updateTabContent(tabPath, value)"
                    />
                  </div>
                </template>
              </NCard>
            </div>
          </template>
          <template #2>
            <NLayoutFooter bordered class="console-panel">
              <OutputLogPanel />
            </NLayoutFooter>
          </template>
        </NSplit>
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
}

.editor-card {
  height: 100%;
  min-height: 0;
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
</style>

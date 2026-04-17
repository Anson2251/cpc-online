<script setup lang="ts">
import type { Component } from "vue";

import {
  ArrowClockwise24Regular,
  BookOpen20Regular,
  Box16Regular,
  Desktop16Regular,
  FolderOpen20Regular,
  WeatherMoon16Regular,
  WeatherSunny16Regular,
} from "@vicons/fluent";
import {
  NButton,
  NCard,
  NCollapse,
  NCollapseItem,
  NDropdown,
  NEmpty,
  NIcon,
  NLayout,
  NLayoutFooter,
  NModal,
  NPerformantEllipsis,
  NSelect,
  NSpace,
  NSplit,
  NTabPane,
  NTag,
  NTabs,
  NA,
  NP,
  NH2,
  type DropdownOption,
  type SelectOption,
  NTooltip,
  useThemeVars,
  useMessage,
} from "naive-ui";
import {
  computed,
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";

import { useRuntimeStore } from "@/ide/stores/runtime";
import { useVfsStore } from "@/ide/stores/vfs";

import CodeEditor from "./CodeEditor.vue";
import DocViewer from "./DocViewer.vue";
import FileExplorerTree from "./FileExplorerTree.vue";
import IdeTitlePane from "./IdeTitlePane.vue";
import OutputLogPanel from "./OutputLogPanel.vue";

type ThemeMode = "light" | "dark" | "system";

const props = defineProps<{
  themeMode: ThemeMode;
}>();

const emit = defineEmits<{
  "update:theme-mode": [value: ThemeMode];
}>();

const vfs = useVfsStore();
const runtime = useRuntimeStore();
const message = useMessage();
const theme = useThemeVars();
const tabContents = reactive<Record<string, string>>({});
const tabDirty = reactive<Record<string, boolean>>({});

const leftPaneTab = ref<string>("explorer");
const activeDocKey = ref<string>("cpc-guide");

const docOptions: SelectOption[] = [
  { label: "CPC Guide", value: "cpc-guide" },
  { label: "CPC Insert", value: "cpc-insert" },
  { label: "CPC Extended", value: "cpc-extended" },
];
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
const mainRepoUrl = "https://github.com/Anson2251/cpc-online";
const coreRepoUrl = "https://github.com/Anson2251/vibe-cpc";

const GithubIcon = defineComponent({
  name: "GithubIcon",
  setup() {
    return () =>
      h(
        "svg",
        {
          viewBox: "0 0 24 24",
          fill: "currentColor",
          width: "1em",
          height: "1em",
          "aria-hidden": "true",
        },
        [
          h("path", {
            d: "M12 .5A12 12 0 0 0 8.2 23.9c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.7-1.3-1.7-1.1-.8.1-.8.1-.8 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.4-1.3-5.4-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.6 11.6 0 0 1 6 0C17.4 5 18.4 5.3 18.4 5.3c.7 1.6.3 2.8.2 3.1.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.5.4.8 1.1.8 2.3v3.4c0 .3.2.7.8.6A12 12 0 0 0 12 .5",
          }),
        ],
      );
  },
});

const themeDropdownOptions: DropdownOption[] = [
  { label: "Light", key: "light", icon: icon(WeatherSunny16Regular) },
  { label: "Dark", key: "dark", icon: icon(WeatherMoon16Regular) },
  { label: "System", key: "system", icon: icon(Desktop16Regular) },
];

const themeModeLabel = computed(() => {
  if (props.themeMode === "light") {
    return "Light";
  }
  if (props.themeMode === "dark") {
    return "Dark";
  }
  return "System";
});

const themeModeIcon = computed(() => {
  if (props.themeMode === "light") {
    return WeatherSunny16Regular;
  }
  if (props.themeMode === "dark") {
    return WeatherMoon16Regular;
  }
  return Desktop16Regular;
});

const brandDockStyle = computed(() => ({
  background: theme.value.cardColor,
  border: `1px solid ${theme.value.borderColor}`,
  boxShadow: theme.value.boxShadow1,
}));

const showAboutDialog = ref(false);
const aboutExpandedNames = ref<Array<string | number>>([]);

const aboutModalWidth = computed(() =>
  aboutExpandedNames.value.includes("license")
    ? "min(680px, calc(100vw - 24px))"
    : "min(480px, calc(100vw - 24px))",
);

function handleThemeModeSelect(key: string | number): void {
  if (key === "light" || key === "dark" || key === "system") {
    emit("update:theme-mode", key);
  }
}

function openAboutDialog(): void {
  showAboutDialog.value = true;
}

function closeAboutDialog(): void {
  showAboutDialog.value = false;
  aboutExpandedNames.value = [];
}

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
  runtime.setActiveFile(vfs.activePath);
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
  runtime.setActiveFile(vfs.activePath);
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
          <NCard
            size="small"
            :bordered="false"
            style="height: 100%;"
            content-style="min-height: 0; padding: 0; display: flex; flex-direction: column;"
            header-style="padding-bottom: 4px; padding-top: 6px;"
          >
            <template #header>
              <NTabs v-model:value="leftPaneTab" size="small" class="panel-tabs" type="bar">
                <NTabPane name="explorer">
                  <template #tab>
                    <NTooltip>
                      <template #trigger>
                        <NIcon size="20"><FolderOpen20Regular /></NIcon>
                      </template>
                      Explorer
                    </NTooltip>
                  </template>
                </NTabPane>
                <NTabPane name="docs">
                  <template #tab>
                    <NTooltip>
                      <template #trigger>
                        <NIcon size="20"><BookOpen20Regular /></NIcon>
                      </template>
                      Docs
                    </NTooltip>
                  </template>
                </NTabPane>
              </NTabs>
            </template>

            <template #header-extra>
              <NTooltip v-if="leftPaneTab === 'explorer'">
                <template #trigger>
                  <NButton quaternary circle size="small" @click="vfs.refreshNodes">
                    <template #icon>
                      <NIcon><ArrowClockwise24Regular /></NIcon>
                    </template>
                  </NButton>
                </template>
                Refresh
              </NTooltip>
              <NSelect
                v-else
                v-model:value="activeDocKey"
                :options="docOptions"
                size="small"
                style="width: 140px"
              />
            </template>

            <div v-if="leftPaneTab === 'explorer'" class="panel-body">
              <FileExplorerTree @file-selected="openFile" />
            </div>
            <div v-else class="panel-body">
              <DocViewer :active-doc-key="activeDocKey" />
            </div>
          </NCard>
        </div>
      </template>
      <template #2>
        <NSplit direction="vertical" :default-size="0.75" :min="0.2" :max="0.9">
          <template #1>
            <div style="display: flex; flex-direction: column; height: 100%">
              <IdeTitlePane
                :has-tabs="hasTabs"
                :active-file-name="vfs.activeFileName"
                :active-path="vfs.activePath"
                :show-debug-controls="showDebugControls"
                :can-debug-command="canDebugCommand"
                :debug-paused="runtime.debugPaused"
                :run-action-active="runActionActive"
                :debug-action-active="debugActionActive"
                :can-run="canRun"
                :awaiting-input="runtime.awaitingInput"
                :run-button-label="runButtonLabel"
                :debug-button-label="debugButtonLabel"
                @continue-debug="runtime.continueDebug"
                @step-into-debug="runtime.stepIntoDebug"
                @step-over-debug="runtime.stepOverDebug"
                @run-program="runProgram"
                @debug-program="debugProgram"
              />

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
                  tab-style="min-width: 120px; max-width: 220px;"
                  @update:value="handleTabChange"
                  @close="handleCloseTab"
                >
                  <NTabPane v-for="tabPath in vfs.openedTabs" :key="tabPath" :name="tabPath">
                    <template #tab>
                      <div style="max-width: 140px">
                        <NPerformantEllipsis>
                          {{ tabLabel(tabPath) }}
                        </NPerformantEllipsis>
                      </div>
                    </template>
                  </NTabPane>
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

    <div class="ide-brand-dock" tabindex="0" aria-label="Repository links" :style="brandDockStyle">
      <div class="ide-brand-links">
        <NDropdown trigger="click" :options="themeDropdownOptions" @select="handleThemeModeSelect">
          <NTooltip>
            <template #trigger>
              <NButton circle quaternary size="small" :title="`Theme: ${themeModeLabel}`">
                <template #icon>
                  <NIcon>
                    <component :is="themeModeIcon" />
                  </NIcon>
                </template>
              </NButton>
            </template>
            Theme: {{ themeModeLabel }}
          </NTooltip>
        </NDropdown>
      </div>

      <NButton quaternary size="small" aria-label="About CPC-ONLINE" @click="openAboutDialog">
        <span class="ide-brand-title">CPC-ONLINE</span>
      </NButton>
      <div class="ide-brand-links">
        <a
          :href="mainRepoUrl"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open CPC-ONLINE repository"
        >
          <NTooltip>
            <template #trigger>
              <NButton circle quaternary size="small" title="CPC-ONLINE GitHub">
                <template #icon>
                  <NIcon>
                    <GithubIcon />
                  </NIcon>
                </template>
              </NButton>
            </template>
            CPC Online
          </NTooltip>
        </a>
        <a
          :href="coreRepoUrl"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open cpc-core repository"
        >
          <NTooltip>
            <template #trigger>
              <NButton circle quaternary size="small" title="cpc-core GitHub">
                <template #icon>
                  <NIcon>
                    <Box16Regular />
                  </NIcon>
                </template>
              </NButton>
            </template>
            Vibe CPC
          </NTooltip>
        </a>
      </div>
    </div>

    <NModal
      :show="showAboutDialog"
      preset="card"
      title="About"
      :style="{ width: aboutModalWidth, transition: 'width .15s ease-in-out' }"
      :bordered="false"
      role="dialog"
      aria-modal="true"
      @update:show="(value) => (showAboutDialog = value)"
      @close="closeAboutDialog"
    >
      <NH2 prefix="bar">CPC Online</NH2>
      <NSpace vertical :size="12">
        <NP class="about-text">An online runtime for CAIE-style pseudocode.</NP>
        <NCard size="small" class="license-content">
          <NCollapse v-model:expanded-names="aboutExpandedNames">
            <NCollapseItem title="License" name="license">
              <template #header-extra>
                <NTag type="info">AGPL</NTag>
              </template>
              <div class="about-text-content">
                Copyright (C) 2026 Anson2251 (Heyan Zhu) and its contributors.
                <br /><br />
                This program is free software: you can redistribute it and/or modify it under the
                terms of the GNU Affero General Public License as published by the Free Software
                Foundation, either version 3 of the License, or (at your option) any later version.
                <br /><br />
                This program is distributed in the hope that it will be useful, but WITHOUT ANY
                WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
                PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
                <br /><br />
                You should have received a copy of the GNU Affero General Public License along with
                this program. If not, see
                <NA href="https://www.gnu.org/licenses/">https://www.gnu.org/licenses/</NA>.
              </div>
            </NCollapseItem>
            <NCollapseItem title="Third-Party Content" name="third-party">
              <template #header-extra>
                <NTag type="warning">Notice</NTag>
              </template>
              <div class="about-text-content">
                The <strong>CPC Guide</strong> and <strong>CPC Insert</strong> documents are
                copyrighted by Cambridge University Press & Assessment. They are included here for
                educational reference only. All rights remain with the original copyright holder.
              </div>
            </NCollapseItem>
          </NCollapse>
        </NCard>
      </NSpace>
    </NModal>
  </NLayout>
</template>

<style scoped>
.ide-shell {
  height: 100vh;
  position: relative;
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

.panel-tabs {
  width: 192px;
}

.panel-body {
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

.ide-brand-dock {
  position: absolute;
  left: 12px;
  bottom: 10px;
  z-index: 10;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  padding-left: 8px;
  border-radius: 10px;
}

.ide-brand-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.about-text {
  margin: 0;
}

.about-text-content,
.about-text-content *:not(a) {
  user-select: text;
  cursor: text;
}

.ide-brand-links {
  display: inline-flex;
  gap: 6px;
  max-width: 0;
  opacity: 0;
  overflow: hidden;
  transform: translateX(-4px);
  pointer-events: none;
  transition:
    max-width 180ms ease,
    opacity 180ms ease,
    transform 180ms ease;
}

.ide-brand-dock:hover .ide-brand-links,
.ide-brand-dock:focus-within .ide-brand-links,
.ide-brand-dock:focus-visible .ide-brand-links {
  max-width: 80px;
  opacity: 1;
  transform: translateX(0);
  pointer-events: auto;
}

@media (hover: none) {
  .ide-brand-links {
    max-width: 80px;
    opacity: 1;
    transform: none;
    pointer-events: auto;
  }
}
</style>

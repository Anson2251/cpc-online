<script setup lang="ts">
import type { Component } from "vue";

import { Play24Regular, Save24Regular } from "@vicons/fluent";
import {
  NButton,
  NCard,
  NIcon,
  NLayout,
  NLayoutContent,
  NLayoutFooter,
  NLayoutSider,
  NSpace,
  NSplit,
  NTabPane,
  NTag,
  NTabs,
  useMessage,
} from "naive-ui";
import { computed, h, onMounted } from "vue";

import { useRuntimeStore } from "@/ide/stores/runtime";
import { useVfsStore } from "@/ide/stores/vfs";

import CodeEditor from "./CodeEditor.vue";
import FileExplorerTree from "./FileExplorerTree.vue";
import OutputLogPanel from "./OutputLogPanel.vue";

const vfs = useVfsStore();
const runtime = useRuntimeStore();
const message = useMessage();

const canRun = computed(() => !runtime.running);

function icon(iconComp: unknown) {
  return () => h(NIcon, null, { default: () => h(iconComp as Component) });
}

async function runProgram(): Promise<void> {
  runtime.setActiveFile(vfs.activePath);
  await runtime.runActiveFile();
  if (runtime.lastRunSuccess) {
    message.success("Execution completed");
  } else {
    message.error(runtime.lastError ?? "Execution failed");
  }
}

async function saveProgram(): Promise<void> {
  await vfs.saveActiveFile(vfs.activeContent);
  message.success("Saved");
}

async function openFile(path: string): Promise<void> {
  await vfs.openFile(path);
  runtime.setActiveFile(path);
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

  if (vfs.openedTabs.length === 1) {
    message.error("The last one!");
    return;
  }

  await vfs.closeTab(name);
  runtime.setActiveFile(vfs.activePath);
}

onMounted(async () => {
  await vfs.initialize();
  runtime.setActiveFile(vfs.activePath);
});
</script>

<template>
  <NLayout class="ide-shell">
    <NSplit direction="vertical" :default-size="0.66" :min="0.3" :max="0.88">
      <template #1>
        <NLayout has-sider style="height: 100%">
          <NLayoutSider bordered width="280" content-style="padding: 14px;">
            <FileExplorerTree @file-selected="openFile" />
          </NLayoutSider>

          <NLayoutContent content-style="padding: 0; height: 100%;">
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
                      secondary
                      :render-icon="icon(Save24Regular)"
                      @click="saveProgram"
                    >
                      Save
                    </NButton>
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
                <CodeEditor v-model="vfs.activeContent" />
              </NCard>
            </div>
          </NLayoutContent>
        </NLayout>
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
  background:
    radial-gradient(circle at 20% 8%, rgba(243, 201, 105, 0.16), transparent 34%),
    radial-gradient(circle at 84% 10%, rgba(116, 192, 252, 0.12), transparent 28%),
    linear-gradient(165deg, #0b1220 0%, #0f1928 58%, #101c2d 100%);
}

.console-panel {
  height: 100%;
  padding: 10px 14px;
}

.editor-card {
  height: 100%;
}

@media (max-width: 900px) {
  .editor-card {
    min-height: 320px;
  }
}
</style>

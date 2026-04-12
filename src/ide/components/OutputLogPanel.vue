<script setup lang="ts">
import { Delete24Regular, Warning24Regular } from "@vicons/fluent";
import {
  NButton,
  NCard,
  NEmpty,
  NIcon,
  NInput,
  NSpace,
  NTabPane,
  NTabs,
  NTag,
  NText,
  NCode,
  NVirtualList,
} from "naive-ui";
import { ref, useTemplateRef, watch } from "vue";

import { useRuntimeStore } from "@/ide/stores/runtime";

import DebugPanel from "./DebugPanel.vue";

const runtime = useRuntimeStore();
const activeTab = ref<"output" | "debug">("output");
const inputRef = useTemplateRef("consoleInput");
const outputListRef = useTemplateRef("outputList");

function scrollOutputToBottom(): void {
  setTimeout(() => {
    if (activeTab.value !== "output") {
    return;
  }

  const list = outputListRef.value as { scrollTo?: (options: { index: number }) => void } | null;
  if (!list?.scrollTo || runtime.logs.length === 0) {
    return;
  }

  list.scrollTo({ index: runtime.logs.length - 1 });
  }, 50)
}

watch(
  () => runtime.debugPaused,
  (paused) => {
    if (paused) {
      activeTab.value = "debug";
    }
  },
);

watch(
  () => runtime.awaitingInput,
  async (awaitingInput) => {
    if (!awaitingInput) {
      return;
    }
    activeTab.value = "output";
    await scrollOutputToBottom();
    inputRef.value?.focus();
  },
);

watch(
  () => runtime.logs.length,
  async (currentLength, previousLength) => {
    if (currentLength <= previousLength) {
      return;
    }
    await scrollOutputToBottom();
  },
);
</script>

<template>
  <NCard
    class="output-card"
    size="small"
    :bordered="false"
    content-style="padding: 0 12px; height: 100%; min-height: 0;"
  >
    <template #header>
      <NTabs v-model:value="activeTab" type="segment" size="small" class="panel-tabs">
        <NTabPane name="output" tab="Output" />
        <NTabPane name="debug" tab="Debug" />
      </NTabs>
    </template>

    <template #header-extra>
      <NSpace align="center">
        <NTag v-if="runtime.debugSessionActive" :type="runtime.debugPaused ? 'warning' : 'info'" size="small">
          {{ runtime.debugPaused ? "Paused" : "Debugging" }}
        </NTag>
        <NTag v-else-if="runtime.lastRunSuccess === false" type="error" size="small">
          <template #icon>
            <NIcon><Warning24Regular /></NIcon>
          </template>
          Failed
        </NTag>
        <NTag v-else-if="runtime.lastRunSuccess === true" type="success" size="small">Passed</NTag>
        <NButton tertiary size="small" @click="runtime.clearLogs">
          <template #icon>
            <Delete24Regular />
          </template>
          Clear
        </NButton>
      </NSpace>
    </template>

    <div v-if="activeTab === 'output'" class="panel-body">
      <div v-if="runtime.logs.length === 0 && !runtime.awaitingInput" class="empty-panel">
        <NEmpty description="Run your program to see output" />
      </div>

      <div v-else class="output-console">
        <div style="display: flex; flex-direction: column; height: 100%; overflow: hidden; padding-bottom: 8px;">
          <NVirtualList
            ref="outputList"
            :items="runtime.logs"
            :item-size="24"
            key-field="id"
            class="output-list"
          >
            <template #default="{ item }">
              <div class="log-row" :class="item.stream">
                <NText depth="3" class="log-time">{{ new Date(item.timestamp).toLocaleTimeString() }}</NText>
                <NCode class="log-text">{{ item.text }}</NCode>
              </div>
            </template>
          </NVirtualList>
          <div v-if="runtime.awaitingInput" class="input-row">
            <NText depth="3" class="input-label">{{ runtime.pendingInputPrompt || "INPUT" }}</NText>
            <NInput
              ref="consoleInput"
              v-model:value="runtime.pendingInputValue"
              size="small"
              placeholder="Type input and press Enter"
              @keyup.enter="runtime.submitInputPrompt"
            />
            <NButton size="small" tertiary @click="runtime.cancelInputPrompt">Cancel</NButton>
            <NButton size="small" type="primary" @click="runtime.submitInputPrompt">Submit</NButton>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="panel-body">
      <DebugPanel :snapshot="runtime.debugSnapshot" />
    </div>
  </NCard>
</template>

<style scoped>
.output-card {
  height: 100%;
}

.panel-tabs {
  width: fit-content;
  max-width: 140px;
}

.panel-tabs :deep(.n-tabs-nav) {
  width: 192px;
}

.panel-body {
  height: 100%;
}

.output-console,
.output-list,
.empty-panel {
  height: 100%;
}

.output-console {
  display: flex;
  flex-direction: column;
}

.output-list {
  flex: 1;
}

.empty-panel {
  display: grid;
  place-items: center;
}

.log-row {
  display: grid;
  grid-template-columns: 84px 1fr;
  align-items: center;
  gap: 10px;
  font-family: "JetBrains Mono", "Fira Code", "Cascadia Mono", monospace;
  font-size: 12px;
  line-height: 1.35;
  padding: 2px 8px;
  min-height: 0;
}

.log-row.stdout {
  color: #c9d6ea;
}

.log-row.stderr {
  color: #ff9b9b;
}

.log-row.stdin {
  color: #9fd3ff;
}

.log-time {
  font-size: 12px;
}

.log-text {
  white-space: pre-wrap;
  font-size: 12px;
}

.input-row {
  display: grid;
  grid-template-columns: minmax(120px, auto) 1fr auto auto;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.input-label {
  font-size: 12px;
}
</style>

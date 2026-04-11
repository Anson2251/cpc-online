<script setup lang="ts">
import { Warning24Regular } from "@vicons/fluent";
import { NButton, NCard, NEmpty, NIcon, NSpace, NTag, NText, NVirtualList } from "naive-ui";

import { useRuntimeStore } from "@/ide/stores/runtime";

const runtime = useRuntimeStore();
</script>

<template>
  <NCard
    class="output-card"
    size="small"
    title="Output"
    :bordered="false"
    content-style="padding: 0; height: 100%;"
  >
    <template #header-extra>
      <NSpace>
        <NButton tertiary size="small" @click="runtime.clearLogs">Clear</NButton>
        <NTag v-if="runtime.lastRunSuccess === false" type="error" size="small">
          <template #icon>
            <NIcon><Warning24Regular /></NIcon>
          </template>
          Failed
        </NTag>
        <NTag v-else-if="runtime.lastRunSuccess === true" type="success" size="small">
          Passed
        </NTag>
      </NSpace>
    </template>

    <NEmpty
      v-if="runtime.logs.length === 0"
      description="Run your program to see output"
      style="padding-top: 16px"
    />

    <NVirtualList v-else :items="runtime.logs" :item-size="24" key-field="id" class="output-list">
      <template #default="{ item }">
        <div class="log-row" :class="item.stream">
          <NText depth="3" class="log-time">{{
            new Date(item.timestamp).toLocaleTimeString()
          }}</NText>
          <code class="log-text">{{ item.text }}</code>
        </div>
      </template>
    </NVirtualList>
  </NCard>
</template>

<style scoped>
.output-card {
  height: 100%;
}

.output-list {
  height: 100%;
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
}

.log-row.stdout {
  color: #c9d6ea;
}

.log-row.stderr {
  color: #ff9b9b;
}

.log-time {
  font-size: 11px;
}

.log-text {
  white-space: pre-wrap;
}

@media (max-width: 900px) {
  .log-row {
    grid-template-columns: 72px 1fr;
  }
}
</style>

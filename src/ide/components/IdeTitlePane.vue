<script setup lang="ts">
import {
  ArrowNext20Filled,
  ArrowStepIn20Filled,
  ArrowStepOver20Filled,
  Bug24Regular,
  Play24Regular,
  Stop24Regular,
} from "@vicons/fluent";
import { NButton, NCard, NIcon, NSpace, NTag, NTooltip, NPerformantEllipsis } from "naive-ui";
import { computed, h } from "vue";

const props = defineProps<{
  hasTabs: boolean;
  activeFileName: string;
  activePath: string | null;
  showDebugControls: boolean;
  canDebugCommand: boolean;
  debugPaused: boolean;
  runActionActive: boolean;
  debugActionActive: boolean;
  canRun: boolean;
  awaitingInput: boolean;
  runButtonLabel: string;
  debugButtonLabel: string;
}>();

const emit = defineEmits<{
  "continue-debug": [];
  "step-into-debug": [];
  "step-over-debug": [];
  "run-program": [];
  "debug-program": [];
}>();

const showPseudoTag = computed(() => props.activePath?.toLowerCase().endsWith(".pseudo") ?? false);

function icon(iconComp: unknown) {
  return () => h(NIcon, null, { default: () => h(iconComp as object) });
}
</script>

<template>
  <NCard v-if="hasTabs" size="small" :bordered="false" content-style="padding: 8px 12px;">
    <NSpace justify="space-between" align="center">
      <NSpace>
        <NTag type="info" size="small">
          <NPerformantEllipsis style="max-width: 192px">{{ activeFileName }}</NPerformantEllipsis>
        </NTag>
        <NTag v-if="showPseudoTag" size="small" type="warning">CAIE PseudoCode</NTag>
      </NSpace>

      <NSpace>
        <NTag v-if="showDebugControls" size="small" :type="debugPaused ? 'warning' : 'info'">
          {{ debugPaused ? "Paused" : "Debugging" }}
        </NTag>
        <NTooltip v-if="showDebugControls">
          <template #trigger>
            <NButton
              circle
              quaternary
              size="small"
              :disabled="!canDebugCommand"
              :render-icon="icon(ArrowNext20Filled)"
              @click="emit('continue-debug')"
            />
          </template>
          Continue
        </NTooltip>
        <NTooltip v-if="showDebugControls">
          <template #trigger>
            <NButton
              circle
              quaternary
              size="small"
              :disabled="!canDebugCommand"
              :render-icon="icon(ArrowStepIn20Filled)"
              @click="emit('step-into-debug')"
            />
          </template>
          Step Into
        </NTooltip>
        <NTooltip v-if="showDebugControls">
          <template #trigger>
            <NButton
              circle
              quaternary
              size="small"
              :disabled="!canDebugCommand"
              :render-icon="icon(ArrowStepOver20Filled)"
              @click="emit('step-over-debug')"
            />
          </template>
          Step Over
        </NTooltip>
        <NButton
          size="small"
          :type="runActionActive ? 'error' : 'primary'"
          :disabled="!runActionActive && (!canRun || awaitingInput)"
          :render-icon="icon(runActionActive ? Stop24Regular : Play24Regular)"
          @click="emit('run-program')"
        >
          {{ runButtonLabel }}
        </NButton>
        <NButton
          size="small"
          :type="debugActionActive ? 'error' : undefined"
          :secondary="!debugActionActive"
          :disabled="!debugActionActive && (!canRun || awaitingInput)"
          :render-icon="icon(debugActionActive ? Stop24Regular : Bug24Regular)"
          @click="emit('debug-program')"
        >
          {{ debugButtonLabel }}
        </NButton>
      </NSpace>
    </NSpace>
  </NCard>
</template>

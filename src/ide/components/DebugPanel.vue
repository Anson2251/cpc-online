<script setup lang="ts">
import {
  NCollapse,
  NCollapseItem,
  NDataTable,
  NEmpty,
  NTabPane,
  NTable,
  NTabs,
  NTree,
  NButton,
  type DataTableColumns,
  type TreeOption,
} from "naive-ui";
import { computed, h, ref } from "vue";

import type {
  ArrayTypeInfo,
  ArrayBoundValue,
  DebugFrame,
  DebugScope,
  DebugSnapshot,
  DebugVariable,
  EnumTypeInfo,
  SetTypeInfo,
  TypeInfo,
  UserDefinedTypeInfo,
} from "@/libs/cpc-core/src/browser-index";

const props = defineProps<{
  snapshot: DebugSnapshot | null;
}>();

type VariableRow = {
  key: string;
  name: string;
  typeLabel: string;
  variable: DebugVariable;
};

type DisplayScope = {
  key: string;
  title: string;
  scope: DebugScope;
};

type StackFrameRow = {
  depth: number;
  key: string;
  frame: DebugFrame;
  scopeKey: string;
};

function isPrimitiveType(typeInfo: TypeInfo): boolean {
  return typeof typeInfo === "string";
}

function isArrayType(typeInfo: TypeInfo): typeInfo is ArrayTypeInfo {
  return typeof typeInfo === "object" && "bounds" in typeInfo && "elementType" in typeInfo;
}

function isRecordType(typeInfo: TypeInfo): typeInfo is UserDefinedTypeInfo {
  return typeof typeInfo === "object" && "fields" in typeInfo;
}

function isEnumType(typeInfo: TypeInfo): typeInfo is EnumTypeInfo {
  return typeof typeInfo === "object" && "kind" in typeInfo && typeInfo.kind === "ENUM";
}

function isSetType(typeInfo: TypeInfo): typeInfo is SetTypeInfo {
  return typeof typeInfo === "object" && "kind" in typeInfo && typeInfo.kind === "SET";
}

function formatPrimitive(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  return String(value);
}

function formatType(typeInfo: TypeInfo): string {
  if (typeof typeInfo === "string") {
    return typeInfo;
  }
  if (isArrayType(typeInfo)) {
    const bounds = typeInfo.bounds.map((bound: ArrayTypeInfo["bounds"][number]) => `${bound.lower}:${bound.upper}`).join(", ");
    return `ARRAY[${bounds}] OF ${formatType(typeInfo.elementType)}`;
  }
  if (isRecordType(typeInfo)) {
    return typeInfo.name;
  }
  if (isEnumType(typeInfo)) {
    return `${typeInfo.name} (ENUM)`;
  }
  return `${typeInfo.name} (SET OF ${formatType(typeInfo.elementType)})`;
}

function createRecordTree(value: unknown): TreeOption[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value).map(([key, entryValue]) => ({
    key,
    label:
      typeof entryValue === "object" && entryValue !== null && !Array.isArray(entryValue)
        ? key
        : `${key}: ${formatPrimitive(entryValue)}`,
    children:
      typeof entryValue === "object" && entryValue !== null && !Array.isArray(entryValue)
        ? createRecordTree(entryValue)
        : undefined,
  }));
}

function createBoundedArrayRows(
  typeInfo: ArrayTypeInfo,
  value: unknown,
  dimensionIndex = 0,
  indices: number[] = [],
): Array<{ key: string; slot: string; value: string }> {
  const bound = typeInfo.bounds[dimensionIndex];
  if (!bound) {
    return [];
  }

  const lower = numericBoundValue(bound.lower);
  const upper = numericBoundValue(bound.upper);
  if (lower === null || upper === null) {
    return [];
  }

  const rows: Array<{ key: string; slot: string; value: string }> = [];
  const arrayValue = Array.isArray(value) ? value : [];

  for (let current = lower; current <= upper; current += 1) {
    const valueIndex = current - lower;
    const nextIndices = [...indices, current];
    const slot = nextIndices.map((index) => `[${index}]`).join("");
    const entryValue = arrayValue[valueIndex];

    if (dimensionIndex < typeInfo.bounds.length - 1) {
      rows.push(...createBoundedArrayRows(typeInfo, entryValue, dimensionIndex + 1, nextIndices));
      continue;
    }

    rows.push({
      key: `${slot}`,
      slot,
      value: formatPrimitive(entryValue),
    });
  }

  return rows;
}

function numericBoundValue(value: ArrayBoundValue): number | null {
  return typeof value === "number" ? value : null;
}

function formatSetValue(value: unknown): string {
  if (!Array.isArray(value)) {
    return "{}";
  }
  return `{ ${value.map((entry) => formatPrimitive(entry)).join(", ")} }`;
}

const callStack = computed<DebugFrame[]>(() => props.snapshot?.callStack ?? []);
const scopes = computed<DebugScope[]>(() => props.snapshot?.scopes ?? []);
const activeTab = ref<"stack" | "variables">("variables");
const expandedScopeNames = ref<string[]>([]);

const displayScopes = computed<DisplayScope[]>(() => {
  const frames = callStack.value;
  return scopes.value.map((scope, index) => {
    const frame = frames[frames.length - 1 - index];
    let title = scope.scopeName;

    if (frame) {
      title = index === 0 ? `${frame.routineName} (current)` : `${frame.routineName} (caller ${index})`;
    } else if (scope.scopeName === "global") {
      title = "Global";
    }

    return {
      key: `scope-${index}`,
      title,
      scope,
    };
  });
});

const stackFrames = computed<StackFrameRow[]>(() => {
  const frames = callStack.value
    .map((frame, index) => ({
      key: `${frame.routineName}-${index}`,
      frame,
      scopeKey: `scope-${callStack.value.length - 1 - index}`,
    }))
    .reverse();

  return frames.map((frame, index) => ({
    ...frame,
    depth: index + 1,
  }));
});

const variableColumns: DataTableColumns<VariableRow> = [
  {
    title: "Name",
    key: "name",
    width: 120,
  },
  {
    title: "Type",
    key: "typeLabel",
    width: 170,
  },
  {
    title: "Value",
    key: "value",
    render: (row) => {
      const { variable } = row;
      if (isPrimitiveType(variable.typeInfo)) {
        return h("code", formatPrimitive(variable.value));
      }

      if (isSetType(variable.typeInfo)) {
        return h("code", formatSetValue(variable.value));
      }

      if (isEnumType(variable.typeInfo)) {
        return h("code", formatPrimitive(variable.value));
      }

      if (isArrayType(variable.typeInfo)) {
        const arrayType = variable.typeInfo;
        const rows = createBoundedArrayRows(arrayType, variable.value).map((entry) => ({
          ...entry,
          slot: `${variable.name}${entry.slot}`,
        }));
        return h(
          NCollapse,
          { class: "value-collapse", displayDirective: "show" },
          {
            default: () =>
              h(
                NCollapseItem,
                { title: `ARRAY (${rows.length} slots)`, name: "details" },
                {
                  default: () =>
                    h(
                      NTable,
                      { size: "small", bordered: false, singleLine: false },
                      {
                        default: () => [
                          h("thead", [h("tr", [h("th", "Slot"), h("th", "Value")])]),
                          h(
                            "tbody",
                            rows.length > 0
                              ? rows.map((entry) =>
                                  h("tr", { key: entry.key }, [h("td", entry.slot), h("td", [h("code", entry.value)])]),
                                )
                              : [h("tr", [h("td", { colspan: 2 }, "No slots")])],
                          ),
                        ],
                      },
                    ),
                },
              ),
          },
        );
      }

      if (isRecordType(variable.typeInfo)) {
        const nodes = createRecordTree(variable.value);
        return h(
          NCollapse,
          { class: "value-collapse", displayDirective: "show" },
          {
            default: () =>
              h(
                NCollapseItem,
                { title: `RECORD (${nodes.length} fields)`, name: "details" },
                {
                  default: () =>
                    h(NTree, {
                      blockLine: true,
                      data: nodes,
                      expandOnClick: true,
                      defaultExpandedKeys: nodes.map((node) => node.key as string),
                    }),
                },
              ),
          },
        );
      }

      return h("code", formatPrimitive(variable.value));
    },
  },
];

function rowsForScope(scope: DisplayScope): VariableRow[] {
  return scope.scope.variables.map((variable) => ({
    key: `${scope.key}-${variable.name}`,
    name: variable.name,
    typeLabel: formatType(variable.typeInfo),
    variable,
  }));
}

function focusScope(scopeKey: string): void {
  activeTab.value = "variables";
  expandedScopeNames.value = [scopeKey];
}
</script>

<template>
  <div v-if="!snapshot" class="empty-panel">
    <NEmpty description="Start a debug session to inspect variables and call stack" />
  </div>

  <div v-else class="debug-panel">
    <div class="location-bar">
      <strong>{{ snapshot.reason.toLocaleUpperCase() }}</strong>
      <span class="location-separator">|</span>
      <code>Line {{ snapshot.location.line ?? "-" }}, Col {{ snapshot.location.column ?? "-" }}</code>
    </div>

    <NTabs v-model:value="activeTab" type="line" placement="left" size="small" class="debug-tabs">
      <NTabPane name="stack" tab="Call Stack">
        <div v-if="callStack.length === 0" class="debug-empty">No stack frames</div>
        <NTable v-else size="small" :bordered="false" :single-line="false" class="stack-table">
          <thead>
            <tr>
              <th>Depth</th>
              <th>Routine</th>
              <th>Loc</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="stackFrame in stackFrames"
              :key="stackFrame.key"
              class="stack-row"
            >
              <td><code>{{ stackFrame.depth }}</code></td>
              <td>
                {{ stackFrame.frame.routineName }}
                <n-button @click="focusScope(stackFrame.scopeKey)" tertiary type="info" size="tiny" style="float: right;">Variables</n-button>
              </td>
              <td><code>{{ stackFrame.frame.line ?? "-" }}:{{ stackFrame.frame.column ?? "-" }}</code></td>
            </tr>
          </tbody>
        </NTable>
      </NTabPane>

      <NTabPane name="variables" tab="Variables" style="overflow: auto;">
        <NCollapse v-model:expanded-names="expandedScopeNames" display-directive="show">
          <NCollapseItem v-for="scope in displayScopes" :key="scope.key" :title="scope.title" :name="scope.key">
            <div v-if="scope.scope.variables.length === 0" class="debug-empty">No variables</div>
            <NDataTable
              v-else
              :size="('tiny' as any)"
              :columns="variableColumns"
              :data="rowsForScope(scope)"
              :bordered="false"
              :single-line="false"
            />
          </NCollapseItem>
        </NCollapse>
      </NTabPane>
    </NTabs>
  </div>
</template>

<style scoped>
.debug-panel,
.empty-panel {
  height: calc(100% - 16px);
}

.empty-panel {
  display: grid;
  place-items: center;
}

.debug-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
}

.location-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.82);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
}

.location-separator {
  color: rgba(255, 255, 255, 0.38);
}

.debug-tabs {
  flex: 1;
  min-height: 0;
}

.debug-tabs :deep(.n-tabs-pane-wrapper) {
  overflow: auto;
}

.debug-tabs :deep(.n-tab-pane) {
  padding-top: 2px;
}

.debug-tabs :deep(.n-tabs-tab) {
  padding-top: 4px;
  padding-bottom: 4px;
}

.value-collapse :deep(.n-collapse-item__header) {
  min-height: 22px;
  padding-top: 0;
  padding-bottom: 2px;
}

.value-collapse :deep(.n-collapse-item__content-wrapper) {
  margin-top: 2px;
}

.stack-table :deep(th),
.stack-table :deep(td) {
  padding-top: 4px;
  padding-bottom: 4px;
}

.stack-row:hover {
  background: rgba(255, 255, 255, 0.04);
}

.debug-empty {
  color: rgba(255, 255, 255, 0.72);
  font-size: 12px;
}
</style>

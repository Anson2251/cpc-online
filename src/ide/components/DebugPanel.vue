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
  NCard,
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
  PointerTypeInfo,
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

function isPointerType(typeInfo: TypeInfo): typeInfo is PointerTypeInfo {
  return typeof typeInfo === "object" && "kind" in typeInfo && typeInfo.kind === "POINTER";
}

interface PointerDisplayValue {
  address: number;
  dereferenced: unknown;
}

function isPointerDisplayValue(value: unknown): value is PointerDisplayValue {
  return (
    typeof value === "object" && value !== null && "address" in value && "dereferenced" in value
  );
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
    const bounds = typeInfo.bounds
      .map((bound: ArrayTypeInfo["bounds"][number]) => `${bound.lower}:${bound.upper}`)
      .join(", ");
    return `ARRAY[${bounds}] OF ${formatType(typeInfo.elementType)}`;
  }
  if (isRecordType(typeInfo)) {
    return typeInfo.name;
  }
  if (isEnumType(typeInfo)) {
    return `${typeInfo.name} (ENUM)`;
  }
  if (isSetType(typeInfo)) {
    const setInfo = typeInfo as SetTypeInfo;
    return `${setInfo.name} (SET OF ${formatType(setInfo.elementType)})`;
  }
  if (typeof typeInfo === "object" && "kind" in typeInfo && typeInfo.kind === "POINTER") {
    const ptrInfo = typeInfo as PointerTypeInfo;
    return `${ptrInfo.name} (^${formatType(ptrInfo.pointedType)})`;
  }
  if (typeof typeInfo === "object" && "kind" in typeInfo && typeInfo.kind === "INFERRED") {
    return "INFERRED";
  }
  return String(typeInfo);
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
): Array<{ key: string; slot: string; rawValue: unknown; elementType: TypeInfo }> {
  const bound = typeInfo.bounds[dimensionIndex];
  if (!bound) {
    return [];
  }

  const lower = numericBoundValue(bound.lower);
  const upper = numericBoundValue(bound.upper);
  if (lower === null || upper === null) {
    return [];
  }

  const rows: Array<{ key: string; slot: string; rawValue: unknown; elementType: TypeInfo }> = [];
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
      rawValue: entryValue,
      elementType: typeInfo.elementType,
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

function renderValue(value: unknown, typeInfo: TypeInfo) {
  if (isPrimitiveType(typeInfo)) {
    return h("code", formatPrimitive(value));
  }
  if (isSetType(typeInfo)) {
    return h("code", formatSetValue(value));
  }
  if (isEnumType(typeInfo)) {
    return h("code", formatPrimitive(value));
  }
  if (isArrayType(typeInfo)) {
    const rows = createBoundedArrayRows(typeInfo, value);
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
                              h("tr", { key: entry.key }, [
                                h("td", entry.slot),
                                h("td", [renderValue(entry.rawValue, entry.elementType)]),
                              ]),
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
  if (isRecordType(typeInfo)) {
    const nodes = createRecordTree(value);
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
  if (isPointerType(typeInfo)) {
    if (value === 0 || value === null || value === undefined) {
      return h("code", "NULL");
    }
    if (isPointerDisplayValue(value)) {
      const ptrType = typeInfo as PointerTypeInfo;
      return h(
        NCollapse,
        { class: "value-collapse", displayDirective: "show" },
        {
          default: () =>
            h(
              NCollapseItem,
              { title: `PTR @0x${value.address.toString(16).toUpperCase()}`, name: "ptr-details" },
              {
                default: () => renderValue(value.dereferenced, ptrType.pointedType),
              },
            ),
        },
      );
    }
    return h("code", `@0x${Number(value).toString(16).toUpperCase()}`);
  }
  return h("code", formatPrimitive(value));
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
      title =
        index === 0 ? `${frame.routineName} (current)` : `${frame.routineName} (caller ${index})`;
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
  const total = callStack.value.length;
  return callStack.value.map((frame, index) => ({
    key: `${frame.routineName}-${index}`,
    frame,
    scopeKey: `scope-${total - 1 - index}`,
    depth: total - 1 - index,
  }));
});

const variableColumns: DataTableColumns<VariableRow> = [
  {
    title: "Name",
    key: "name",
    width: 120,
    render: (raw) => h("code", raw.name),
  },
  {
    title: "Type",
    key: "typeLabel",
    width: 170,
    render: (raw) => h("code", raw.typeLabel),
  },
  {
    title: "Value",
    key: "value",
    width: 320,
    render: (row) => renderValue(row.variable.value, row.variable.typeInfo),
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
    <NCard size="small" bordered content-style="padding: 4px 12px;" :class="{ 'error-card': snapshot.error }">
      <strong>{{ snapshot.error ? "ERROR: " + snapshot.error.message : snapshot.reason.toLocaleUpperCase() }}</strong>
      <span class="location-separator">|</span>
      <code
        >Line {{ (snapshot.error?.line ?? snapshot.location.line) ?? "-" }}, Col {{ (snapshot.error?.column ?? snapshot.location.column) ?? "-" }}</code
      >
    </NCard>

    <NTabs v-model:value="activeTab" type="line" placement="left" size="small" class="debug-tabs">
      <NTabPane name="stack" tab="Call Stack" style="overflow-y: auto;">
        <div v-if="callStack.length === 0" class="debug-empty"><span>No stack frames</span></div>
        <NTable v-else size="small" :bordered="false" :single-line="false" class="stack-table">
          <thead>
            <tr>
              <th>Depth</th>
              <th>Routine</th>
              <th>Loc</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="stackFrame in stackFrames" :key="stackFrame.key" class="stack-row">
              <td>
                <code>{{ stackFrame.depth }}</code>
              </td>
              <td>
                {{ stackFrame.frame.routineName }}
                <n-button
                  @click="focusScope(stackFrame.scopeKey)"
                  tertiary
                  type="info"
                  size="tiny"
                  style="float: right"
                  >Variables</n-button
                >
              </td>
              <td>
                <code>{{ stackFrame.frame.line ?? "-" }}:{{ stackFrame.frame.column ?? "-" }}</code>
              </td>
            </tr>
          </tbody>
        </NTable>
      </NTabPane>

      <NTabPane name="variables" tab="Variables" style="overflow: auto">
        <NCollapse
          v-model:expanded-names="expandedScopeNames"
          display-directive="show"
          style="padding-top: 8px"
        >
          <NCollapseItem
            v-for="scope in displayScopes"
            :key="scope.key"
            :title="scope.title"
            :name="scope.key"
          >
            <div v-if="scope.scope.variables.length === 0" class="debug-empty">No variables</div>
            <NDataTable
              v-else
              :size="'tiny' as any"
              :columns="variableColumns"
              :data="rowsForScope(scope)"
              :bordered="false"
              :single-line="false"
              class="variable-table"
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
  height: calc(100% - 8px);
}

.empty-panel {
  display: grid;
  place-items: center;
}

.debug-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.error-card {
  background: rgba(255, 60, 60, 0.08);
  border-color: rgba(255, 60, 60, 0.3);
}

.location-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
}

.location-separator {
  opacity: 0.6;
  padding: 0 8px;
}

.debug-tabs {
  flex: 1;
  min-height: 0;
}

.debug-tabs :deep(.n-tabs-pane-wrapper) {
  overflow: auto;
}

.debug-tabs :deep(.n-tabs-tab) {
  padding-top: 4px;
  padding-bottom: 4px;
}

.value-collapse :deep(.n-collapse-item__header) {
  min-height: 22px;
  padding-bottom: 2px;
}

.value-collapse :deep(.n-collapse-item__content-wrapper) {
  margin-top: 2px;
}

.stack-table :deep(th),
.stack-table :deep(td) {
  padding: 2px 6px;
  user-select: text;
  cursor: text;
}

.variable-table :deep(th),
.variable-table :deep(td) {
  padding: 2px 6px;
  user-select: text;
  cursor: text;
}

.variable-table :deep(.n-collapse-item) {
  margin: 0;
}

.stack-row:hover {
  background: rgba(255, 255, 255, 0.04);
}

.debug-empty {
  opacity: 0.8;
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
}
</style>

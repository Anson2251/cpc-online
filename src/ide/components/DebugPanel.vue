<script setup lang="ts">
import {
  NCollapse,
  NCollapseItem,
  NDataTable,
  NEmpty,
  NRadio,
  NRadioGroup,
  NTable,
  NThing,
  NTree,
  type DataTableColumns,
  type TreeOption,
} from "naive-ui";
import { computed, h } from "vue";

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

const variableColumns: DataTableColumns<VariableRow> = [
  {
    title: "Name",
    key: "name",
    width: 180,
  },
  {
    title: "Type",
    key: "typeLabel",
    width: 220,
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
        const enumType = variable.typeInfo;
        return h(
          NRadioGroup,
          { value: typeof variable.value === "string" ? variable.value : null },
          {
            default: () =>
              enumType.values.map((option: string) =>
                h(NRadio, { key: option, value: option, disabled: true }, { default: () => option }),
              ),
          },
        );
      }

      if (isArrayType(variable.typeInfo)) {
        const arrayType = variable.typeInfo;
        const rows = createBoundedArrayRows(arrayType, variable.value).map((entry) => ({
          ...entry,
          slot: `${variable.name}${entry.slot}`,
        }));
        return h(
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
        );
      }

      if (isRecordType(variable.typeInfo)) {
        const nodes = createRecordTree(variable.value);
        return h(NTree, {
          blockLine: true,
          data: nodes,
          expandOnClick: true,
          defaultExpandedKeys: nodes.map((node) => node.key as string),
        });
      }

      return h("code", formatPrimitive(variable.value));
    },
  },
];

function rowsForScope(scope: DebugScope): VariableRow[] {
  return scope.variables.map((variable) => ({
    key: `${scope.scopeName}-${variable.name}`,
    name: variable.name,
    typeLabel: formatType(variable.typeInfo),
    variable,
  }));
}
</script>

<template>
  <div v-if="!snapshot" class="empty-panel">
    <NEmpty description="Start a debug session to inspect variables and call stack" />
  </div>

  <div v-else class="debug-panel">
    <NThing title="Location" class="debug-section">
      <div class="debug-meta">
        Line {{ snapshot.location.line ?? "-" }}, Column {{ snapshot.location.column ?? "-" }}
      </div>
      <div class="debug-meta">Reason: {{ snapshot.reason }}</div>
    </NThing>

    <NThing title="Call Stack" class="debug-section">
      <div v-if="callStack.length === 0" class="debug-empty">No stack frames</div>
      <div v-for="(frame, index) in callStack" :key="`${frame.routineName}-${index}`" class="debug-row">
        <strong>{{ frame.routineName }}</strong>
        <span>line {{ frame.line ?? "-" }}, col {{ frame.column ?? "-" }}</span>
      </div>
    </NThing>

    <NThing title="Variables" class="debug-section">
      <NCollapse>
        <NCollapseItem v-for="scope in scopes" :key="scope.scopeName" :title="scope.scopeName" :name="scope.scopeName">
          <div v-if="scope.variables.length === 0" class="debug-empty">No variables</div>
          <NDataTable
            v-else
            size="small"
            :columns="variableColumns"
            :data="rowsForScope(scope)"
            :bordered="false"
            :single-line="false"
          />
        </NCollapseItem>
      </NCollapse>
    </NThing>
  </div>
</template>

<style scoped>
.debug-panel,
.empty-panel {
  height: calc(100% - 32px);
}

.empty-panel {
  display: grid;
  place-items: center;
}

.debug-panel {
  overflow: auto;
  padding: 12px;
}

.debug-section + .debug-section {
  margin-top: 16px;
}

.debug-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.debug-meta,
.debug-empty {
  color: rgba(255, 255, 255, 0.72);
}
</style>

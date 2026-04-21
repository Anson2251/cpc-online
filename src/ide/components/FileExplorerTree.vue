<script setup lang="ts">
import type { Component, VNodeChild } from "vue";

import {
  Add24Regular,
  Archive24Regular,
  Delete24Regular,
  Document16Filled,
  Folder16Filled,
  Folder24Regular,
  Rename24Regular,
  ArrowDownload24Filled,
} from "@vicons/fluent";
import {
  NDropdown,
  NIcon,
  NTree,
  NPerformantEllipsis,
  NModal,
  NInput,
  NButton,
  NSpace,
  type DropdownOption,
  type TreeOption,
} from "naive-ui";
import { computed, h, onMounted, ref, nextTick } from "vue";

import { useVfsStore } from "@/ide/stores/vfs";
import { exportDirectoryToZip, triggerBrowserDownload } from "@/ide/utils/export-zip";
import { indexedDbVfs } from "@/ide/vfs/indexed-db-vfs";

const emit = defineEmits<{
  fileSelected: [path: string];
}>();

const vfs = useVfsStore();
const expandedKeys = ref<string[]>([]);

const surfaceMenuVisible = ref(false);
const surfaceMenuX = ref(0);
const surfaceMenuY = ref(0);

const itemMenuVisible = ref(false);
const itemMenuX = ref(0);
const itemMenuY = ref(0);
const itemTargetPath = ref("/");
const itemTargetKind = ref<"file" | "directory">("file");

const modalVisible = ref(false);
const modalType = ref<"new-file" | "new-folder" | "rename" | "delete">("new-file");
const modalInputValue = ref("");
const modalTitle = ref("");
const modalMessage = ref("");
const modalTargetDirectory = ref("/");
const modalResolve = ref<((value: string | boolean) => void) | null>(null);
const inputRef = ref();
const modalError = ref("");

const selectedKeys = computed(() => (vfs.activePath ? [vfs.activePath] : []));

const childCountByPath = computed(() => {
  const counts = new Map<string, number>();
  for (const node of vfs.nodes) {
    if (!node.parentPath) {
      continue;
    }
    counts.set(node.parentPath, (counts.get(node.parentPath) ?? 0) + 1);
  }
  return counts;
});

function isEmptyDirectory(path: string): boolean {
  return (childCountByPath.value.get(path) ?? 0) === 0;
}

const isItemDirectoryEmpty = computed(() => {
  if (itemTargetKind.value !== "directory") {
    return false;
  }

  const directoryPath = itemTargetPath.value;
  if (directoryPath === "/") {
    return !vfs.nodes.some((node) => node.path !== "/");
  }

  const prefix = `${directoryPath}/`;
  return !vfs.nodes.some((node) => node.path.startsWith(prefix));
});

const isWorkspaceEmpty = computed(() => !vfs.nodes.some((node) => node.path !== "/"));

const baseCreateMenuOptions: DropdownOption[] = [
  { label: "New File", key: "new-file", icon: icon(Add24Regular) },
  { label: "New Folder", key: "new-folder", icon: icon(Folder24Regular) },
];

const surfaceMenuOptions = computed<DropdownOption[]>(() => [
  ...baseCreateMenuOptions,
  { type: "divider", key: "surface-divider-export" },
  {
    label: "Export Workspace Archive",
    key: "export-workspace-archive",
    icon: icon(Archive24Regular),
    disabled: isWorkspaceEmpty.value,
  },
]);

const itemMenuOptions = computed<DropdownOption[]>(() => {
  if (itemTargetPath.value === "/") {
    return [];
  }

  const options: DropdownOption[] = [];

  if (itemTargetKind.value === "directory") {
    options.push(...baseCreateMenuOptions);
    options.push({ type: "divider", key: "dir-divider-ops" });
    options.push({
      label: "Export Archive",
      key: "export-archive",
      icon: icon(Archive24Regular),
      disabled: isItemDirectoryEmpty.value,
    });
  } else {
    options.push({
      label: "Download File",
      key: "download-file",
      icon: icon(ArrowDownload24Filled),
    });
  }

  options.push({ type: "divider", key: "item-divider-edit" });
  options.push({ label: "Rename", key: "rename", icon: icon(Rename24Regular) });
  options.push({ label: "Delete", key: "delete", icon: icon(Delete24Regular) });

  return options;
});

const treeData = computed<TreeOption[]>(() => {
  const byPath = new Map<string, TreeOption>();
  const childrenMap = new Map<string, TreeOption[]>();

  for (const node of vfs.nodes) {
    const isEmptyDir = node.kind === "directory" && isEmptyDirectory(node.path);
    byPath.set(node.path, {
      key: node.path,
      label: node.name,
      isLeaf: node.kind === "file" || isEmptyDir,
      children: isEmptyDir ? [] : undefined,
      rawNode: node,
    });
  }

  for (const node of vfs.nodes) {
    if (!node.parentPath) {
      continue;
    }

    const parentChildren = childrenMap.get(node.parentPath) ?? [];
    const current = byPath.get(node.path);
    if (current) {
      parentChildren.push(current);
      childrenMap.set(node.parentPath, parentChildren);
    }
  }

  for (const [path, option] of byPath.entries()) {
    const children = childrenMap.get(path);
    if (!children) {
      continue;
    }

    children.sort((a, b) => {
      const nodeA = (a as { rawNode?: { kind?: string; name?: string } }).rawNode;
      const nodeB = (b as { rawNode?: { kind?: string; name?: string } }).rawNode;
      if (nodeA?.kind !== nodeB?.kind) {
        return nodeA?.kind === "directory" ? -1 : 1;
      }
      return (nodeA?.name ?? "").localeCompare(nodeB?.name ?? "");
    });

    option.children = children;
  }

  const rootChildren = childrenMap.get("/") ?? [];
  return rootChildren;
});

function expandDirectoryPath(path: string): void {
  const chunks = path.split("/").filter(Boolean);
  if (!chunks.length) {
    return;
  }

  const nextKeys = new Set(expandedKeys.value);
  let currentPath = "";
  for (const chunk of chunks) {
    currentPath = `${currentPath}/${chunk}`;
    nextKeys.add(currentPath);
  }

  expandedKeys.value = Array.from(nextKeys);
}

function icon(iconComp: unknown) {
  return () => h(NIcon, null, { default: () => h(iconComp as Component) });
}

function renderTreePrefix({ option }: { option: TreeOption }): VNodeChild {
  const rawNode = (option as { rawNode?: { kind?: string } }).rawNode;
  const iconComp = rawNode?.kind === "directory" ? Folder16Filled : Document16Filled;
  return h(NIcon, { style: "opacity: 0.8" }, { default: () => h(iconComp) });
}

function renderTreeLabel({ option }: { option: TreeOption }): VNodeChild {
  const label = String(option.label ?? "");
  return h(
    NPerformantEllipsis,
    {
      style: "display: block;",
    },
    { default: () => label },
  );
}

async function handleTreeSelect(keys: Array<string | number>): Promise<void> {
  const next = keys[0];
  if (typeof next !== "string") {
    return;
  }

  const node = vfs.nodes.find((entry) => entry.path === next);
  if (!node) {
    return;
  }

  if (node.kind === "directory") {
    if (isEmptyDirectory(node.path)) {
      return;
    }
    await vfs.refreshDirectory(node.path);
    return;
  }

  await vfs.openFile(node.path);
  emit("fileSelected", node.path);
}

function hideMenus(): void {
  surfaceMenuVisible.value = false;
  itemMenuVisible.value = false;
}

function showModal(
  type: "new-file" | "new-folder" | "rename" | "delete",
  title: string,
  message: string,
  defaultValue = "",
): Promise<string | boolean> {
  modalType.value = type;
  modalTitle.value = title;
  modalMessage.value = message;
  modalInputValue.value = defaultValue;
  modalVisible.value = true;
  modalError.value = "";

  nextTick(() => {
    if (inputRef.value && type !== "delete") {
      inputRef.value.focus();
      if (defaultValue) {
        inputRef.value.select();
      }
    }
  });

  return new Promise((resolve) => {
    modalResolve.value = resolve;
  });
}

const INVALID_CHARS_REGEX = /[<>:"|?*\\/]/;

function hasControlChars(name: string): boolean {
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    if (code < 32) {
      return true;
    }
  }
  return false;
}

function validateFileName(name: string): string | null {
  if (!name || !name.trim()) {
    return "File name cannot be empty";
  }

  if (INVALID_CHARS_REGEX.test(name) || hasControlChars(name)) {
    return "File name contains invalid characters. Cannot include: < > : \" | ? * \\ / or control characters";
  }

  if (name.startsWith(".") || name.endsWith(".")) {
    return "File name cannot start or end with a dot";
  }

  if (name.length > 255) {
    return "File name is too long (max 255 characters)";
  }

  return null;
}

function handleModalConfirm(): void {
  if (modalType.value === "delete") {
    modalResolve.value?.(true);
    modalVisible.value = false;
    return;
  }

  const name = modalInputValue.value.trim();
  const validationError = validateFileName(name);
  if (validationError) {
    modalError.value = validationError;
    return;
  }

  modalResolve.value?.(name);
  modalVisible.value = false;
}

function handleModalCancel(): void {
  modalResolve.value?.(modalType.value === "delete" ? false : "");
  modalVisible.value = false;
}

function handleTreeContextMenu(event: MouseEvent, option: TreeOption): void {
  event.stopPropagation();
  event.preventDefault();
  const rawNode = (option as { rawNode?: { path: string; kind: "file" | "directory" } }).rawNode;
  if (!rawNode) {
    return;
  }

  hideMenus();
  itemTargetPath.value = rawNode.path;
  itemTargetKind.value = rawNode.kind;
  itemMenuX.value = event.clientX;
  itemMenuY.value = event.clientY;
  itemMenuVisible.value = true;
}

function treeNodeProps({ option }: { option: TreeOption }) {
  const rawNode = (option as { rawNode?: { path: string; kind: "file" | "directory" } }).rawNode;
  const isEmptyDir = Boolean(
    rawNode && rawNode.kind === "directory" && isEmptyDirectory(rawNode.path),
  );

  return {
    class: isEmptyDir ? "tree-node-empty-dir" : undefined,
    onContextmenu: (event: MouseEvent) => handleTreeContextMenu(event, option),
  };
}

function setExpanded(next: Array<string | number>): void {
  expandedKeys.value = next.filter((item): item is string => typeof item === "string");
}

function surfaceWorkingDirectory(): string {
  if (vfs.currentDirectory) {
    return vfs.currentDirectory;
  }
  return "/";
}

function itemWorkingDirectory(): string {
  if (itemTargetKind.value === "directory") {
    return itemTargetPath.value;
  }

  const node = vfs.nodes.find((entry) => entry.path === itemTargetPath.value);
  if (node?.parentPath) {
    return node.parentPath;
  }

  return "/";
}

function handleSurfaceContextMenu(event: MouseEvent): void {
  event.preventDefault();
  hideMenus();
  surfaceMenuX.value = event.clientX;
  surfaceMenuY.value = event.clientY;
  surfaceMenuVisible.value = true;
}

async function handleSurfaceAction(key: string | number): Promise<void> {
  const targetDirectory = surfaceWorkingDirectory();
  hideMenus();

  if (key === "new-file") {
    const name = await showModal(
      "new-file",
      "New File",
      "Enter file name:",
      "new-file.pseudo",
    );
    if (!name) {
      return;
    }
    try {
      await vfs.createFile(name as string, targetDirectory);
      expandDirectoryPath(targetDirectory);
      emit("fileSelected", vfs.activePath);
    } catch (error) {
      modalError.value = error instanceof Error ? error.message : "Failed to create file";
      modalVisible.value = true;
    }
    return;
  }

  if (key === "new-folder") {
    const name = await showModal(
      "new-folder",
      "New Folder",
      "Enter folder name:",
      "folder",
    );
    if (!name) {
      return;
    }
    try {
      await vfs.createDirectory(name as string, targetDirectory);
    } catch (error) {
      modalError.value = error instanceof Error ? error.message : "Failed to create folder";
      modalVisible.value = true;
    }
    return;
  }

  if (key === "export-workspace-archive") {
    const blob = await exportDirectoryToZip(indexedDbVfs, "/");
    triggerBrowserDownload(blob, "workspace.zip");
  }
}

async function handleItemAction(key: string | number): Promise<void> {
  const targetDirectory = itemWorkingDirectory();
  hideMenus();

  if (key === "new-file") {
    const name = await showModal(
      "new-file",
      "New File",
      "Enter file name:",
      "new-file.pseudo",
    );
    if (!name) {
      return;
    }
    try {
      await vfs.createFile(name as string, targetDirectory);
      expandDirectoryPath(targetDirectory);
      emit("fileSelected", vfs.activePath);
    } catch (error) {
      modalError.value = error instanceof Error ? error.message : "Failed to create file";
      modalVisible.value = true;
    }
    return;
  }

  if (key === "new-folder") {
    const name = await showModal(
      "new-folder",
      "New Folder",
      "Enter folder name:",
      "folder",
    );
    if (!name) {
      return;
    }
    try {
      await vfs.createDirectory(name as string, targetDirectory);
    } catch (error) {
      modalError.value = error instanceof Error ? error.message : "Failed to create folder";
      modalVisible.value = true;
    }
    return;
  }

  if (key === "download-file" && itemTargetKind.value === "file") {
    const entry = await indexedDbVfs.getEntry(itemTargetPath.value);
    if (!entry || entry.kind !== "file") {
      return;
    }

    const fileName = entry.name || "download";
    if (entry.fileKind === "binary") {
      const binaryContent = entry.binaryContent ?? new Uint8Array();
      const bytes = Uint8Array.from(binaryContent);
      triggerBrowserDownload(new Blob([bytes]), fileName);
    } else {
      triggerBrowserDownload(
        new Blob([entry.textContent ?? ""], { type: "text/plain;charset=utf-8" }),
        fileName,
      );
    }
    return;
  }

  if (key === "export-archive" && itemTargetKind.value === "directory") {
    const path = itemTargetPath.value;
    const blob = await exportDirectoryToZip(indexedDbVfs, path);
    const folderParts = path.split("/").filter(Boolean);
    const folderName = path === "/" ? "workspace" : folderParts[folderParts.length - 1];
    triggerBrowserDownload(blob, `${folderName || "workspace"}.zip`);
    return;
  }

  if (key === "rename") {
    const currentNameParts = itemTargetPath.value.split("/").filter(Boolean);
    const currentName = currentNameParts[currentNameParts.length - 1] ?? "";
    const nextName = await showModal(
      "rename",
      "Rename",
      "Enter new name:",
      currentName,
    );
    if (!nextName || nextName === currentName) {
      return;
    }
    try {
      await vfs.renamePath(itemTargetPath.value, nextName as string);
    } catch (error) {
      modalError.value = error instanceof Error ? error.message : "Failed to rename";
      modalVisible.value = true;
    }
    return;
  }

  if (key === "delete") {
    const confirmed = await showModal(
      "delete",
      "Confirm Delete",
      `Are you sure you want to delete ${itemTargetPath.value}?`,
    );
    if (!confirmed) {
      return;
    }
    await vfs.deletePath(itemTargetPath.value);
    if (vfs.activePath) {
      emit("fileSelected", vfs.activePath);
    }
  }
}

onMounted(async () => {
  await vfs.refreshNodes();
});
</script>

<template>
  <div class="explorer-root" @contextmenu="handleSurfaceContextMenu">
    <NTree
      block-line
      selectable
      expand-on-click
      :data="treeData"
      :expanded-keys="expandedKeys"
      :selected-keys="selectedKeys"
      :node-props="treeNodeProps"
      :render-prefix="renderTreePrefix"
      :render-label="renderTreeLabel"
      @update:expanded-keys="setExpanded"
      @update:selected-keys="handleTreeSelect"
    />

    <NDropdown
      placement="bottom-start"
      trigger="manual"
      :show="surfaceMenuVisible"
      :x="surfaceMenuX"
      :y="surfaceMenuY"
      :options="surfaceMenuOptions"
      @clickoutside="hideMenus"
      @select="handleSurfaceAction"
    />

    <NDropdown
      placement="bottom-start"
      trigger="manual"
      :show="itemMenuVisible"
      :x="itemMenuX"
      :y="itemMenuY"
      :options="itemMenuOptions"
      @clickoutside="hideMenus"
      @select="handleItemAction"
    />

    <NModal v-model:show="modalVisible" preset="card" :title="modalTitle" style="width: 400px">
      <template v-if="modalType !== 'delete'">
        <NInput ref="inputRef" v-model:value="modalInputValue" :placeholder="modalMessage" @keyup.enter="handleModalConfirm" />
        <p v-if="modalError" class="modal-error">{{ modalError }}</p>
      </template>
      <template v-else>
        <p>{{ modalMessage }}</p>
      </template>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="handleModalCancel">Cancel</NButton>
          <NButton type="primary" @click="handleModalConfirm">Confirm</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.explorer-root {
  height: 100%;
  padding: 8px;
  padding-bottom: 6em;
  box-sizing: border-box;
  overflow: auto;
}

.explorer-root :deep(.n-tree-node-content__text) {
  max-width: calc(100% - 24px);
}

.explorer-root :deep(.tree-node-empty-dir .n-tree-node-content__text) {
  opacity: 0.55;
}

.modal-error {
  color: #d03050;
  font-size: 12px;
  margin-top: 8px;
  margin-bottom: 0;
}
</style>

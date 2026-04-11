<script setup lang="ts">
import type { Component, VNodeChild } from "vue";

import {
  Add24Regular,
  ArrowClockwise24Regular,
  Archive24Regular,
  Delete24Regular,
  Document24Regular,
  Folder24Regular,
  Rename24Regular,
  ArrowDownload24Filled,
} from "@vicons/fluent";
import {
  NButton,
  NCard,
  NDropdown,
  NIcon,
  NScrollbar,
  NTree,
  type DropdownOption,
  type TreeOption,
} from "naive-ui";
import { computed, h, onMounted, ref } from "vue";

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

const selectedKeys = computed(() => (vfs.activePath ? [vfs.activePath] : []));

const isItemDirectoryEmpty = computed(() => {
  if (itemTargetKind.value !== "directory") {
    return false;
  }

  const directoryPath = itemTargetPath.value;
  const prefix = directoryPath === "/" ? "/" : `${directoryPath}/`;
  return !vfs.nodes.some((node) => node.kind === "file" && node.path.startsWith(prefix));
});

const surfaceMenuOptions: DropdownOption[] = [
  { label: "New File", key: "new-file", icon: icon(Add24Regular) },
  { label: "New Folder", key: "new-folder", icon: icon(Folder24Regular) },
];

const itemMenuOptions = computed<DropdownOption[]>(() => {
  if (itemTargetPath.value === "/") {
    return [];
  }

  const options: DropdownOption[] = [];

  if (itemTargetKind.value === "directory") {
    options.push(...surfaceMenuOptions);
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
    byPath.set(node.path, {
      key: node.path,
      label: node.name,
      isLeaf: node.kind === "file",
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
  const iconComp = rawNode?.kind === "directory" ? Folder24Regular : Document24Regular;
  return h(NIcon, null, { default: () => h(iconComp) });
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
  return {
    onContextmenu: (event: MouseEvent) => handleTreeContextMenu(event, option),
  };
}

function setExpanded(next: Array<string | number>): void {
  expandedKeys.value = next.filter((item): item is string => typeof item === "string");
}

function currentWorkingDirectory(): string {
  if (itemMenuVisible.value && itemTargetKind.value === "directory") {
    return itemTargetPath.value;
  }

  if (vfs.currentDirectory) {
    return vfs.currentDirectory;
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
  hideMenus();

  if (key === "new-file") {
    const targetDirectory = currentWorkingDirectory();
    const name = window.prompt("New file name", "new-file.pseudo")?.trim();
    if (!name) {
      return;
    }
    await vfs.createFile(name, targetDirectory);
    expandDirectoryPath(targetDirectory);
    emit("fileSelected", vfs.activePath);
    return;
  }

  if (key === "new-folder") {
    const name = window.prompt("New folder name", "folder")?.trim();
    if (!name) {
      return;
    }
    await vfs.createDirectory(name, currentWorkingDirectory());
    return;
  }
}

async function handleItemAction(key: string | number): Promise<void> {
  hideMenus();

  if (key === "new-file") {
    const targetDirectory = currentWorkingDirectory();
    const name = window.prompt("New file name", "new-file.pseudo")?.trim();
    if (!name) {
      return;
    }
    await vfs.createFile(name, targetDirectory);
    expandDirectoryPath(targetDirectory);
    emit("fileSelected", vfs.activePath);
    return;
  }

  if (key === "new-folder") {
    const name = window.prompt("New folder name", "folder")?.trim();
    if (!name) {
      return;
    }
    await vfs.createDirectory(name, currentWorkingDirectory());
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
    const nextName = window.prompt("Rename to", currentName)?.trim();
    if (!nextName || nextName === currentName) {
      return;
    }
    await vfs.renamePath(itemTargetPath.value, nextName);
    return;
  }

  if (key === "delete") {
    const confirmed = window.confirm(`Delete ${itemTargetPath.value}?`);
    if (!confirmed) {
      return;
    }
    await vfs.deletePath(itemTargetPath.value);
    emit("fileSelected", vfs.activePath);
  }
}

onMounted(async () => {
  await vfs.refreshNodes();
});
</script>

<template>
  <div class="explorer-root">
    <NCard
      class="explorer-card"
      size="small"
      title="Workspace"
      :bordered="false"
      content-style="height: 100%; padding: 8px;"
    >
      <template #header-extra>
        <NButton quaternary circle size="small" @click="vfs.refreshNodes">
          <template #icon>
            <NIcon><ArrowClockwise24Regular /></NIcon>
          </template>
        </NButton>
      </template>

      <NScrollbar
        class="explorer-scroll"
        content-style="min-height: 100%;"
        @contextmenu="handleSurfaceContextMenu"
      >
        <NTree
          block-line
          selectable
          expand-on-click
          :data="treeData"
          :expanded-keys="expandedKeys"
          :selected-keys="selectedKeys"
          :node-props="treeNodeProps"
          :render-prefix="renderTreePrefix"
          @update:expanded-keys="setExpanded"
          @update:selected-keys="handleTreeSelect"
        />
      </NScrollbar>
    </NCard>

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
  </div>
</template>

<style scoped>
.explorer-root {
  height: 100%;
}

.explorer-card {
  height: 100%;
}

:deep(.n-card__content) {
  height: calc(100% - 8px);
}

.explorer-scroll {
  height: 100%;
}
</style>

import { defineStore } from "pinia";
import { computed, ref } from "vue";

import type { VfsListItem, VfsNodeInfo } from "@/ide/vfs/types";

import { indexedDbVfs } from "@/ide/vfs/indexed-db-vfs";
import { getParentPath } from "@/ide/vfs/path";

export const useVfsStore = defineStore("vfs", () => {
    const initialized = ref(false);
    const activePath = ref("/main.pseudo");
    const activeContent = ref("");
    const currentDirectory = ref("/");
    const directoryEntries = ref<VfsListItem[]>([]);
    const nodes = ref<VfsNodeInfo[]>([]);
    const openedTabs = ref<string[]>(["/main.pseudo"]);

    const activeFileName = computed(() => {
        const chunks = activePath.value.split("/").filter(Boolean);
        return chunks[chunks.length - 1] ?? "untitled";
    });

    async function initialize(): Promise<void> {
        if (initialized.value) {
            return;
        }

        await indexedDbVfs.initialize();
        await refreshDirectory("/");
        await refreshNodes();
        await openFile("/main.pseudo");
        initialized.value = true;
    }

    async function refreshDirectory(path: string): Promise<void> {
        currentDirectory.value = path;
        directoryEntries.value = await indexedDbVfs.listDirectory(path);
    }

    async function refreshNodes(): Promise<void> {
        nodes.value = await indexedDbVfs.listNodes();
    }

    async function openFile(path: string): Promise<void> {
        activePath.value = path;
        activeContent.value = await indexedDbVfs.readTextFile(path);
        currentDirectory.value = getParentPath(path) ?? "/";
        if (!openedTabs.value.includes(path)) {
            openedTabs.value.push(path);
        }
    }

    async function saveActiveFile(content: string): Promise<void> {
        if (!activePath.value) {
            activeContent.value = content;
            return;
        }
        activeContent.value = content;
        await indexedDbVfs.writeTextFile(activePath.value, content);
        await refreshDirectory(currentDirectory.value);
        await refreshNodes();
    }

    async function createFile(
        name: string,
        targetDirectory = currentDirectory.value,
    ): Promise<void> {
        const filePath = targetDirectory === "/" ? `/${name}` : `${targetDirectory}/${name}`;
        const existing = await indexedDbVfs.getEntry(filePath);
        if (existing) {
            if (existing.kind === "directory") {
                throw new Error(`A folder with the same name already exists: ${filePath}`);
            }
            await openFile(filePath);
            return;
        }

        await indexedDbVfs.createTextFile(filePath);
        await refreshDirectory(currentDirectory.value);
        await refreshNodes();
        await openFile(filePath);
    }

    async function createDirectory(
        name: string,
        targetDirectory = currentDirectory.value,
    ): Promise<void> {
        const directoryPath = targetDirectory === "/" ? `/${name}` : `${targetDirectory}/${name}`;
        await indexedDbVfs.createDirectory(directoryPath);
        await refreshDirectory(currentDirectory.value);
        await refreshNodes();
    }

    async function deletePath(path: string): Promise<void> {
        await indexedDbVfs.removePath(path);
        await refreshDirectory(currentDirectory.value);
        await refreshNodes();

        openedTabs.value = openedTabs.value.filter(
            (tab) => tab !== path && !tab.startsWith(`${path}/`),
        );

        if (activePath.value === path || activePath.value.startsWith(`${path}/`)) {
            const nextTab = openedTabs.value[openedTabs.value.length - 1];
            if (nextTab) {
                await openFile(nextTab);
            }
        }
    }

    async function closeTab(path: string): Promise<void> {
        const index = openedTabs.value.indexOf(path);
        if (index < 0) {
            return;
        }

        openedTabs.value.splice(index, 1);
        if (activePath.value === path) {
            const fallback = openedTabs.value[index - 1] ?? openedTabs.value[index];
            if (!fallback) {
                activePath.value = "";
                activeContent.value = "";
                currentDirectory.value = "/";
                return;
            }

            const exists = await indexedDbVfs.exists(fallback);
            if (exists) {
                await openFile(fallback);
            }
        }
    }

    async function renamePath(path: string, newName: string): Promise<void> {
        const nextPath = await indexedDbVfs.renamePath(path, newName);
        await refreshDirectory(currentDirectory.value);
        await refreshNodes();

        openedTabs.value = openedTabs.value.map((tab) => {
            if (tab === path) {
                return nextPath;
            }
            if (tab.startsWith(`${path}/`)) {
                return `${nextPath}${tab.slice(path.length)}`;
            }
            return tab;
        });

        if (activePath.value === path || activePath.value.startsWith(`${path}/`)) {
            const updatedActivePath =
                activePath.value === path
                    ? nextPath
                    : `${nextPath}${activePath.value.slice(path.length)}`;
            const exists = await indexedDbVfs.exists(updatedActivePath);
            if (exists) {
                await openFile(updatedActivePath);
            }
        }
    }

    return {
        initialized,
        activePath,
        activeContent,
        currentDirectory,
        directoryEntries,
        nodes,
        openedTabs,
        activeFileName,
        initialize,
        refreshDirectory,
        refreshNodes,
        openFile,
        saveActiveFile,
        createFile,
        createDirectory,
        deletePath,
        closeTab,
        renamePath,
    };
});

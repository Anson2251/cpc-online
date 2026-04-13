import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { VfsEntry, VfsFileEntry, VfsFileKind, VfsListItem, VfsNodeInfo } from "./types";

import { getName, getParentPath, joinPath, normalizePath } from "./path";

const DB_NAME = "cpc-online-ide-vfs";
const DB_VERSION = 1;
const STORE_NAME = "entries";
const ROOT_PATH = "/";

interface VfsDbSchema extends DBSchema {
    [STORE_NAME]: {
        key: string;
        value: VfsEntry;
    };
}

function now(): number {
    return Date.now();
}

function ensureDirectoryEntry(path: string, timestamp = now()): VfsEntry {
    const normalized = normalizePath(path);
    return {
        kind: "directory",
        path: normalized,
        name: getName(normalized),
        parentPath: getParentPath(normalized),
        createdAt: timestamp,
        modifiedAt: timestamp,
    };
}

function toListItem(entry: VfsEntry): VfsListItem {
    if (entry.kind === "directory") {
        return {
            path: entry.path,
            name: entry.name,
            kind: "directory",
            modifiedAt: entry.modifiedAt,
        };
    }

    return {
        path: entry.path,
        name: entry.name,
        kind: "file",
        fileKind: entry.fileKind,
        size: entry.size,
        modifiedAt: entry.modifiedAt,
    };
}

function toNodeInfo(entry: VfsEntry): VfsNodeInfo {
    if (entry.kind === "directory") {
        return {
            path: entry.path,
            name: entry.name,
            parentPath: entry.parentPath,
            kind: "directory",
            modifiedAt: entry.modifiedAt,
        };
    }

    return {
        path: entry.path,
        name: entry.name,
        parentPath: entry.parentPath,
        kind: "file",
        fileKind: entry.fileKind,
        modifiedAt: entry.modifiedAt,
    };
}

export class IndexedDbVfs {
    private dbPromise: Promise<IDBPDatabase<VfsDbSchema>> | null = null;

    private getDb(): Promise<IDBPDatabase<VfsDbSchema>> {
        if (!this.dbPromise) {
            this.dbPromise = openDB<VfsDbSchema>(DB_NAME, DB_VERSION, {
                upgrade(db) {
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME);
                    }
                },
            });
        }
        return this.dbPromise;
    }

    async initialize(): Promise<void> {
        const db = await this.getDb();
        const root = await db.get(STORE_NAME, ROOT_PATH);
        if (!root) {
            await db.put(STORE_NAME, ensureDirectoryEntry(ROOT_PATH), ROOT_PATH);
        }

        const starterFilePath = "/main.pseudo";
        const starterFile = await db.get(STORE_NAME, starterFilePath);
        if (!starterFile) {
            const starterProgram = [
                "DECLARE message : STRING",
                'message <- "Hello from vibe-cpc"',
                "OUTPUT message",
            ].join("\n");
            await this.writeTextFile(starterFilePath, starterProgram);
        }
    }

    async getEntry(path: string): Promise<VfsEntry | undefined> {
        const db = await this.getDb();
        return db.get(STORE_NAME, normalizePath(path));
    }

    async listDirectory(path: string): Promise<VfsListItem[]> {
        const normalized = normalizePath(path);
        const db = await this.getDb();
        const entry = await db.get(STORE_NAME, normalized);
        if (!entry || entry.kind !== "directory") {
            throw new Error(`Directory not found: ${normalized}`);
        }

        const allEntries = await db.getAll(STORE_NAME);
        return allEntries
            .filter((item) => item.parentPath === normalized)
            .map(toListItem)
            .sort((a, b) => {
                if (a.kind !== b.kind) {
                    return a.kind === "directory" ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            });
    }

    async listNodes(): Promise<VfsNodeInfo[]> {
        const db = await this.getDb();
        const allEntries = await db.getAll(STORE_NAME);
        return allEntries.map(toNodeInfo).sort((a, b) => {
            if (a.path === ROOT_PATH) {
                return -1;
            }
            if (b.path === ROOT_PATH) {
                return 1;
            }
            if (a.kind !== b.kind) {
                return a.kind === "directory" ? -1 : 1;
            }
            return a.path.localeCompare(b.path);
        });
    }

    async createDirectory(path: string): Promise<void> {
        const normalized = normalizePath(path);
        await this.ensureDirectory(normalized);
    }

    async createTextFile(path: string, content = ""): Promise<void> {
        const normalized = normalizePath(path);
        const existing = await this.getEntry(normalized);
        if (existing) {
            throw new Error(`Path already exists: ${normalized}`);
        }
        await this.writeTextFile(normalized, content);
    }

    async ensureDirectory(path: string): Promise<void> {
        const normalized = normalizePath(path);
        const db = await this.getDb();
        const existing = await db.get(STORE_NAME, normalized);

        if (existing) {
            if (existing.kind !== "directory") {
                throw new Error(`Path is not a directory: ${normalized}`);
            }
            return;
        }

        const parentPath = getParentPath(normalized);
        if (parentPath) {
            await this.ensureDirectory(parentPath);
        }

        await db.put(STORE_NAME, ensureDirectoryEntry(normalized), normalized);
    }

    async writeTextFile(path: string, content: string): Promise<void> {
        const normalized = normalizePath(path);
        const db = await this.getDb();
        const timestamp = now();
        const parentPath = getParentPath(normalized);

        if (!parentPath) {
            throw new Error("Cannot write file at root path");
        }

        await this.ensureDirectory(parentPath);

        const existing = await db.get(STORE_NAME, normalized);
        if (existing && existing.kind === "directory") {
            throw new Error(`Cannot overwrite directory with file: ${normalized}`);
        }

        const fileEntry: VfsFileEntry = {
            kind: "file",
            fileKind: "text",
            path: normalized,
            name: getName(normalized),
            parentPath,
            size: content.length,
            textContent: content,
            binaryContent: undefined,
            createdAt: existing?.createdAt ?? timestamp,
            modifiedAt: timestamp,
        };

        await db.put(STORE_NAME, fileEntry, normalized);
    }

    async appendTextFile(path: string, content: string): Promise<void> {
        const normalized = normalizePath(path);
        const exists = await this.exists(normalized);
        if (!exists) {
            await this.writeTextFile(normalized, content);
            return;
        }

        const existing = await this.readTextFile(normalized);
        await this.writeTextFile(normalized, `${existing}${content}`);
    }

    async writeBinaryFile(path: string, content: Uint8Array): Promise<void> {
        const normalized = normalizePath(path);
        const db = await this.getDb();
        const timestamp = now();
        const parentPath = getParentPath(normalized);

        if (!parentPath) {
            throw new Error("Cannot write file at root path");
        }

        await this.ensureDirectory(parentPath);

        const existing = await db.get(STORE_NAME, normalized);
        if (existing && existing.kind === "directory") {
            throw new Error(`Cannot overwrite directory with file: ${normalized}`);
        }

        const fileEntry: VfsFileEntry = {
            kind: "file",
            fileKind: "binary",
            path: normalized,
            name: getName(normalized),
            parentPath,
            size: content.byteLength,
            textContent: undefined,
            binaryContent: content,
            createdAt: existing?.createdAt ?? timestamp,
            modifiedAt: timestamp,
        };

        await db.put(STORE_NAME, fileEntry, normalized);
    }

    async readTextFile(path: string): Promise<string> {
        const entry = await this.getEntry(path);
        if (!entry || entry.kind !== "file") {
            throw new Error(`File not found: ${normalizePath(path)}`);
        }
        if (entry.fileKind !== "text") {
            throw new Error(`File is binary: ${normalizePath(path)}`);
        }
        return entry.textContent ?? "";
    }

    async readBinaryFile(path: string): Promise<Uint8Array> {
        const entry = await this.getEntry(path);
        if (!entry || entry.kind !== "file") {
            throw new Error(`File not found: ${normalizePath(path)}`);
        }
        if (entry.fileKind !== "binary") {
            return new TextEncoder().encode(entry.textContent ?? "");
        }
        return entry.binaryContent ?? new Uint8Array();
    }

    async removePath(path: string): Promise<void> {
        const normalized = normalizePath(path);
        if (normalized === ROOT_PATH) {
            throw new Error("Cannot delete root directory");
        }

        const db = await this.getDb();
        const target = await db.get(STORE_NAME, normalized);
        if (!target) {
            return;
        }

        const all = await db.getAll(STORE_NAME);
        const toDelete = all
            .filter((entry) => entry.path === normalized || entry.path.startsWith(`${normalized}/`))
            .map((entry) => entry.path);

        const tx = db.transaction(STORE_NAME, "readwrite");
        await Promise.all(toDelete.map((entryPath) => tx.store.delete(entryPath)));
        await tx.done;
    }

    async renamePath(path: string, newName: string): Promise<string> {
        const normalized = normalizePath(path);
        const target = await this.getEntry(normalized);
        if (!target) {
            throw new Error(`Path not found: ${normalized}`);
        }

        if (normalized === ROOT_PATH) {
            throw new Error("Cannot rename root directory");
        }

        const parentPath = getParentPath(normalized);
        if (!parentPath) {
            throw new Error("Cannot resolve parent directory");
        }

        const nextPath = joinPath(parentPath, newName);
        await this.movePath(normalized, nextPath);
        return nextPath;
    }

    async movePath(sourcePath: string, targetPath: string): Promise<void> {
        const source = normalizePath(sourcePath);
        const target = normalizePath(targetPath);

        if (source === ROOT_PATH || target === ROOT_PATH) {
            throw new Error("Cannot move root directory");
        }

        if (target === source || target.startsWith(`${source}/`)) {
            throw new Error("Cannot move a path into itself");
        }

        const db = await this.getDb();
        const sourceEntry = await db.get(STORE_NAME, source);
        if (!sourceEntry) {
            throw new Error(`Path not found: ${source}`);
        }

        const targetParent = getParentPath(target);
        if (!targetParent) {
            throw new Error("Invalid target path");
        }

        await this.ensureDirectory(targetParent);

        const existingTarget = await db.get(STORE_NAME, target);
        if (existingTarget) {
            throw new Error(`Target already exists: ${target}`);
        }

        const all = await db.getAll(STORE_NAME);
        const affected = all.filter(
            (entry) => entry.path === source || entry.path.startsWith(`${source}/`),
        );
        const timestamp = now();
        const tx = db.transaction(STORE_NAME, "readwrite");

        for (const entry of affected) {
            const suffix = entry.path.slice(source.length);
            const nextPath = normalizePath(`${target}${suffix}`);
            const nextParent = getParentPath(nextPath);
            if (!nextParent && nextPath !== ROOT_PATH) {
                throw new Error(`Invalid moved path: ${nextPath}`);
            }

            const movedEntry: VfsEntry = {
                ...entry,
                path: nextPath,
                name: getName(nextPath),
                parentPath: nextParent,
                modifiedAt: timestamp,
            };

            await tx.store.put(movedEntry, nextPath);
            await tx.store.delete(entry.path);
        }

        await tx.done;
    }

    async exists(path: string): Promise<boolean> {
        const db = await this.getDb();
        const entry = await db.get(STORE_NAME, normalizePath(path));
        return Boolean(entry);
    }

    async exportDirectoryEntries(rootPath: string): Promise<VfsEntry[]> {
        const normalized = normalizePath(rootPath);
        const db = await this.getDb();
        const root = await db.get(STORE_NAME, normalized);
        if (!root || root.kind !== "directory") {
            throw new Error(`Directory not found: ${normalized}`);
        }

        const all = await db.getAll(STORE_NAME);
        if (normalized === ROOT_PATH) {
            return all.filter((entry) => entry.path !== ROOT_PATH);
        }

        const prefix = `${normalized}/`;
        return all.filter((entry) => entry.path.startsWith(prefix));
    }
}

export const indexedDbVfs = new IndexedDbVfs();

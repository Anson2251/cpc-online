export type VfsEntryKind = "directory" | "file";
export type VfsFileKind = "text" | "binary";

export interface VfsBaseEntry {
    path: string;
    name: string;
    parentPath: string | null;
    createdAt: number;
    modifiedAt: number;
}

export interface VfsDirectoryEntry extends VfsBaseEntry {
    kind: "directory";
}

export interface VfsFileEntry extends VfsBaseEntry {
    kind: "file";
    fileKind: VfsFileKind;
    size: number;
    textContent?: string;
    binaryContent?: Uint8Array;
}

export type VfsEntry = VfsDirectoryEntry | VfsFileEntry;

export interface VfsListItem {
    path: string;
    name: string;
    kind: VfsEntryKind;
    fileKind?: VfsFileKind;
    size?: number;
    modifiedAt: number;
}

export interface VfsNodeInfo {
    path: string;
    name: string;
    parentPath: string | null;
    kind: VfsEntryKind;
    fileKind?: VfsFileKind;
    modifiedAt: number;
}

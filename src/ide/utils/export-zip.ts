import JSZip from "jszip";

import type { IndexedDbVfs } from "@/ide/vfs/indexed-db-vfs";

function trimLeadingSlash(path: string): string {
    if (path.startsWith("/")) {
        return path.slice(1);
    }
    return path;
}

function relativePath(basePath: string, fullPath: string): string {
    const base = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
    if (base === "/") {
        return trimLeadingSlash(fullPath);
    }

    const prefix = `${base}/`;
    if (fullPath.startsWith(prefix)) {
        return fullPath.slice(prefix.length);
    }

    return trimLeadingSlash(fullPath);
}

export async function exportDirectoryToZip(
    vfs: IndexedDbVfs,
    directoryPath: string,
): Promise<Blob> {
    const files = await vfs.exportDirectoryEntries(directoryPath);
    const zip = new JSZip();

    for (const file of files) {
        const target = relativePath(directoryPath, file.path);
        if (!target) {
            continue;
        }

        if (file.fileKind === "binary") {
            zip.file(target, file.binaryContent ?? new Uint8Array());
        } else {
            zip.file(target, file.textContent ?? "");
        }
    }

    return zip.generateAsync({ type: "blob" });
}

export function triggerBrowserDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}

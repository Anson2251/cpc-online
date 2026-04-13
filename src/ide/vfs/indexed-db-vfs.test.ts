import { beforeEach, describe, expect, it } from "vitest";

import { IndexedDbVfs } from "./indexed-db-vfs";

const hasIndexedDb = typeof globalThis.indexedDB !== "undefined";
const describeIfIndexedDb = hasIndexedDb ? describe : describe.skip;

function uniquePath(name: string): string {
  return `/tests/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${name}`;
}

describeIfIndexedDb("IndexedDbVfs export and move guards", () => {
  let vfs: IndexedDbVfs;

  beforeEach(async () => {
    vfs = new IndexedDbVfs();
    await vfs.initialize();
  });

  it("exportDirectoryEntries includes empty directories", async () => {
    const root = uniquePath("export-empty");
    const emptyDir = `${root}/empty-folder`;
    const nestedFile = `${root}/nested/file.txt`;

    await vfs.createDirectory(emptyDir);
    await vfs.writeTextFile(nestedFile, "ok");

    const entries = await vfs.exportDirectoryEntries(root);
    const paths = entries.map((entry) => entry.path);

    expect(paths).toContain(emptyDir);
    expect(paths).toContain(`${root}/nested`);
    expect(paths).toContain(nestedFile);
  });

  it("exportDirectoryEntries only returns descendants", async () => {
    const root = uniquePath("scope-root");
    const sibling = `${root}-sibling`;

    await vfs.writeTextFile(`${root}/inside.txt`, "inside");
    await vfs.writeTextFile(`${sibling}/outside.txt`, "outside");

    const entries = await vfs.exportDirectoryEntries(root);
    const paths = entries.map((entry) => entry.path);

    expect(paths).toContain(`${root}/inside.txt`);
    expect(paths.some((path) => path.startsWith(`${sibling}/`))).toBe(false);
  });

  it("rejects moving a directory into itself", async () => {
    const root = uniquePath("move-self");
    await vfs.createDirectory(root);

    await expect(vfs.movePath(root, `${root}/child`)).rejects.toThrow("Cannot move a path into itself");
  });
});

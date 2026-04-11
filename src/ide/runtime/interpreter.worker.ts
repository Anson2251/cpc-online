/// <reference lib="webworker" />

import { indexedDbVfs } from "@/ide/vfs/indexed-db-vfs";
import { BrowserIOImpl, Interpreter } from "@/libs/cpc-core/src/browser-index";

import type { RuntimeWorkerEvent, RuntimeWorkerRequest } from "./worker-messages";

declare const self: DedicatedWorkerGlobalScope;

function postMessageToMain(event: RuntimeWorkerEvent): void {
    self.postMessage(event);
}

self.addEventListener("message", async (event: MessageEvent<RuntimeWorkerRequest>) => {
    const payload = event.data;
    if (payload.type !== "run") {
        return;
    }

    const { runId, filePath } = payload;

    try {
        await indexedDbVfs.initialize();

        const io = new BrowserIOImpl({
            fileSystem: {
                readTextFile: (path) => indexedDbVfs.readTextFile(path),
                writeTextFile: (path, data) => indexedDbVfs.writeTextFile(path, data),
                appendTextFile: (path, data) => indexedDbVfs.appendTextFile(path, data),
                fileExists: (path) => indexedDbVfs.exists(path),
                readBinaryFile: (path) => indexedDbVfs.readBinaryFile(path),
                writeBinaryFile: (path, data) => indexedDbVfs.writeBinaryFile(path, data),
            },
            onOutput: (text) => {
                postMessageToMain({
                    type: "log",
                    runId,
                    stream: "stdout",
                    text,
                    timestamp: Date.now(),
                });
            },
            onError: (text) => {
                postMessageToMain({
                    type: "log",
                    runId,
                    stream: "stderr",
                    text,
                    timestamp: Date.now(),
                });
            },
        });

        const source = await indexedDbVfs.readTextFile(filePath);
        const interpreter = new Interpreter(io, {
            debug: false,
            strictTypeChecking: true,
        });

        const result = await interpreter.execute(source);
        await interpreter.dispose();

        postMessageToMain({
            type: "done",
            runId,
            result,
        });
    } catch (error) {
        postMessageToMain({
            type: "crash",
            runId,
            message: error instanceof Error ? error.message : String(error),
        });
    }
});

export {};

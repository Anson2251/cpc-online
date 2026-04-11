import { defineStore } from "pinia";
import { ref } from "vue";

import type { RuntimeLogEntry } from "@/ide/runtime/types";
import type { RuntimeWorkerEvent, RuntimeWorkerRequest } from "@/ide/runtime/worker-messages";

export const useRuntimeStore = defineStore("runtime", () => {
    const logs = ref<RuntimeLogEntry[]>([]);
    const running = ref(false);
    const lastRunSuccess = ref<boolean | null>(null);
    const lastError = ref<string | null>(null);
    const activeFilePath = ref("/main.pseudo");
    let runSeq = 0;

    function createWorker(): Worker {
        return new Worker(new URL("../runtime/interpreter.worker.ts", import.meta.url), {
            type: "module",
        });
    }

    async function runActiveFile(): Promise<void> {
        running.value = true;
        lastError.value = null;
        logs.value = [];
        runSeq += 1;
        const runId = runSeq;
        const worker = createWorker();

        await new Promise<void>((resolve) => {
            worker.onmessage = (event: MessageEvent<RuntimeWorkerEvent>) => {
                const payload = event.data;
                if (payload.runId !== runId) {
                    return;
                }

                if (payload.type === "log") {
                    logs.value.push({
                        id: logs.value.length + 1,
                        stream: payload.stream,
                        text: payload.text,
                        timestamp: payload.timestamp,
                    });
                    return;
                }

                if (payload.type === "done") {
                    lastRunSuccess.value = payload.result.success;
                    if (!payload.result.success) {
                        lastError.value = payload.result.error?.message ?? "Execution failed";
                    }
                    worker.terminate();
                    running.value = false;
                    resolve();
                    return;
                }

                if (payload.type === "crash") {
                    logs.value.push({
                        id: logs.value.length + 1,
                        stream: "stderr",
                        text: payload.message,
                        timestamp: Date.now(),
                    });
                    lastRunSuccess.value = false;
                    lastError.value = payload.message;
                    worker.terminate();
                    running.value = false;
                    resolve();
                }
            };

            worker.onerror = (error) => {
                const message = error.message || "Interpreter worker crashed";
                logs.value.push({
                    id: logs.value.length + 1,
                    stream: "stderr",
                    text: message,
                    timestamp: Date.now(),
                });
                lastRunSuccess.value = false;
                lastError.value = message;
                worker.terminate();
                running.value = false;
                resolve();
            };

            const request: RuntimeWorkerRequest = {
                type: "run",
                runId,
                filePath: activeFilePath.value,
            };
            worker.postMessage(request);
        });
    }

    function clearLogs(): void {
        logs.value = [];
    }

    function setActiveFile(path: string): void {
        activeFilePath.value = path;
    }

    return {
        logs,
        running,
        lastRunSuccess,
        lastError,
        activeFilePath,
        runActiveFile,
        clearLogs,
        setActiveFile,
    };
});

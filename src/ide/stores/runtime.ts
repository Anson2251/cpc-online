import { defineStore } from "pinia";
import { ref } from "vue";

import type { RuntimeLogEntry } from "@/ide/runtime/types";
import type { DebugSnapshot } from "@/libs/cpc-core/src/browser-index";
import type { RuntimeWorkerEvent, RuntimeWorkerRequest } from "@/ide/runtime/worker-messages";

const BREAKPOINTS_STORAGE_KEY = "cpc-online.breakpoints";

function loadBreakpoints(): Record<string, number[]> {
    if (typeof window === "undefined") {
        return {};
    }

    const raw = window.localStorage.getItem(BREAKPOINTS_STORAGE_KEY);
    if (!raw) {
        return {};
    }

    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const result: Record<string, number[]> = {};
        for (const [filePath, lines] of Object.entries(parsed)) {
            if (!Array.isArray(lines)) {
                continue;
            }
            result[filePath] = lines
                .filter((line): line is number => Number.isInteger(line) && Number(line) > 0)
                .map(Number)
                .sort((a, b) => a - b);
        }
        return result;
    } catch {
        return {};
    }
}

function persistBreakpoints(breakpointsByFile: Record<string, number[]>): void {
    if (typeof window === "undefined") {
        return;
    }

    window.localStorage.setItem(BREAKPOINTS_STORAGE_KEY, JSON.stringify(breakpointsByFile));
}

export const useRuntimeStore = defineStore("runtime", () => {
    const logs = ref<RuntimeLogEntry[]>([]);
    const running = ref(false);
    const lastRunSuccess = ref<boolean | null>(null);
    const lastError = ref<string | null>(null);
    const activeFilePath = ref("");
    const debugMode = ref(false);
    const debugSessionActive = ref(false);
    const debugPaused = ref(false);
    const debugSnapshot = ref<DebugSnapshot | null>(null);
    const breakpointsByFile = ref<Record<string, number[]>>(loadBreakpoints());
    const awaitingInput = ref(false);
    const pendingInputPrompt = ref("");
    const pendingInputValue = ref("");
    let runSeq = 0;
    let activeRunId: number | null = null;
    let activeWorker: Worker | null = null;
    let pendingInputRequestId: number | null = null;
    let activeRunResolve: (() => void) | null = null;

    function createWorker(): Worker {
        console.log("Creating interpreter worker...");
        const worker = new Worker(new URL("../runtime/interpreter.worker.ts", import.meta.url), {
            type: "module",
        });
        console.log("Interpreter worker created");
        return worker;
    }

    function finalizeRun(options?: {
        terminateWorker?: boolean;
        success?: boolean | null;
        error?: string | null;
        logMessage?: string;
        logStream?: "stdout" | "stderr";
        finalSnapshot?: DebugSnapshot;
    }): void {
        if (options?.logMessage) {
            logs.value.push({
                id: logs.value.length + 1,
                stream: options.logStream ?? "stderr",
                text: options.logMessage,
                timestamp: Date.now(),
            });
        }

        if (options?.success !== undefined) {
            lastRunSuccess.value = options.success;
        }
        if (options?.error !== undefined) {
            lastError.value = options.error;
        }

        if (options?.terminateWorker && activeWorker) {
            activeWorker.terminate();
        }

        activeWorker = null;
        activeRunId = null;
        pendingInputRequestId = null;
        awaitingInput.value = false;
        pendingInputPrompt.value = "";
        pendingInputValue.value = "";

        if (options?.finalSnapshot) {
            debugSnapshot.value = options.finalSnapshot;
            debugSessionActive.value = true;
            debugPaused.value = false;
        } else {
            debugSessionActive.value = false;
            debugPaused.value = false;
        }

        running.value = false;

        const resolve = activeRunResolve;
        activeRunResolve = null;
        resolve?.();
    }

    async function runActiveFile(options?: { debug?: boolean }): Promise<void> {
        if (running.value) {
            return;
        }

        const runWithDebug = Boolean(options?.debug);
        running.value = true;
        debugMode.value = runWithDebug;
        debugSessionActive.value = runWithDebug;
        debugPaused.value = false;
        debugSnapshot.value = null;
        lastError.value = null;
        logs.value = [];
        runSeq += 1;
        const runId = runSeq;
        activeRunId = runId;
        const worker = createWorker();
        activeWorker = worker;

        await new Promise<void>((resolve) => {
            activeRunResolve = resolve;
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

                if (payload.type === "input-request") {
                    pendingInputRequestId = payload.requestId;
                    pendingInputPrompt.value = payload.prompt ?? "";
                    pendingInputValue.value = "";
                    awaitingInput.value = true;
                    return;
                }

                if (payload.type === "done") {
                    finalizeRun({
                        terminateWorker: true,
                        success: payload.result.success,
                        error: payload.result.success
                            ? null
                            : (payload.result.error?.message ?? "Execution failed"),
                        finalSnapshot: payload.finalSnapshot,
                    });
                    return;
                }

                if (payload.type === "crash") {
                    finalizeRun({
                        terminateWorker: true,
                        success: false,
                        error: payload.message,
                        logMessage: payload.message,
                    });
                    return;
                }

                if (payload.type === "debug") {
                    debugSnapshot.value = payload.snapshot;
                    debugSessionActive.value = true;
                    debugPaused.value = payload.event === "paused";
                }
            };

            worker.onerror = (error) => {
                console.error("[Main] Worker onerror:", error);
                const message = error.message || "Interpreter worker crashed";
                finalizeRun({
                    terminateWorker: true,
                    success: false,
                    error: message,
                    logMessage: message,
                });
            };

            worker.onmessageerror = (error) => {
                console.error("[Main] Worker onmessageerror:", error);
            };

            const request: RuntimeWorkerRequest = {
                type: "run",
                runId,
                filePath: activeFilePath.value,
                debug: runWithDebug,
                breakpoints: getBreakpoints(activeFilePath.value),
            };
            worker.postMessage(request);
        });
    }

    function sendDebugCommand(command: "continue" | "step-into" | "step-over"): void {
        if (!activeWorker || activeRunId === null) {
            return;
        }
        if (!debugSessionActive.value) {
            return;
        }

        const request: RuntimeWorkerRequest = {
            type: "debug-command",
            runId: activeRunId,
            command,
        };
        activeWorker.postMessage(request);
    }

    function continueDebug(): void {
        sendDebugCommand("continue");
    }

    function stepIntoDebug(): void {
        sendDebugCommand("step-into");
    }

    function stepOverDebug(): void {
        sendDebugCommand("step-over");
    }

    function getBreakpoints(filePath: string): number[] {
        const lines = breakpointsByFile.value[filePath];
        return lines ? [...lines] : [];
    }

    function toggleBreakpoint(filePath: string, line: number): void {
        if (!Number.isInteger(line) || line <= 0) {
            return;
        }
        const current = getBreakpoints(filePath);
        if (current.includes(line)) {
            breakpointsByFile.value = {
                ...breakpointsByFile.value,
                [filePath]: current.filter((entry) => entry !== line),
            };
            persistBreakpoints(breakpointsByFile.value);
            return;
        }
        breakpointsByFile.value = {
            ...breakpointsByFile.value,
            [filePath]: [...current, line].sort((a, b) => a - b),
        };
        persistBreakpoints(breakpointsByFile.value);
    }

    function setBreakpoints(filePath: string, lines: number[]): void {
        breakpointsByFile.value = {
            ...breakpointsByFile.value,
            [filePath]: lines
                .filter((line) => Number.isInteger(line) && line > 0)
                .sort((a, b) => a - b),
        };
        persistBreakpoints(breakpointsByFile.value);
    }

    function clearBreakpoints(filePath?: string): void {
        if (!filePath) {
            breakpointsByFile.value = {};
            persistBreakpoints(breakpointsByFile.value);
            return;
        }

        const next = { ...breakpointsByFile.value };
        delete next[filePath];
        breakpointsByFile.value = next;
        persistBreakpoints(breakpointsByFile.value);
    }

    function clearLogs(): void {
        logs.value = [];
    }

    function stopActiveRun(): void {
        if (!activeWorker) {
            return;
        }

        finalizeRun({
            terminateWorker: true,
            success: false,
            error: debugMode.value ? "Debug session exited" : "Execution stopped",
            logMessage: debugMode.value ? "Debug session exited" : "Execution stopped",
        });
    }

    function submitInputPrompt(): void {
        if (!activeWorker || activeRunId === null || pendingInputRequestId === null) {
            return;
        }

        logs.value.push({
            id: logs.value.length + 1,
            stream: "stdin",
            text: pendingInputValue.value,
            timestamp: Date.now(),
        });

        const request: RuntimeWorkerRequest = {
            type: "input-response",
            runId: activeRunId,
            requestId: pendingInputRequestId,
            value: pendingInputValue.value,
        };
        activeWorker.postMessage(request);
        pendingInputRequestId = null;
        awaitingInput.value = false;
        pendingInputPrompt.value = "";
        pendingInputValue.value = "";
    }

    function cancelInputPrompt(): void {
        pendingInputValue.value = "";
        submitInputPrompt();
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
        debugMode,
        debugSessionActive,
        debugPaused,
        debugSnapshot,
        breakpointsByFile,
        awaitingInput,
        pendingInputPrompt,
        pendingInputValue,
        runActiveFile,
        continueDebug,
        stepIntoDebug,
        stepOverDebug,
        getBreakpoints,
        toggleBreakpoint,
        setBreakpoints,
        clearBreakpoints,
        clearLogs,
        stopActiveRun,
        submitInputPrompt,
        cancelInputPrompt,
        setActiveFile,
    };
});

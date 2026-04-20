/// <reference lib="webworker" />

// Global error handlers for debugging
self.addEventListener("error", (event) => {
    // eslint-disable-next-line no-console
    console.error("[Worker] Global error:", event.error);
    self.postMessage({
        type: "crash",
        runId: 0,
        message: `Worker error: ${event.error?.message || String(event.error)}`,
    });
});

self.addEventListener("unhandledrejection", (event) => {
    // eslint-disable-next-line no-console
    console.error("[Worker] Unhandled rejection:", event.reason);
    self.postMessage({
        type: "crash",
        runId: 0,
        message: `Worker unhandled rejection: ${event.reason?.message || String(event.reason)}`,
    });
});

// eslint-disable-next-line no-console
console.log("[Worker] Script started");

import { indexedDbVfs } from "@/ide/vfs/indexed-db-vfs";

// eslint-disable-next-line no-console
console.log("[Worker] indexedDbVfs imported");

import {
    BrowserIOImpl,
    DebuggerController,
    Interpreter,
    type DebugSnapshot,
    type TypeInfo,
} from "@/libs/cpc-core/src/browser-index";

// eslint-disable-next-line no-console
console.log("[Worker] browser-index imported");

import type { RuntimeWorkerDoneEvent, RuntimeWorkerEvent, RuntimeWorkerRequest } from "./worker-messages";

declare const self: DedicatedWorkerGlobalScope;

let activeRunId: number | null = null;
let activeInterpreter: Interpreter | null = null;
let activeDebugger: DebuggerController | null = null;
let lastDebugSnapshot: DebugSnapshot | null = null;
let inputRequestSeq = 0;
const pendingInputResolvers = new Map<number, (value: string) => void>();

function serializeDebugValue(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
    if (value === null || value === undefined) {
        return value;
    }

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return value;
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (Array.isArray(value)) {
        return value.map((item) => serializeDebugValue(item, seen));
    }

    if (value instanceof Set) {
        return Array.from(value, (item) => serializeDebugValue(item, seen));
    }

    if (value instanceof Map) {
        return Object.fromEntries(
            Array.from(value.entries(), ([key, item]) => [
                String(key),
                serializeDebugValue(item, seen),
            ]),
        );
    }

    if (typeof value === "object") {
        if (seen.has(value)) {
            return "[Circular]";
        }
        seen.add(value);

        const record: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value)) {
            record[key] = serializeDebugValue(item, seen);
        }
        return record;
    }

    return typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : JSON.stringify(value);
}

function serializeSnapshot(snapshot: DebugSnapshot): DebugSnapshot {
    return {
        reason: snapshot.reason,
        location: snapshot.location,
        callStack: snapshot.callStack.map((frame) => ({
            routineName: frame.routineName,
            line: frame.line,
            column: frame.column,
        })),
        scopes: snapshot.scopes.map((scope) => ({
            scopeName: scope.scopeName,
            variables: scope.variables.map((variable) => ({
                name: variable.name,
                type: variable.type,
                typeInfo: serializeDebugType(variable.typeInfo),
                isConstant: variable.isConstant,
                value: serializeDebugValue(variable.value),
            })),
        })),
        error: snapshot.error ? { message: snapshot.error.message, line: snapshot.error.line, column: snapshot.error.column } : undefined,
    };
}

function serializeDebugType(typeInfo: TypeInfo): TypeInfo {
    if (typeof typeInfo === "string") {
        return typeInfo;
    }

    if ("elementType" in typeInfo && "bounds" in typeInfo) {
        return {
            elementType: typeInfo.elementType,
            bounds: typeInfo.bounds.map((bound) => ({
                lower: bound.lower,
                upper: bound.upper,
            })),
        };
    }

    if ("fields" in typeInfo) {
        return {
            name: typeInfo.name,
            fields: Object.fromEntries(
                Object.entries(typeInfo.fields).map(([key, value]) => [
                    key,
                    serializeDebugType(value),
                ]),
            ),
        };
    }

    if ("kind" in typeInfo && typeInfo.kind === "ENUM") {
        return {
            kind: "ENUM",
            name: typeInfo.name,
            values: [...typeInfo.values],
        };
    }

    if ("kind" in typeInfo && typeInfo.kind === "SET") {
        return {
            kind: "SET",
            name: typeInfo.name,
            elementType: typeInfo.elementType,
        };
    }

    if ("kind" in typeInfo && typeInfo.kind === "POINTER") {
        return {
            kind: "POINTER",
            name: typeInfo.name,
            pointedType: serializeDebugType(typeInfo.pointedType),
        };
    }

    if ("kind" in typeInfo && typeInfo.kind === "INFERRED") {
        return {
            kind: "INFERRED",
        };
    }

    return typeInfo;
}

function postMessageToMain(event: RuntimeWorkerEvent): void {
    self.postMessage(event);
}

self.addEventListener("message", async (event: MessageEvent<RuntimeWorkerRequest>) => {
    const payload = event.data;

    if (payload.type === "debug-command") {
        if (payload.runId !== activeRunId || !activeDebugger) {
            return;
        }
        if (payload.command === "continue") {
            activeDebugger.continue();
            return;
        }
        if (payload.command === "step-into") {
            activeDebugger.stepInto();
            return;
        }
        if (payload.command === "step-over") {
            activeDebugger.stepOver();
        }
        return;
    }

    if (payload.type === "input-response") {
        if (payload.runId !== activeRunId) {
            return;
        }
        const resolver = pendingInputResolvers.get(payload.requestId);
        if (!resolver) {
            return;
        }
        pendingInputResolvers.delete(payload.requestId);
        resolver(payload.value);
        return;
    }

    if (payload.type !== "run") {
        return;
    }

    const { runId, filePath } = payload;
    activeRunId = runId;

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
            inputProvider: (prompt) => {
                inputRequestSeq += 1;
                const requestId = inputRequestSeq;
                postMessageToMain({
                    type: "input-request",
                    runId,
                    requestId,
                    prompt,
                });
                return new Promise<string>((resolve) => {
                    pendingInputResolvers.set(requestId, resolve);
                });
            },
        });

        const source = await indexedDbVfs.readTextFile(filePath);
        const interpreter = new Interpreter(io, {
            strictTypeChecking: true,
        });
        activeInterpreter = interpreter;

        let removeListener = () => { };
        if (payload.debug) {
            lastDebugSnapshot = null;
            const debuggerController = new DebuggerController();
            activeDebugger = debuggerController;

            removeListener = debuggerController.onEvent((debugEvent) => {
                const serialized = serializeSnapshot(debugEvent.snapshot);
                lastDebugSnapshot = serialized;
                postMessageToMain({
                    type: "debug",
                    runId,
                    event: debugEvent.type,
                    snapshot: serialized,
                });
            });

            debuggerController.setBreakpoints(payload.breakpoints ?? []);
            interpreter.attachDebugger(debuggerController);
        }

        const result = await interpreter.execute(source);
        removeListener();
        await interpreter.dispose();
        activeInterpreter = null;
        activeDebugger = null;
        activeRunId = null;
        pendingInputResolvers.clear();

        const doneEvent: RuntimeWorkerDoneEvent = {
            type: "done",
            runId,
            result,
        };

        if (payload.debug && !result.success && lastDebugSnapshot) {
            doneEvent.finalSnapshot = lastDebugSnapshot;
        }

        postMessageToMain(doneEvent);
    } catch (error) {
        if (activeInterpreter) {
            await activeInterpreter.dispose();
        }
        activeInterpreter = null;
        activeDebugger = null;
        activeRunId = null;
        pendingInputResolvers.clear();
        postMessageToMain({
            type: "crash",
            runId,
            message: error instanceof Error ? error.message : String(error),
        });
    }
});

export { };

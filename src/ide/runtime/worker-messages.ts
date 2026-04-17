import type { DebugSnapshot, ExecutionResult } from "@/libs/cpc-core/src/browser-index";

export interface RuntimeWorkerRunRequest {
    type: "run";
    runId: number;
    filePath: string;
    debug: boolean;
    breakpoints?: number[];
}

export interface RuntimeWorkerDebugCommandRequest {
    type: "debug-command";
    runId: number;
    command: "continue" | "step-into" | "step-over";
}

export interface RuntimeWorkerInputResponseRequest {
    type: "input-response";
    runId: number;
    requestId: number;
    value: string;
}

export interface RuntimeWorkerLogEvent {
    type: "log";
    runId: number;
    stream: "stdout" | "stderr";
    text: string;
    timestamp: number;
}

export interface RuntimeWorkerDoneEvent {
    type: "done";
    runId: number;
    result: ExecutionResult;
    finalSnapshot?: DebugSnapshot;
}

export interface RuntimeWorkerCrashEvent {
    type: "crash";
    runId: number;
    message: string;
}

export interface RuntimeWorkerDebugEvent {
    type: "debug";
    runId: number;
    event: "paused" | "resumed";
    snapshot: DebugSnapshot;
}

export interface RuntimeWorkerInputRequestEvent {
    type: "input-request";
    runId: number;
    requestId: number;
    prompt?: string;
}

export type RuntimeWorkerRequest =
    | RuntimeWorkerRunRequest
    | RuntimeWorkerDebugCommandRequest
    | RuntimeWorkerInputResponseRequest;
export type RuntimeWorkerEvent =
    | RuntimeWorkerLogEvent
    | RuntimeWorkerDoneEvent
    | RuntimeWorkerCrashEvent
    | RuntimeWorkerDebugEvent
    | RuntimeWorkerInputRequestEvent;

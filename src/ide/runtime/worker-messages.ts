import type { ExecutionResult } from "@/libs/cpc-core/src/browser-index";

export interface RuntimeWorkerRunRequest {
    type: "run";
    runId: number;
    filePath: string;
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
}

export interface RuntimeWorkerCrashEvent {
    type: "crash";
    runId: number;
    message: string;
}

export type RuntimeWorkerRequest = RuntimeWorkerRunRequest;
export type RuntimeWorkerEvent =
    | RuntimeWorkerLogEvent
    | RuntimeWorkerDoneEvent
    | RuntimeWorkerCrashEvent;

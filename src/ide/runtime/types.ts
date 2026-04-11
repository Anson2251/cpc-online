export interface RuntimeLogEntry {
    id: number;
    stream: "stdout" | "stderr";
    text: string;
    timestamp: number;
}

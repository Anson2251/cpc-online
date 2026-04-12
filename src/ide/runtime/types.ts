export interface RuntimeLogEntry {
  id: number;
  stream: "stdout" | "stderr" | "stdin";
  text: string;
  timestamp: number;
}

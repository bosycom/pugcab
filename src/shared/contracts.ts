export type UiTask = {
  backupName: string;
  description?: string;
  enabled: boolean;
  sourceType: string;
  zipEnabled: boolean;
};

export type TaskRunResult = {
  backupName: string;
  success: boolean;
  outputPath?: string;
  error?: string;
  durationMs: number;
};

export type RunSummary = {
  total: number;
  succeeded: number;
  failed: number;
  results: TaskRunResult[];
  cancelled: boolean;
};

export type RunProgressEvent =
  | { type: "run-start"; taskNames: string[]; totalTasks: number }
  | { type: "task-start"; backupName: string; percent: number; message: string }
  | { type: "task-progress"; backupName: string; percent: number; message: string }
  | { type: "task-success"; backupName: string; percent: 100; durationMs: number; outputPath: string }
  | { type: "task-failed"; backupName: string; percent: number; durationMs: number; error: string }
  | { type: "run-cancelled"; reason: string }
  | { type: "run-complete"; summary: RunSummary };

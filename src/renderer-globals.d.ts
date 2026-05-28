import type { RunProgressEvent, RunSummary, UiTask } from "./shared/contracts.js";

declare global {
  interface Window {
    backupApi: {
      listTasks(configPath: string): Promise<UiTask[]>;
      pickConfigPath(): Promise<string | null>;
      runTasks(args: {
        configPath: string;
        selectedTaskNames: string[];
        zipPassword?: string;
      }): Promise<RunSummary>;
      cancelRun(): Promise<void>;
      onProgress(listener: (event: RunProgressEvent) => void): () => void;
    };
  }
}

export {};

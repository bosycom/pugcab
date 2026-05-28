import { contextBridge, ipcRenderer } from "electron";
import type { RunProgressEvent } from "./shared/contracts.js";

contextBridge.exposeInMainWorld("backupApi", {
  listTasks: (configPath: string) => ipcRenderer.invoke("backup:list-tasks", configPath),
  pickConfigPath: () => ipcRenderer.invoke("backup:pick-config-path"),
  runTasks: (args: { configPath: string; selectedTaskNames: string[]; zipPassword?: string }) =>
    ipcRenderer.invoke("backup:run", args),
  cancelRun: () => ipcRenderer.invoke("backup:cancel"),
  onProgress: (listener: (event: RunProgressEvent) => void) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on("backup:progress", handler);
    return () => {
      ipcRenderer.removeListener("backup:progress", handler);
    };
  },
});

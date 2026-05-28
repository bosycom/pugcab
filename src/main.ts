import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { join, resolve } from "node:path";
import { chmodSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { loadTasks } from "./core/task-loader.js";
import { runTasks } from "./core/runner.js";
import { logger } from "./core/logger.js";
import type { RunProgressEvent, UiTask } from "./shared/contracts.js";

let mainWindow: BrowserWindow | null = null;
let currentRunController: AbortController | null = null;

// VMs and remote sessions often have unstable GPU acceleration support.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
if (process.platform === "linux") {
  app.commandLine.appendSwitch("ozone-platform", "x11");
  app.commandLine.appendSwitch("ozone-platform-hint", "x11");
  const chromiumTmpDir = resolve(process.cwd(), ".tmp-chromium");
  if (!existsSync(chromiumTmpDir)) {
    mkdirSync(chromiumTmpDir, { recursive: true });
  }
  chmodSync(chromiumTmpDir, 0o700);
  process.env.TMPDIR = chromiumTmpDir;
  process.env.TMP = chromiumTmpDir;
  process.env.TEMP = chromiumTmpDir;
  try {
    app.setPath("temp", chromiumTmpDir);
  } catch {
    // Ignore in case Electron rejects setPath before initialization on some versions.
  }

  const userDataDir = resolve(process.cwd(), ".electron-user-data");
  if (!existsSync(userDataDir)) {
    mkdirSync(userDataDir, { recursive: true });
  }
  app.setPath("userData", userDataDir);
  app.commandLine.appendSwitch("user-data-dir", userDataDir);

  const cacheDir = resolve(process.cwd(), ".electron-cache");
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }
  app.setPath("cache", cacheDir);
  try {
    app.setPath("sessionData", cacheDir);
  } catch {
    // Not available on all Electron versions.
  }
  rmSync(resolve(userDataDir, "GPUCache"), { recursive: true, force: true });

  app.commandLine.appendSwitch("no-sandbox");
  app.commandLine.appendSwitch("disable-setuid-sandbox");
  app.commandLine.appendSwitch("disable-dev-shm-usage");
  app.commandLine.appendSwitch("no-zygote");
  app.commandLine.appendSwitch("single-process");
  app.commandLine.appendSwitch("in-process-gpu");
  app.commandLine.appendSwitch("use-gl", "angle");
  app.commandLine.appendSwitch("use-angle", "swiftshader");
  app.commandLine.appendSwitch("ignore-gpu-blocklist");
  app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
  app.commandLine.appendSwitch("gpu-program-cache-size-kb", "0");
  app.commandLine.appendSwitch("disk-cache-size", "1");
}

function getDefaultConfigPath() {
  return resolve(process.cwd(), "backup.tasks.json");
}

function taskToUiTask(task): UiTask {
  return {
    backupName: task.backupName,
    description: task.description,
    enabled: task.enabled !== false,
    sourceType: task.source?.type ?? "custom-execution",
    zipEnabled: Boolean(task.zip?.enableEncryption),
  };
}

function emitProgress(event: RunProgressEvent) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send("backup:progress", event);
}

async function createWindow() {
  const preloadPath = join(import.meta.dirname, "preload.cjs");
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 960,
    minHeight: 680,
    show: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    await win.loadURL(devUrl);
  } else {
    await win.loadFile(join(import.meta.dirname, "../dist/renderer/index.html"));
  }

  win.center();
  win.show();
  win.focus();

  win.webContents.on("did-fail-load", (_event, code, description, validatedURL) => {
    logger.error(`Renderer failed to load (${code}) ${description}`, validatedURL);
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    logger.error("Renderer process gone", details.reason);
  });

  return win;
}

app.whenReady().then(async () => {
  mainWindow = await createWindow();

  ipcMain.handle("backup:list-tasks", async (_event, configPath) => {
    const tasks = await loadTasks(configPath || getDefaultConfigPath());
    return tasks.map(taskToUiTask);
  });

  ipcMain.handle("backup:pick-config-path", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: "Select backup task config",
      properties: ["openFile"],
      filters: [
        { name: "Task config", extensions: ["json", "js", "mjs", "cjs"] },
        { name: "All Files", extensions: ["*"] },
      ],
      defaultPath: process.cwd(),
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle("backup:run", async (_event, payload) => {
    if (currentRunController) {
      throw new Error("A backup run is already in progress.");
    }

    const configPath = payload?.configPath || getDefaultConfigPath();
    const selectedTaskNames = Array.isArray(payload?.selectedTaskNames)
      ? payload.selectedTaskNames
      : [];
    if (selectedTaskNames.length === 0) {
      throw new Error("Select at least one task.");
    }

    const tasks = await loadTasks(configPath);
    currentRunController = new AbortController();

    try {
      const summary = await runTasks(tasks, logger, {
        onlyTitles: selectedTaskNames,
        parallel: true,
        stopOnError: true,
        signal: currentRunController.signal,
        zipPassword: payload?.zipPassword,
        onEvent: emitProgress,
      });
      return summary;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emitProgress({
        type: "run-cancelled",
        reason: message,
      });
      throw new Error(message);
    } finally {
      currentRunController = null;
    }
  });

  ipcMain.handle("backup:cancel", async () => {
    if (currentRunController) {
      currentRunController.abort();
    }
  });

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = await createWindow();
    }
  });
}).catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  logger.error("App initialization failed", message);
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (currentRunController) {
    currentRunController.abort();
  }
});

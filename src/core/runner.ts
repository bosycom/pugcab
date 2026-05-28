import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { buildArchiveFileName, toTaskSlug } from "./naming.js";
import { ensureDir, removeDir, walkFiles } from "./fs-utils.js";
import { createZipArchive } from "./archive.js";
import { collectTaskSource } from "./source-dispatcher.js";
import { promptForPasswordWithConfirmation } from "./password.js";
import type { BackupTask } from "./task-schema.js";
import type { RunProgressEvent, RunSummary, TaskRunResult } from "../shared/contracts.js";
import type { Logger } from "./logger.js";

type RunTaskOptions = {
  onlyTitle?: string;
  onlyTitles?: string[];
  parallel?: boolean;
  stopOnError?: boolean;
  signal?: AbortSignal;
  onEvent?: (event: RunProgressEvent) => void;
  zipPassword?: string;
};

async function resolveRunZipPasswordIfNeeded(
  tasks: BackupTask[],
  logger: Logger,
  providedPassword?: string
): Promise<string | undefined> {
  const requiresEncryption = tasks.some((task) => Boolean(task.zip?.enableEncryption));
  if (!requiresEncryption) {
    return undefined;
  }

  if (providedPassword) {
    return providedPassword;
  }

  const envName = "BACKUP_ZIP_PASSWORD";
  const fromEnv = process.env[envName];
  if (fromEnv) {
    return fromEnv;
  }

  logger.info(`Environment variable ${envName} is not set. Prompting for ZIP password.`);
  return promptForPasswordWithConfirmation(`password for ${envName}`);
}

async function createStagingDir(backupName: string) {
  const prefix = `backup-${toTaskSlug(backupName)}-`;
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function copyStagingToTarget(stagingDir: string, destinationDir: string) {
  const entries = await fs.readdir(stagingDir);
  for (const entry of entries) {
    await fs.cp(path.join(stagingDir, entry), path.join(destinationDir, entry), {
      recursive: true,
      force: true,
    });
  }
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw new Error("Run canceled.");
  }
}

async function executeTask(
  task: BackupTask,
  logger: Logger,
  options: RunTaskOptions,
  zipPassword: string | undefined,
  emitEvent: (event: RunProgressEvent) => void
) {
  const startedAt = Date.now();
  const slug = toTaskSlug(task.backupName);
  emitEvent({
    type: "task-start",
    backupName: task.backupName,
    percent: 1,
    message: "Starting",
  });

  let stagingDir: string | undefined;
  try {
    throwIfAborted(options.signal);
    stagingDir = await createStagingDir(task.backupName);
    emitEvent({
      type: "task-progress",
      backupName: task.backupName,
      percent: 8,
      message: "Collecting source",
    });

    await collectTaskSource(task, { stagingDir, logger, task });
    throwIfAborted(options.signal);

    const stagedFiles = await walkFiles(stagingDir);
    logger.info(`Collected ${stagedFiles.length} file(s) for task ${task.backupName}`);
    emitEvent({
      type: "task-progress",
      backupName: task.backupName,
      percent: 35,
      message: "Preparing output",
    });

    const destinationDir = path.join(path.resolve(task.targetPath), slug);
    await ensureDir(destinationDir);

    let outputPath: string;
    if (task.zip) {
      const archiveName = buildArchiveFileName({
        backupName: task.backupName,
        date: new Date(),
      });
      outputPath = path.join(destinationDir, archiveName);
      const enableEncryption = Boolean(task.zip.enableEncryption);
      const compressionLevel = task.zip.compressionLevel ?? 1;
      await createZipArchive({
        sourceDir: stagingDir,
        outputFile: outputPath,
        password: enableEncryption ? zipPassword : undefined,
        enableEncryption,
        compressionLevel,
        logger,
        signal: options.signal,
        onProgress: (ratio: number) => {
          const bounded = Math.max(0, Math.min(1, ratio));
          const percent = 35 + Math.round(bounded * 60);
          emitEvent({
            type: "task-progress",
            backupName: task.backupName,
            percent,
            message: "Creating archive",
          });
        },
      });
    } else {
      emitEvent({
        type: "task-progress",
        backupName: task.backupName,
        percent: 65,
        message: "Copying files",
      });
      outputPath = destinationDir;
      await copyStagingToTarget(stagingDir, destinationDir);
    }

    throwIfAborted(options.signal);
    const durationMs = Date.now() - startedAt;
    logger.info(`Task completed: ${task.backupName} (${durationMs}ms)`, outputPath);
    emitEvent({
      type: "task-success",
      backupName: task.backupName,
      percent: 100,
      durationMs,
      outputPath,
    });
    return {
      backupName: task.backupName,
      success: true,
      outputPath,
      durationMs,
    } satisfies TaskRunResult;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Task failed: ${task.backupName} (${durationMs}ms)`, errorMessage);
    emitEvent({
      type: "task-failed",
      backupName: task.backupName,
      percent: 100,
      durationMs,
      error: errorMessage,
    });
    return {
      backupName: task.backupName,
      success: false,
      error: errorMessage,
      durationMs,
    } satisfies TaskRunResult;
  } finally {
    if (stagingDir) {
      await removeDir(stagingDir);
    }
  }
}

export async function runTasks(
  tasks: BackupTask[],
  logger: Logger,
  options: RunTaskOptions = {}
) {
  let selectedTasks = tasks;
  if (options.onlyTitle) {
    selectedTasks = tasks.filter((t) => t.backupName === options.onlyTitle);
  } else if (Array.isArray(options.onlyTitles) && options.onlyTitles.length > 0) {
    const selectedTitleSet = new Set(options.onlyTitles);
    selectedTasks = tasks.filter((t) => selectedTitleSet.has(t.backupName));
  }

  const activeTasks = selectedTasks.filter((t) => t.enabled !== false);

  if (activeTasks.length === 0) {
    logger.warn("No enabled tasks matched the current filter.");
    return { total: 0, succeeded: 0, failed: 0, results: [], cancelled: false };
  }

  const emitEvent = (event: RunProgressEvent) => {
    if (typeof options.onEvent === "function") {
      options.onEvent(event);
    }
  };

  emitEvent({
    type: "run-start",
    taskNames: activeTasks.map((task) => task.backupName),
    totalTasks: activeTasks.length,
  });

  const zipPassword = await resolveRunZipPasswordIfNeeded(
    activeTasks,
    logger,
    options.zipPassword
  );

  const runController = new AbortController();
  if (options.signal) {
    options.signal.addEventListener("abort", () => {
      runController.abort();
    });
  }

  const runOptions = { ...options, signal: runController.signal };
  const results: TaskRunResult[] = [];
  let firstError: Error | null = null;

  if (options.parallel) {
    await Promise.all(
      activeTasks.map(async (task) => {
        const result = await executeTask(task, logger, runOptions, zipPassword, emitEvent);
        results.push(result);
        if (!result.success && options.stopOnError && !firstError) {
          firstError = new Error(result.error || `Task failed: ${task.backupName}`);
          runController.abort();
        }
      })
    );
  } else {
    for (const task of activeTasks) {
      throwIfAborted(runController.signal);
      const result = await executeTask(task, logger, runOptions, zipPassword, emitEvent);
      results.push(result);
      if (!result.success && options.stopOnError) {
        firstError = new Error(result.error || `Task failed: ${task.backupName}`);
        runController.abort();
        break;
      }
    }
  }

  const failed = results.filter((x) => !x.success).length;
  const succeeded = results.length - failed;
  logger.info(
    `Run complete. total=${results.length} succeeded=${succeeded} failed=${failed}`
  );

  const summary: RunSummary = {
    total: results.length,
    succeeded,
    failed,
    results,
    cancelled: runController.signal.aborted,
  };

  if (summary.cancelled) {
    emitEvent({ type: "run-cancelled", reason: "Canceled by user or fail-fast trigger." });
  }
  emitEvent({ type: "run-complete", summary });

  if (firstError && options.stopOnError) {
    throw firstError;
  }
  return summary;
}

import path from "node:path";
import { copyPathToDirectory, ensureDir } from "../core/fs-utils.js";

function normalizeInputPath(inputPath) {
  if (path.isAbsolute(inputPath) || path.win32.isAbsolute(inputPath)) {
    return inputPath;
  }
  return path.resolve(inputPath);
}

export async function collectLocalSource(task, ctx) {
  const { stagingDir, logger } = ctx;
  const { paths } = task.source;
  await ensureDir(stagingDir);

  for (const sourcePath of paths) {
    const resolved = normalizeInputPath(sourcePath);
    logger.info(`Collecting local path: ${resolved}`);
    await copyPathToDirectory(resolved, stagingDir);
  }
}

export const collectNetworkSource = collectLocalSource;

import { promises as fs } from "node:fs";
import path from "node:path";

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function removeDir(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
}

export async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function walkFiles(rootDir) {
  const out = [];
  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile()) {
        out.push(abs);
      }
    }
  }
  await walk(rootDir);
  return out;
}

export function sanitizePathSegment(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, "-");
}

export async function copyPathToDirectory(sourcePath, destinationDir) {
  const stat = await fs.stat(sourcePath);
  const baseName = sanitizePathSegment(path.basename(sourcePath) || "source");
  let finalTarget = path.join(destinationDir, baseName);
  let idx = 1;
  while (await pathExists(finalTarget)) {
    finalTarget = path.join(destinationDir, `${baseName}-${idx}`);
    idx += 1;
  }

  if (stat.isDirectory()) {
    await fs.cp(sourcePath, finalTarget, { recursive: true, force: true });
  } else if (stat.isFile()) {
    await ensureDir(path.dirname(finalTarget));
    await fs.copyFile(sourcePath, finalTarget);
  }
  return finalTarget;
}

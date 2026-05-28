import path from "node:path";
import fg from "fast-glob";
import { promises as fs } from "node:fs";
import { ensureDir, pathExists } from "../core/fs-utils.js";

function envPath(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable is missing: ${key}`);
  }
  return value;
}

async function copyIfExists(source, destination, logger) {
  if (!(await pathExists(source))) {
    logger.warn(`Bookmark file not found: ${source}`);
    return false;
  }
  await ensureDir(path.dirname(destination));
  await fs.copyFile(source, destination);
  return true;
}

async function collectChrome(stagingDir, logger) {
  if (process.platform !== "win32") {
    logger.warn("Chrome bookmark adapter currently targets Windows paths.");
    return;
  }

  const localAppData = envPath("LOCALAPPDATA");
  const sourcePath = path.join(
    localAppData,
    "Google",
    "Chrome",
    "User Data",
    "Default",
    "Bookmarks"
  );
  const destPath = path.join(stagingDir, "chrome", "Default", "Bookmarks");
  await copyIfExists(sourcePath, destPath, logger);
}

async function collectFirefox(stagingDir, logger) {
  if (process.platform !== "win32") {
    logger.warn("Firefox bookmark adapter currently targets Windows paths.");
    return;
  }

  const appData = envPath("APPDATA");
  const profilesRoot = path.join(appData, "Mozilla", "Firefox", "Profiles");
  const profileDirs = await fg("*", {
    cwd: profilesRoot,
    onlyDirectories: true,
    absolute: true,
  });

  for (const profilePath of profileDirs) {
    const profileName = path.basename(profilePath);

    const places = path.join(profilePath, "places.sqlite");
    await copyIfExists(
      places,
      path.join(stagingDir, "firefox", profileName, "places.sqlite"),
      logger
    );

    const backups = await fg("bookmarkbackups/*.jsonlz4", {
      cwd: profilePath,
      absolute: true,
      onlyFiles: true,
    });

    for (const backupFile of backups) {
      const backupName = path.basename(backupFile);
      await copyIfExists(
        backupFile,
        path.join(stagingDir, "firefox", profileName, "bookmarkbackups", backupName),
        logger
      );
    }
  }
}

export async function collectBookmarksSource(task, ctx) {
  const { stagingDir, logger } = ctx;
  await ensureDir(stagingDir);
  const browsers = task.source.browsers;

  for (const browser of browsers) {
    logger.info(`Collecting bookmarks: ${browser}`);
    if (browser === "chrome") {
      await collectChrome(stagingDir, logger);
      continue;
    }
    if (browser === "firefox") {
      await collectFirefox(stagingDir, logger);
      continue;
    }
    logger.warn(`Unsupported bookmarks browser: ${browser}`);
  }
}

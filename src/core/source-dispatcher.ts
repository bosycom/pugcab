import { collectLocalSource, collectNetworkSource } from "../sources/local.js";
import { collectSshSource } from "../sources/ssh.js";
import { collectBookmarksSource } from "../sources/bookmarks.js";
import { collectMtpSource } from "../sources/mtp.js";

export async function collectTaskSource(task, ctx) {
  if (typeof task.execution === "function") {
    await task.execution(ctx);
    return;
  }

  if (!task.source) {
    throw new Error(`Task "${task.backupName}" does not define a source.`);
  }

  switch (task.source.type) {
    case "local":
      await collectLocalSource(task, ctx);
      return;
    case "network":
      await collectNetworkSource(task, ctx);
      return;
    case "ssh":
      await collectSshSource(task, ctx);
      return;
    case "bookmarks":
      await collectBookmarksSource(task, ctx);
      return;
    case "mtp":
      await collectMtpSource(task, ctx);
      return;
    default:
      throw new Error(`Unsupported source type: ${task.source.type}`);
  }
}

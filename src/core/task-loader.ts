import path from "node:path";
import { promises as fs } from "node:fs";
import { pathToFileURL } from "node:url";
import { taskListSchema } from "./task-schema.js";

function parseAndValidate(rawTasks: unknown, absPath: string) {
  const parsed = taskListSchema.safeParse(rawTasks);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid task config in ${absPath}: ${details}`);
  }
  return parsed.data;
}

export async function loadTasks(configPath) {
  const absPath = path.resolve(configPath);
  const ext = path.extname(absPath).toLowerCase();

  if (ext === ".json") {
    const rawText = await fs.readFile(absPath, "utf8");
    const rawTasks = JSON.parse(rawText);
    return parseAndValidate(rawTasks, absPath);
  }

  const fileUrl = pathToFileURL(absPath).href;
  const mod = await import(fileUrl);
  const rawTasks = mod.default ?? mod.tasks;
  return parseAndValidate(rawTasks, absPath);
}

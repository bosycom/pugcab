#!/usr/bin/env node
import path from "node:path";
import { Command } from "commander";
import inquirer from "inquirer";
import { loadTasks } from "../core/task-loader.js";
import { runTasks } from "../core/runner.js";
import { logger } from "../core/logger.js";

const ALL_TASKS_VALUE = "__ALL_TASKS__";

async function promptForTaskSelection(tasks) {
  const choices = [
    { name: "All", value: ALL_TASKS_VALUE },
    ...tasks.map((task) => ({
      name: task.description
        ? `${task.backupName} - ${task.description}`
        : task.backupName,
      value: task.backupName,
    })),
  ];

  const { selectedTaskTitles } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selectedTaskTitles",
      message: "Select backup task(s) to run",
      choices,
      validate: (selectedValues) =>
        selectedValues.length > 0 ? true : "Select at least one task.",
    },
  ]);

  if (selectedTaskTitles.includes(ALL_TASKS_VALUE)) {
    return tasks.map((task) => task.backupName);
  }

  return selectedTaskTitles;
}

async function main() {
  const program = new Command();
  program
    .name("backup-script")
    .description("Config-first backup runner")
    .option("-c, --config <path>", "Path to task config file", "./backup.tasks.json")
    .option("-t, --task <backupName>", "Run only one task by exact backup name");

  program.parse(process.argv);
  const opts = program.opts();
  const configPath = path.resolve(opts.config);

  logger.info(`Loading config: ${configPath}`);
  const tasks = await loadTasks(configPath);

  const selectableTasks = opts.task
    ? tasks.filter((task) => task.backupName === opts.task)
    : tasks;

  if (selectableTasks.length === 0) {
    logger.warn("No tasks matched the provided task filter.");
    return;
  }

  const selectedTaskTitles = await promptForTaskSelection(selectableTasks);

  const summary = await runTasks(tasks, logger, {
    onlyTitles: selectedTaskTitles,
    parallel: true,
    stopOnError: true,
  });

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  logger.error("Backup run crashed", error.stack || error.message);
  process.exitCode = 1;
});

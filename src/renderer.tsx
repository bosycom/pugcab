import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  Field,
  Flex,
  Heading,
  HStack,
  Input,
  Progress,
  Separator,
  Spinner,
  Stack,
  Text,
  ChakraProvider,
  createSystem,
  defaultConfig,
  Badge,
} from "@chakra-ui/react";
import { AnimatePresence, motion } from "framer-motion";
import type { RunProgressEvent, RunSummary, UiTask } from "./shared/contracts.js";

type TaskRuntimeState = {
  percent: number;
  status: "idle" | "running" | "success" | "failed";
  message: string;
  durationMs?: number;
  error?: string;
};

const system = createSystem(defaultConfig);
const MotionBox = motion.create(Box);

function App() {
  const [configPath, setConfigPath] = useState<string>("backup.tasks.json");
  const [tasks, setTasks] = useState<UiTask[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [taskState, setTaskState] = useState<Record<string, TaskRuntimeState>>({});
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string>("");
  const [zipPassword, setZipPassword] = useState("");
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [pendingRun, setPendingRun] = useState(false);
  const apiReady = Boolean(window.backupApi);

  const hasEncryptedSelected = useMemo(() => {
    const selectedSet = new Set(selected);
    return tasks.some((task) => selectedSet.has(task.backupName) && task.zipEnabled);
  }, [selected, tasks]);

  const selectedCount = selected.length;
  const allSelected = tasks.length > 0 && selected.length === tasks.length;

  async function loadTaskList(path: string) {
    if (!window.backupApi) {
      setRunError("Desktop bridge is unavailable. Start this UI through Electron.");
      return;
    }
    setLoadingTasks(true);
    setRunError("");
    try {
      const data = await window.backupApi.listTasks(path);
      setTasks(data);
      setSelected(data.filter((task) => task.enabled).map((task) => task.backupName));
      setTaskState({});
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRunError(message);
      setTasks([]);
      setSelected([]);
    } finally {
      setLoadingTasks(false);
    }
  }

  async function executeRun(password?: string) {
    if (!window.backupApi) {
      setRunError("Desktop bridge is unavailable. Start this UI through Electron.");
      return;
    }
    setRunError("");
    setRunning(true);
    try {
      const summary: RunSummary = await window.backupApi.runTasks({
        configPath,
        selectedTaskNames: selected,
        zipPassword: password,
      });
      if (summary.failed > 0) {
        setRunError("Run ended with errors.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRunError(message);
    } finally {
      setRunning(false);
    }
  }

  async function onRunClicked() {
    if (selected.length === 0) {
      setRunError("Select at least one task.");
      return;
    }
    if (hasEncryptedSelected && !zipPassword) {
      setPendingRun(true);
      setShowPasswordPrompt(true);
      return;
    }
    await executeRun(zipPassword || undefined);
  }

  async function onCancelClicked() {
    if (!window.backupApi) {
      return;
    }
    await window.backupApi.cancelRun();
  }

  useEffect(() => {
    if (!window.backupApi) {
      setRunError("Desktop bridge is unavailable. Start this UI through Electron.");
      return;
    }
    const off = window.backupApi.onProgress((event: RunProgressEvent) => {
      if (event.type === "run-start") {
        const next: Record<string, TaskRuntimeState> = {};
        for (const taskName of event.taskNames) {
          next[taskName] = {
            percent: 0,
            status: "idle",
            message: "Queued",
          };
        }
        setTaskState(next);
        return;
      }

      if (event.type === "task-start") {
        setTaskState((prev) => ({
          ...prev,
          [event.backupName]: {
            percent: event.percent,
            status: "running",
            message: event.message,
          },
        }));
        return;
      }

      if (event.type === "task-progress") {
        setTaskState((prev) => ({
          ...prev,
          [event.backupName]: {
            ...(prev[event.backupName] ?? {
              status: "running",
              message: "Running",
            }),
            percent: event.percent,
            status: "running",
            message: event.message,
          },
        }));
        return;
      }

      if (event.type === "task-success") {
        setTaskState((prev) => ({
          ...prev,
          [event.backupName]: {
            percent: 100,
            status: "success",
            message: "Completed",
            durationMs: event.durationMs,
          },
        }));
        return;
      }

      if (event.type === "task-failed") {
        setTaskState((prev) => ({
          ...prev,
          [event.backupName]: {
            percent: event.percent,
            status: "failed",
            message: "Failed",
            durationMs: event.durationMs,
            error: event.error,
          },
        }));
        return;
      }

      if (event.type === "run-cancelled") {
        setRunError(event.reason);
      }
    });
    return off;
  }, []);

  useEffect(() => {
    if (window.backupApi) {
      void loadTaskList(configPath);
    }
  }, []);

  const taskRows = tasks.map((task) => {
    const runtime = taskState[task.backupName];
    const checked = selected.includes(task.backupName);
    return (
      <MotionBox
        key={task.backupName}
        p="3"
        borderWidth="1px"
        borderColor="border.emphasized"
        rounded="sm"
        bg="bg.subtle"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Flex justify="space-between" align="center" gap="4">
          <HStack gap="3" align="flex-start">
            <Checkbox.Root
              checked={checked}
              onCheckedChange={(details) => {
                const isChecked = Boolean(details.checked);
                setSelected((prev) =>
                  isChecked
                    ? [...prev, task.backupName]
                    : prev.filter((name) => name !== task.backupName)
                );
              }}
              disabled={running}
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control />
            </Checkbox.Root>
            <Stack gap="1">
              <Text fontWeight="semibold">{task.backupName}</Text>
              <Text color="fg.muted" fontSize="sm">
                {task.description || "No description"}
              </Text>
              <HStack gap="2">
                <Badge>{task.sourceType}</Badge>
                {task.zipEnabled ? <Badge colorPalette="purple">zip+enc</Badge> : <Badge>copy</Badge>}
              </HStack>
            </Stack>
          </HStack>
          <Stack align="flex-end" minW="240px">
            <Progress.Root
              maxW="240px"
              value={runtime?.percent ?? 0}
              size="sm"
              width="100%"
              colorPalette={
                runtime?.status === "failed"
                  ? "red"
                  : runtime?.status === "success"
                    ? "green"
                    : "blue"
              }
            >
              <Progress.Track>
                <Progress.Range />
              </Progress.Track>
            </Progress.Root>
            <Text fontSize="xs" color="fg.muted">
              {runtime?.message ?? "Idle"} {runtime?.durationMs ? `(${runtime.durationMs}ms)` : ""}
            </Text>
            {runtime?.error ? (
              <Text fontSize="xs" color="fg.error" maxW="240px" textAlign="right">
                {runtime.error}
              </Text>
            ) : null}
          </Stack>
        </Flex>
      </MotionBox>
    );
  });

  return (
    <Box bg="bg" minH="100vh" color="fg" p={{ base: "4", md: "6" }}>
      <Stack gap="5" maxW="1200px" mx="auto">
        <Flex justify="space-between" align="center" gap="4">
          <Heading size="lg">Backup Runner</Heading>
          <HStack>
            {loadingTasks ? <Spinner size="sm" /> : null}
            <Text fontSize="sm" color="fg.muted">
              {selectedCount} selected
            </Text>
          </HStack>
        </Flex>

        <Flex gap="3" align="end" wrap="wrap">
          <Field.Root maxW="680px" flex="1 1 460px">
            <Field.Label>Task Config Path</Field.Label>
            <Input
              value={configPath}
              onChange={(event) => setConfigPath(event.target.value)}
              disabled={running || !apiReady}
            />
          </Field.Root>
          <Button
            variant="outline"
            colorPalette="gray"
            onClick={async () => {
              if (!window.backupApi) {
                return;
              }
              const pickedPath = await window.backupApi.pickConfigPath();
              if (pickedPath) {
                setConfigPath(pickedPath);
                await loadTaskList(pickedPath);
              }
            }}
            disabled={running || !apiReady}
          >
            Browse
          </Button>
          <Button
            variant="outline"
            colorPalette="gray"
            onClick={() => void loadTaskList(configPath)}
            disabled={running || !apiReady}
          >
            Reload
          </Button>
        </Flex>

        <Flex gap="3" wrap="wrap">
          <Button
            onClick={() => {
              setSelected(allSelected ? [] : tasks.map((task) => task.backupName));
            }}
            variant="outline"
            colorPalette="gray"
            disabled={running || tasks.length === 0 || !apiReady}
          >
            {allSelected ? "Clear Selection" : "Select All"}
          </Button>
          <Button
            variant="solid"
            colorPalette="blue"
            onClick={() => void onRunClicked()}
            disabled={running || selected.length === 0 || !apiReady}
          >
            Run Selected
          </Button>
          <Button
            colorPalette="red"
            variant="outline"
            onClick={() => void onCancelClicked()}
            disabled={!running}
          >
            Cancel Run
          </Button>
        </Flex>

        {runError ? (
          <Box p="3" rounded="sm" borderWidth="1px" borderColor="border.error" bg="bg.error">
            <Text color="fg.error">{runError}</Text>
          </Box>
        ) : null}

        <Separator borderColor="border" />

        <Stack gap="3">
          <Heading size="md">Tasks</Heading>
          <AnimatePresence>{taskRows}</AnimatePresence>
        </Stack>
      </Stack>

      <Dialog.Root
        open={showPasswordPrompt}
        onOpenChange={(details) => {
          setShowPasswordPrompt(details.open);
        }}
      >
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content bg="bg.subtle" borderColor="border.emphasized">
            <Dialog.Header>
              <Dialog.Title>ZIP Password</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Stack gap="3">
                <Text color="fg.muted">At least one selected task requires ZIP encryption.</Text>
                <Input
                  type="password"
                  value={zipPassword}
                  onChange={(event) => setZipPassword(event.target.value)}
                />
              </Stack>
            </Dialog.Body>
            <Dialog.Footer>
              <Button
                variant="outline"
                colorPalette="gray"
                onClick={() => {
                  setShowPasswordPrompt(false);
                  setPendingRun(false);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="solid"
                colorPalette="blue"
                onClick={async () => {
                  setShowPasswordPrompt(false);
                  if (pendingRun) {
                    setPendingRun(false);
                    await executeRun(zipPassword || undefined);
                  }
                }}
                disabled={!zipPassword}
              >
                Continue
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>
    </Box>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ChakraProvider value={system}>
      <App />
    </ChakraProvider>
  </StrictMode>
);

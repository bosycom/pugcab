import { z } from "zod";

const zipSchema = z.object({
  enableEncryption: z.boolean().optional(),
  compressionLevel: z.number().int().min(0).max(9).default(1),
});

const localSource = z.object({
  type: z.literal("local"),
  paths: z.array(z.string().min(1)).min(1),
});

const networkSource = z.object({
  type: z.literal("network"),
  paths: z.array(z.string().min(1)).min(1),
});

const sshSource = z.object({
  type: z.literal("ssh"),
  host: z.string().min(1),
  port: z.number().int().positive().default(22),
  username: z.string().min(1),
  passwordEnv: z.string().min(1).optional(),
  privateKeyPath: z.string().min(1).optional(),
  hostFingerprint: z.string().min(1),
  remotePaths: z.array(z.string().min(1)).min(1),
});

const bookmarksSource = z.object({
  type: z.literal("bookmarks"),
  browsers: z.array(z.enum(["chrome", "firefox"])).min(1),
});

const mtpSource = z.object({
  type: z.literal("mtp"),
  paths: z.array(z.string().min(1)).min(1),
});

const sourceSchema = z.discriminatedUnion("type", [
  localSource,
  networkSource,
  sshSource,
  bookmarksSource,
  mtpSource,
]);

export const taskSchema = z
  .object({
    backupName: z.string().min(1),
    description: z.string().optional(),
    targetPath: z.string().min(1),
    source: sourceSchema.optional(),
    zip: zipSchema.optional(),
    enabled: z.boolean().default(true),
    execution: z.unknown().optional(),
  })
  .superRefine((task, ctx) => {
    if (task.execution !== undefined && typeof task.execution !== "function") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["execution"],
        message: "execution must be a function",
      });
    }
    if (!task.source && !task.execution) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Task must define either source or execution.",
      });
    }
  });

export const taskListSchema = z.array(taskSchema);

export type BackupTask = z.infer<typeof taskSchema>;
export type BackupTaskList = z.infer<typeof taskListSchema>;

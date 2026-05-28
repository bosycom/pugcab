import path from "node:path";
import { promises as fs } from "node:fs";
import SftpClient from "ssh2-sftp-client";
import { ensureDir } from "../core/fs-utils.js";

function normalizeRemotePath(remotePath) {
  return remotePath.replace(/^\/+/, "");
}

async function downloadEntry(sftp, remotePath, localPath, logger) {
  const stat = await sftp.stat(remotePath);
  if (stat.isDirectory || stat.type === "d") {
    await ensureDir(localPath);
    const entries = await sftp.list(remotePath);
    for (const entry of entries) {
      const childRemote = `${remotePath.replace(/\/+$/, "")}/${entry.name}`;
      const childLocal = path.join(localPath, entry.name);
      await downloadEntry(sftp, childRemote, childLocal, logger);
    }
    return;
  }

  await ensureDir(path.dirname(localPath));
  logger.info(`Downloading ${remotePath}`);
  await sftp.fastGet(remotePath, localPath);
}

export async function collectSshSource(task, ctx) {
  const { stagingDir, logger } = ctx;
  const source = task.source;
  const sftp = new SftpClient();
  const connection: any = {
    host: source.host,
    port: source.port ?? 22,
    username: source.username,
    hostHash: "sha256",
    hostVerifier: (hashedKey) => {
      const expected = source.hostFingerprint.replace(/^SHA256:/i, "");
      const actual = hashedKey.replace(/^SHA256:/i, "");
      return actual === expected;
    },
  };

  if (source.passwordEnv) {
    connection.password = process.env[source.passwordEnv];
    if (!connection.password) {
      throw new Error(`Missing SSH password env var: ${source.passwordEnv}`);
    }
  }
  if (source.privateKeyPath) {
    connection.privateKey = await fs.readFile(source.privateKeyPath, "utf8");
  }

  await sftp.connect(connection);
  try {
    for (const remotePath of source.remotePaths) {
      const safeRemote = normalizeRemotePath(remotePath) || "root";
      const localRoot = path.join(stagingDir, source.host, safeRemote);
      await downloadEntry(sftp, remotePath, localRoot, logger);
    }
  } finally {
    await sftp.end();
  }
}

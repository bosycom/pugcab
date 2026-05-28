import fs from "node:fs";
import archiver from "archiver";
import zipEncrypted from "archiver-zip-encrypted";
import cliProgress from "cli-progress";
import { walkFiles } from "./fs-utils.js";

archiver.registerFormat("zip-encrypted", zipEncrypted);

export async function createZipArchive({
  sourceDir,
  outputFile,
  password,
  enableEncryption = false,
  compressionLevel = 1,
  logger,
  signal,
  onProgress,
}) {
  if (signal?.aborted) {
    throw new Error("Run canceled.");
  }
  const files = await walkFiles(sourceDir);
  const totalFiles = files.length;

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(outputFile);
    const bar = new cliProgress.SingleBar(
      {
        format: "Archive [{bar}] {percentage}% | {value}/{total} files",
        hideCursor: true,
      },
      cliProgress.Presets.shades_classic
    );

    const archive = enableEncryption
      ? archiver("zip-encrypted", {
          zlib: { level: compressionLevel },
          encryptionMethod: "aes256",
          password,
        })
      : archiver("zip", {
          zlib: { level: compressionLevel },
        });

    output.on("close", () => {
      if (totalFiles > 0) {
        bar.update(totalFiles);
      }
      bar.stop();
      resolve();
    });
    output.on("error", reject);
    archive.on("error", reject);
    archive.on("warning", (err) => logger.warn("Archive warning", err.message));

    bar.start(totalFiles || 1, 0);
    archive.on("entry", () => {
      const next = Math.min(bar.value + 1, totalFiles || 1);
      bar.update(next);
      if (totalFiles > 0 && typeof onProgress === "function") {
        onProgress(next / totalFiles);
      }
      if (signal?.aborted) {
        reject(new Error("Run canceled."));
        archive.abort();
      }
    });

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize().catch(reject);
  });
}

import path from "node:path";
import { spawn } from "node:child_process";
import os from "node:os";
import { promises as fs } from "node:fs";
import { ensureDir, removeDir, sanitizePathSegment } from "../core/fs-utils.js";

const MTP_PS_SCRIPT = String.raw`param(
  [Parameter(Mandatory = $true)][string]$SourcePath,
  [Parameter(Mandatory = $true)][string]$DestinationPath
)

$ErrorActionPreference = "Stop"

function Get-MtpFolderByPath {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  $shell = New-Object -ComObject Shell.Application
  $root = $shell.Namespace(17) # This PC
  if (-not $root) {
    throw "Unable to open This PC namespace."
  }

  $segments = $Path -split "[\\/]" | Where-Object { $_ -and $_.Trim().Length -gt 0 }
  $currentFolder = $root

  foreach ($segment in $segments) {
    $found = $null
    foreach ($item in $currentFolder.Items()) {
      if ($item.Name -eq $segment) {
        $found = $item
        break
      }
    }
    if (-not $found) {
      throw "MTP segment not found: $segment (path: $Path)"
    }

    $nextFolder = $found.GetFolder
    if (-not $nextFolder) {
      throw "MTP segment is not a folder: $segment"
    }
    $currentFolder = $nextFolder
  }

  return $currentFolder
}

if (-not (Test-Path -LiteralPath $DestinationPath)) {
  New-Item -ItemType Directory -Path $DestinationPath -Force | Out-Null
}

$resolvedDestination = (Resolve-Path -LiteralPath $DestinationPath).Path
$shell = New-Object -ComObject Shell.Application
$destFolder = $shell.Namespace($resolvedDestination)
if (-not $destFolder) {
  throw "Unable to open destination folder: $resolvedDestination"
}

$sourceFolder = Get-MtpFolderByPath -Path $SourcePath
$items = @($sourceFolder.Items())
if ($items.Count -eq 0) {
  Write-Host "No items found under MTP path: $SourcePath"
  exit 0
}

foreach ($item in $items) {
  Write-Host "Copying: $($item.Name)"
  $destFolder.CopyHere($item, 16) # 16 = No UI
}

Start-Sleep -Seconds 5
Write-Host "MTP copy request submitted for $($items.Count) item(s)."
`;

async function writeTempMtpScript() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "backup-mtp-"));
  const scriptPath = path.join(dir, "copy-mtp.ps1");
  await fs.writeFile(scriptPath, MTP_PS_SCRIPT, "utf8");
  return { dir, scriptPath };
}

function runMtpCopy({ sourcePath, destinationPath, scriptPath }) {
  return new Promise<void>((resolve, reject) => {
    const args = [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-SourcePath",
      sourcePath,
      "-DestinationPath",
      destinationPath,
    ];

    const child = spawn("powershell.exe", args, { stdio: "pipe" });
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      process.stderr.write(chunk);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`MTP copy failed (exit ${code}): ${stderr.trim()}`));
    });
  });
}

export async function collectMtpSource(task, ctx) {
  const { stagingDir, logger } = ctx;
  if (process.platform !== "win32") {
    throw new Error("MTP source is currently implemented for Windows only.");
  }

  const tmp = await writeTempMtpScript();
  try {
    await ensureDir(stagingDir);
    for (const sourcePath of task.source.paths) {
      const leaf = sanitizePathSegment(sourcePath.split(/[\\/]/).pop() || "mtp-source");
      const destinationPath = path.join(stagingDir, "mtp", leaf);
      await ensureDir(destinationPath);
      logger.info(`Collecting MTP path: ${sourcePath}`);
      await runMtpCopy({ sourcePath, destinationPath, scriptPath: tmp.scriptPath });
    }
  } finally {
    await removeDir(tmp.dir);
  }
}

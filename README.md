# backup-script

Electron desktop backup runner (React + TypeScript) with CLI compatibility.

## What It Does

- Loads tasks from `backup.tasks.json` (or `.js` config)
- Lets you select tasks in desktop UI or CLI
- Runs tasks through core adapters (`local`, `network`, `ssh`, `mtp`, `bookmarks`)
- Produces ZIP or copied-folder outputs per task
- Supports encrypted ZIPs

## Prerequisites

- Node.js 20+
- npm 10+
- Linux/Windows/macOS for dev
- Windows for full MTP runtime behavior

## Quick Start

```bash
npm install
npm run forge-start
```

CLI still works:

```bash
npm run backup
```

## Task Config

Default config file is `backup.tasks.json`.

Each task requires:
- `backupName`
- `targetPath`
- one of:
  - `source`
  - `execution` function (JS config only)

If any selected task enables encryption (`zip.enableEncryption: true`), password is required:
- prefer `BACKUP_ZIP_PASSWORD`
- otherwise app prompts once per run

## Runbook

### 1) Local Development (desktop app)

```bash
npm run dev
```

- Starts Vite renderer + Electron together
- For Forge-integrated dev start:

```bash
npm run forge-start
```

### 2) Build

```bash
npm run build
```

- Compiles Node/Electron code to `dist-node/`
- Builds renderer to `dist/renderer/`

### 3) Package Windows App (from Linux/macOS/Windows)

```bash
npm run forge-package:win
```

Output folder:
- `out/backup-app-win32-x64/`

Important: **do not copy only `backup-app.exe`**. Copy/run the full folder, or use zip artifact.

### 4) Make Windows Distributable Artifact

```bash
npm run forge-make:win
```

Primary artifact:
- `out/make/zip/win32/x64/backup-app-win32-x64-<version>.zip`

### 5) Run CLI Mode

```bash
npm run backup
npm run backup -- --task "Thunderbird profiles"
npm run backup -- --config ./backup.tasks.example.js
```

### 6) Bundle CLI as Single JS File

```bash
npm run bundle
node dist/backup-script.bundle.cjs --config ./backup.tasks.js
```

## npm Scripts Explained

- `build:node`  
  Compile Electron main/preload/core TS into `dist-node/`.

- `build:renderer`  
  Build React renderer with Vite into `dist/renderer/`.

- `build`  
  Runs `build:node` then `build:renderer`.

- `dev:renderer`  
  Starts Vite dev server for renderer only.

- `dev:electron`  
  Starts Electron pointed at Vite dev URL.

- `dev`  
  Runs renderer and Electron dev processes together.

- `start`  
  Alias to `forge-start` (with prebuild).

- `forge-start`  
  Starts app via Electron Forge.

- `forge-package`  
  Generic Forge package command.

- `forge-package:win`  
  Packages app for Windows x64.

- `forge-make`  
  Generic Forge make command.

- `forge-make:win`  
  Creates Windows make artifacts (zip on non-Windows hosts).

- `backup`  
  Runs CLI backup workflow.

- `backup:example`  
  Runs CLI using `backup.tasks.example.js`.

- `bundle`  
  Bundles CLI to one CJS file.

## Troubleshooting

- **No GUI on Linux VM**  
  Use `npm run forge-start` from project root.  
  Check runtime logs for renderer crashes and shared-memory issues.

- **Windows executable launches but no app window**  
  Ensure you copied the full packaged directory, not only `backup-app.exe`.

- **`ERR_FILE_NOT_FOUND` in renderer assets**  
  Rebuild with `npm run build`; renderer uses `./assets/...` paths for `file://`.

## Guides

- SSH setup: [docs/ssh-setup-debian.md](/code/backup-script/docs/ssh-setup-debian.md)

## Output Naming

Archive filename format:

`YYYY-MM-dd_HH-mm-ss_<backupName-as-dash-case>.zip`

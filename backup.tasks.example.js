export default [
  {
    backupName: "Thunderbird profiles",
    description: "Backup of Thunderbird email profiles",
    targetPath: "D:\\Backups",
    source: {
      type: "local",
      paths: ["C:\\Users\\<USER>\\AppData\\Roaming\\Thunderbird\\Profiles"],
    },
    zip: {
      enableEncryption: true,
      compressionLevel: 1,
    },
  },
  {
    backupName: "Chrome and Firefox bookmarks",
    description: "Backup of browser bookmark data",
    targetPath: "D:\\Backups",
    source: {
      type: "bookmarks",
      browsers: ["chrome", "firefox"],
    },
    zip: {
      enableEncryption: true,
      compressionLevel: 1,
    },
  },
  {
    backupName: "Android media via MTP",
    description: "Backup Android DCIM from cable-connected phone",
    targetPath: "D:\\Backups",
    source: {
      type: "mtp",
      paths: ["Android\\Internal shared storage\\DCIM"],
    },
    zip: {
      enableEncryption: true,
      compressionLevel: 1,
    },
  },
  {
    backupName: "Debian remote /etc",
    description: "Backup remote configs over SSH/SFTP",
    targetPath: "D:\\Backups",
    source: {
      type: "ssh",
      host: "debian.example.internal",
      port: 22,
      username: "backup-user",
      privateKeyPath: "C:\\Users\\<USER>\\.ssh\\id_ed25519",
      hostFingerprint: "<SHA256_HOST_FINGERPRINT>",
      remotePaths: ["/etc"],
    },
    zip: {
      enableEncryption: true,
      compressionLevel: 1,
    },
  },
];

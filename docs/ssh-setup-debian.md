# Debian SSH Backup Setup

This guide configures a Debian host for secure backups over SSH/SFTP with host key verification.

## 1) Install and enable SSH server

```bash
sudo apt update
sudo apt install -y openssh-server
sudo systemctl enable ssh
sudo systemctl start ssh
sudo systemctl status ssh
```

## 2) Create restricted backup user

```bash
sudo adduser backup-user
```

Grant only the directories required for backup (example: `/etc`, `/var/backups/app`):

```bash
sudo usermod -aG adm backup-user
```

Use least privilege for your environment.

## 3) Configure key-based authentication

On the backup runner machine (Windows PowerShell):

```powershell
ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\id_ed25519
```

Copy public key to Debian:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
cat >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

## 4) Harden sshd_config

Edit `/etc/ssh/sshd_config`:

```conf
PasswordAuthentication no
PubkeyAuthentication yes
PermitRootLogin no
AllowUsers backup-user
X11Forwarding no
```

Restart SSH:

```bash
sudo systemctl restart ssh
```

## 5) Capture and pin host key fingerprint

From backup runner machine:

```bash
ssh-keyscan -t ed25519 debian.example.internal > hostkey.pub
ssh-keygen -lf hostkey.pub -E sha256
```

Use the `SHA256:...` value (without prefix if your runtime expects plain hash). Put it in task config as `hostFingerprint`.

## 6) Firewall baseline

```bash
sudo apt install -y ufw
sudo ufw allow OpenSSH
sudo ufw enable
sudo ufw status
```

## 7) Example task snippet

```js
{
  title: "Debian remote /etc",
  targetPath: "D:\\Backups",
  source: {
    type: "ssh",
    host: "debian.example.internal",
    port: 22,
    username: "backup-user",
    privateKeyPath: "C:\\Users\\you\\.ssh\\id_ed25519",
    hostFingerprint: "<SHA256_HOST_FINGERPRINT>",
    remotePaths: ["/etc"]
  },
  zip: {
    passwordEnv: "BACKUP_ZIP_PASSWORD",
    compressionLevel: 1
  }
}
```

## 8) Validate connectivity

```bash
ssh backup-user@debian.example.internal
```

Then run backup script task.

function isTerminalReady() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function promptHidden(question: string) {
  return new Promise<string>((resolve, reject) => {
    if (!isTerminalReady()) {
      reject(new Error("Cannot prompt for password: interactive TTY is required."));
      return;
    }

    const stdin = process.stdin;
    let value = "";
    let done = false;

    function cleanup() {
      stdin.removeListener("data", onData);
      if (stdin.isTTY) {
        stdin.setRawMode(false);
      }
      stdin.pause();
    }

    function finish(result: string) {
      if (done) return;
      done = true;
      cleanup();
      process.stdout.write("\n");
      resolve(result);
    }

    function fail(err: Error) {
      if (done) return;
      done = true;
      cleanup();
      process.stdout.write("\n");
      reject(err);
    }

    function onData(buffer: Buffer) {
      const text = buffer.toString("utf8");
      for (const ch of text) {
        if (ch === "\u0003") {
          fail(new Error("Password input canceled by user."));
          return;
        }
        if (ch === "\r" || ch === "\n") {
          finish(value);
          return;
        }
        if (ch === "\u007f" || ch === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        if (ch === "\u001b") {
          continue;
        }
        value += ch;
      }
    }

    process.stdout.write(question);
    stdin.resume();
    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.on("data", onData);
  });
}

export async function promptForPasswordWithConfirmation(label = "ZIP password"): Promise<string> {
  for (;;) {
    const first = await promptHidden(`Enter ${label}: `);
    if (!first) {
      console.log("Password cannot be empty.");
      continue;
    }

    const second = await promptHidden(`Confirm ${label}: `);
    if (first !== second) {
      console.log("Passwords do not match. Try again.");
      continue;
    }
    return first;
  }
}

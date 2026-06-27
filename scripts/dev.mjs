import { spawn } from "node:child_process";

const commands = [
  ["ml-api", "node", ["scripts/ml-server.mjs"]],
  ["vite", "vite", ["--host", "127.0.0.1"]],
];

const children = commands.map(([name, command, args]) => {
  const child = spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  child.stdout.on("data", data => process.stdout.write(`[${name}] ${data}`));
  child.stderr.on("data", data => process.stderr.write(`[${name}] ${data}`));
  child.on("exit", code => {
    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
      shutdown(code);
    }
  });

  return child;
});

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

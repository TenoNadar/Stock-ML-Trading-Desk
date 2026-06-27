import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const mlDir = path.join(rootDir, "ml");
const mlOutput = path.join(mlDir, "ml_results_final.json");
const publicOutput = path.join(rootDir, "public", "ml_results_final.json");
const port = Number(process.env.ML_API_PORT || 8787);
const pythonCandidates = [
  process.env.PYTHON ? path.resolve(process.cwd(), process.env.PYTHON) : null,
  process.env.PYTHON_EXEC ? path.resolve(process.cwd(), process.env.PYTHON_EXEC) : null,
  path.join(rootDir, ".venv", "bin", "python"),
  path.join(mlDir, ".venv", "bin", "python"),
  "/Users/tenoasir/Desktop/files/.venv/bin/python",
].filter(Boolean);
const python = pythonCandidates.find(existsSync) || "python3";

let child = null;
let status = {
  state: "idle",
  message: "ML backtest has not been run in this server session.",
  startedAt: null,
  completedAt: null,
  exitCode: null,
  generatedAt: null,
  lastDataDate: null,
  analyzed: null,
  sharpeAbove3: null,
  logTail: [],
};

function json(res, code, body) {
  const text = JSON.stringify(body);
  res.writeHead(code, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

function appendLog(chunk) {
  const lines = String(chunk).split(/\r?\n/).filter(Boolean);
  status.logTail = [...status.logTail, ...lines].slice(-80);
}

async function hydrateStatusFromResults() {
  const raw = await readFile(mlOutput, "utf8");
  const data = JSON.parse(raw);
  status.generatedAt = data.generated_at || null;
  status.lastDataDate = data.last_data_date || null;
  status.analyzed = data.analyzed || null;
  status.sharpeAbove3 = data.sharpe_above_3 || null;
  await copyFile(mlOutput, publicOutput);
}

function runBacktest() {
  if (child) {
    return false;
  }

  status = {
    state: "running",
    message: "Running ML backtest with latest Yahoo Finance daily data.",
    startedAt: new Date().toISOString(),
    completedAt: null,
    exitCode: null,
    generatedAt: null,
    lastDataDate: null,
    analyzed: null,
    sharpeAbove3: null,
    logTail: [],
  };

  child = spawn(python, ["ML_SYSTEM_FOR_YOUR_MACHINE.py"], {
    cwd: mlDir,
    env: process.env,
  });

  child.stdout.on("data", appendLog);
  child.stderr.on("data", appendLog);

  child.on("close", async (code) => {
    child = null;
    status.exitCode = code;
    status.completedAt = new Date().toISOString();

    if (code !== 0) {
      status.state = "error";
      status.message = `ML backtest failed with exit code ${code}.`;
      return;
    }

    try {
      await hydrateStatusFromResults();
      status.state = "completed";
      status.message = "Backtest completed. Fresh results were copied into the UI.";
    } catch (error) {
      status.state = "error";
      status.message = `Backtest finished but result sync failed: ${error.message}`;
    }
  });

  child.on("error", (error) => {
    child = null;
    status.state = "error";
    status.message = `Could not start Python ML process: ${error.message}`;
    status.completedAt = new Date().toISOString();
  });

  return true;
}

createServer((req, res) => {
  if (req.method === "OPTIONS") {
    json(res, 204, {});
    return;
  }

  if (req.method === "GET" && req.url === "/api/ml/status") {
    json(res, 200, status);
    return;
  }

  if (req.method === "POST" && req.url === "/api/ml/run") {
    if (!runBacktest()) {
      json(res, 409, status);
      return;
    }
    json(res, 202, status);
    return;
  }

  json(res, 404, { error: "Not found" });
}).listen(port, "127.0.0.1", () => {
  console.log(`ML API listening on http://127.0.0.1:${port}`);
});

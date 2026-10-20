import { spawn } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, openSync, closeSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

const root = fileURLToPath(new URL("../../", import.meta.url));
const state = resolve(root, "shared-ai/.runtime.local");
const backendFile = resolve(state, "backend.env.local");
const clientFile = resolve(root, ".env.local");
mkdirSync(state, { recursive: true, mode: 0o700 });
const token = () => randomBytes(32).toString("hex");
const readEnv = (path) => (existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {});
const saveEnv = (path, env) => {
  const lines = Object.entries(env).map(([key, value]) => {
    if (/[\r\n']/.test(value))
      throw new Error(`Cannot safely serialize ${key}; existing settings were not changed.`);
    return `${key}='${value}'`;
  });
  writeFileSync(path, lines.join("\n") + "\n", { mode: 0o600 });
};
let backend = readEnv(backendFile);
const client = readEnv(clientFile);
if (!existsSync(backendFile)) {
  if (client.SHARED_AI_BASE_URL && client.SHARED_AI_BASE_URL !== "http://127.0.0.1:8787")
    throw new Error(
      "An existing shared backend is configured; keep it or remove that configuration before local setup.",
    );
  const key = token();
  const { OLLAMA_MODELS } = await import("../../src/lib/ollama-models.ts");
  backend = {
    PORT: "8787",
    SHARED_AI_HOST: "127.0.0.1",
    SHARED_AI_DATABASE: resolve(state, "shared-ai.sqlite"),
    OLLAMA_BASE_URL: "http://127.0.0.1:11434",
    OLLAMA_MODELS: existsSync(resolve(root, "../ollama/models"))
      ? resolve(root, "../ollama/models")
      : resolve(state, "models"),
    SHARED_AI_APPS_JSON: JSON.stringify({
      studio: {
        keyHash: createHash("sha256").update(key).digest("hex"),
        allowedModels: OLLAMA_MODELS.map((m) => m.id),
        requestsPerMinute: 30,
        dailyStarts: 50,
        concurrent: 1,
      },
    }),
  };
  client.STUDIO_ACCESS_TOKEN ||= token();
  client.SHARED_AI_BASE_URL = "http://127.0.0.1:8787";
  client.SHARED_AI_APP_ID = "studio";
  client.SHARED_AI_APP_KEY = key;
  saveEnv(backendFile, backend);
  saveEnv(clientFile, client);
}
async function healthy(url) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
}
function launch(command, args, env, name) {
  const log = openSync(resolve(state, `${name}.log.local`), "a", 0o600);
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ["ignore", log, log],
  });
  child.on("error", (error) => console.error(`${name}: ${error.message}`));
  child.unref();
  closeSync(log);
  if (child.pid) writeFileSync(resolve(state, `${name}.pid.local`), String(child.pid));
}
async function waitFor(url, name) {
  for (let i = 0; i < 40; i++) {
    if (await healthy(url)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${name} failed to start. Inspect shared-ai/.runtime.local/${name}.log.local.`);
}
if (!(await healthy("http://127.0.0.1:11434/api/version"))) {
  launch(
    process.env.OLLAMA_BIN || "ollama",
    ["serve"],
    {
      OLLAMA_HOST: "127.0.0.1:11434",
      OLLAMA_MODELS: process.env.OLLAMA_MODELS || backend.OLLAMA_MODELS || resolve(state, "models"),
    },
    "ollama",
  );
  await waitFor("http://127.0.0.1:11434/api/version", "ollama");
}
if (!(await healthy("http://127.0.0.1:8787/health"))) {
  launch(
    process.execPath,
    ["--experimental-strip-types", `--env-file=${backendFile}`, "shared-ai/src/server.ts"],
    {},
    "shared-ai",
  );
  await waitFor("http://127.0.0.1:8787/health", "shared-ai");
}
const verify = await fetch("http://127.0.0.1:8787/v1/models", {
  headers: {
    "X-App-Id": client.SHARED_AI_APP_ID,
    Authorization: `Bearer ${client.SHARED_AI_APP_KEY}`,
  },
});
if (!verify.ok)
  throw new Error(
    "Backend is running but studio authentication failed; inspect the existing local configuration.",
  );
console.log("Ollama ready: http://127.0.0.1:11434");
console.log("Authenticated shared backend ready: http://127.0.0.1:8787");
console.log("Studio connection saved to .env.local. Credentials were not printed.");
console.log(
  "Start the studio: node --env-file=.env.local node_modules/vite/bin/vite.js --host 127.0.0.1",
);

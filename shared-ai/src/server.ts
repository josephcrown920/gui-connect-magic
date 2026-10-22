import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { createSharedBackend, parseApps } from "./backend.ts";

const database = process.env["SHARED_AI_DATABASE"] ?? "/data/shared-ai.sqlite";
mkdirSync(dirname(database), { recursive: true });
const backend = createSharedBackend({
  database,
  applications: parseApps(process.env["SHARED_AI_APPS_JSON"] ?? "{}"),
});
const server = createServer(async (incoming, outgoing) => {
  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers))
      if (value) headers.set(name, Array.isArray(value) ? value.join(",") : value);
    if (incoming.url !== "/health" && !backend.authenticated(headers)) {
      outgoing.writeHead(401, { "Content-Type": "application/json" });
      outgoing.end(JSON.stringify({ error: { message: "Invalid application credentials." } }));
      incoming.resume();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of incoming) {
      size += chunk.length;
      if (size > 42 * 1024 * 1024) {
        outgoing.writeHead(413);
        outgoing.end("Request too large");
        return;
      }
      chunks.push(chunk);
    }
    const request = new Request(`http://shared-ai.internal${incoming.url}`, {
      method: incoming.method ?? "GET",
      headers,
      ...(!["GET", "HEAD"].includes(incoming.method ?? "GET")
        ? { body: Buffer.concat(chunks) }
        : {}),
    });
    const response = await backend.fetch(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body as never).pipe(outgoing);
    else outgoing.end();
  } catch {
    if (!outgoing.headersSent) outgoing.writeHead(500);
    outgoing.end("Backend request failed");
  }
});
server.requestTimeout = 360000;
server.listen(Number(process.env["PORT"] ?? 8787), process.env["SHARED_AI_HOST"] ?? "0.0.0.0", () =>
  console.log(`Shared AI backend listening on ${(server.address() as { port: number }).port}`),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () =>
    server.close(() => {
      backend.close();
      process.exit(0);
    }),
  );

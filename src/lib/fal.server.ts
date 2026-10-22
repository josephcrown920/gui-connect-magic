import { FAL_VIDEOS, FAL_PERFORMANCE } from "./media-catalog.ts";

function key() {
  const value = process.env["FAL_KEY"];
  if (!value)
    throw new Error("Add FAL_KEY to the server secrets to connect the selected image/video model.");
  return value;
}
async function request(
  path: string,
  method: "GET" | "POST",
  input?: unknown,
  signal?: AbortSignal,
) {
  const response = await fetch(`https://queue.fal.run/${path}`, {
    method,
    headers: { Authorization: `Key ${key()}`, "Content-Type": "application/json" },
    ...(input ? { body: JSON.stringify(input) } : {}),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(60_000)])
      : AbortSignal.timeout(60_000),
  });
  if (!response.ok)
    throw new Error(
      response.status === 402
        ? "fal is out of credits."
        : `fal request failed (${response.status}). Check the model, inputs and account access.`,
    );
  return response.json() as Promise<Record<string, unknown>>;
}
const encode = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const decode = (value: string) =>
  Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
async function signingKey() {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`reel-fal-job-v1:${key()}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
export async function signJob(endpoint: string, id: string) {
  const payload = encode(
    new TextEncoder().encode(JSON.stringify({ endpoint, id, expires: Date.now() + 7 * 86400000 })),
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(),
    new TextEncoder().encode(payload),
  );
  return `fal_${payload}.${encode(new Uint8Array(signature))}`;
}
export async function readJob(token: string) {
  try {
    if (token.length > 2000 || !token.startsWith("fal_")) throw new Error();
    const [payload, signature] = token.slice(4).split(".");
    if (
      !payload ||
      !signature ||
      !(await crypto.subtle.verify(
        "HMAC",
        await signingKey(),
        decode(signature),
        new TextEncoder().encode(payload),
      ))
    )
      throw new Error();
    const job = JSON.parse(new TextDecoder().decode(decode(payload))) as {
      endpoint: string;
      id: string;
      expires: number;
    };
    const endpoints = [
      ...Object.values(FAL_VIDEOS).flatMap((v) => [v.text, v.image]),
      ...Object.values(FAL_PERFORMANCE),
    ];
    if (
      !endpoints.includes(job.endpoint) ||
      !/^[a-zA-Z0-9_-]{1,160}$/.test(job.id) ||
      !Number.isFinite(job.expires) ||
      job.expires < Date.now()
    )
      throw new Error();
    return job;
  } catch {
    throw new Error("Invalid or expired video job. Start a new production.");
  }
}
// fal status/result URLs use the model's two-part queue namespace, even for nested endpoints.
function namespace(endpoint: string) {
  return endpoint.split("/").slice(0, 2).join("/");
}
export async function submitFal(endpoint: string, input: unknown) {
  const job = await request(endpoint, "POST", input);
  if (typeof job["request_id"] !== "string") throw new Error("fal returned no job ID.");
  return job["request_id"];
}
export async function falStatus(token: string) {
  const job = await readJob(token);
  const status = await request(`${namespace(job.endpoint)}/requests/${job.id}/status`, "GET");
  const state = status["status"];
  return {
    status:
      state === "COMPLETED"
        ? "completed"
        : state === "IN_QUEUE"
          ? "queued"
          : state === "IN_PROGRESS"
            ? "processing"
            : "failed",
  };
}
export async function falContent(token: string) {
  const job = await readJob(token);
  const result = await request(`${namespace(job.endpoint)}/requests/${job.id}`, "GET");
  const video = result["video"] as { url?: unknown } | undefined;
  if (typeof video?.url !== "string")
    throw new Error("The video job did not return a downloadable video.");
  const url = new URL(video.url);
  if (
    url.protocol !== "https:" ||
    !(
      url.hostname.endsWith(".fal.media") ||
      url.hostname === "fal.media" ||
      url.hostname === "storage.googleapis.com"
    )
  )
    throw new Error("Unexpected video storage host.");
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(60_000) });
  if (!response.ok || !response.headers.get("Content-Type")?.startsWith("video/"))
    throw new Error("Could not download the generated video.");
  return new Response(response.body, {
    headers: {
      "Content-Type": response.headers.get("Content-Type")!,
      "Cache-Control": "private, no-store",
    },
  });
}
export async function falImage(endpoint: string, input: unknown, signal: AbortSignal) {
  const id = await submitFal(endpoint, input);
  const started = Date.now();
  for (;;) {
    signal.throwIfAborted();
    const status = await request(
      `${namespace(endpoint)}/requests/${id}/status`,
      "GET",
      undefined,
      signal,
    );
    if (status["status"] === "COMPLETED") {
      const result = await request(
        `${namespace(endpoint)}/requests/${id}`,
        "GET",
        undefined,
        signal,
      );
      const images = result["images"] as { url?: string }[] | undefined;
      if (!images?.[0]?.url) throw new Error("The image model returned no image.");
      return Response.json({ data: images.map((image) => ({ url: image.url })) });
    }
    if (!["IN_QUEUE", "IN_PROGRESS"].includes(String(status["status"])))
      throw new Error("Image generation failed.");
    if (Date.now() - started > 180000)
      throw new Error("Image generation timed out. The provider job may still finish.");
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, 1500);
      signal.addEventListener("abort", abort, { once: true });
    });
  }
}
export function mediaError(error: unknown) {
  return Response.json(
    { error: { message: error instanceof Error ? error.message : "Media service failed." } },
    { status: 502 },
  );
}

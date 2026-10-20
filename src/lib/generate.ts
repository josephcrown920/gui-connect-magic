/** Browser helpers that call the app's own generation endpoints. */

async function fileToMedia(file: Blob) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000)
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { data: btoa(bin), mime: file.type || "image/png" };
}

export async function urlToBlob(url: string) {
  return (await fetch(url)).blob();
}

type ImgResp = {
  data?: { b64_json?: string; url?: string }[];
  error?: { message?: string } | string;
};

function errMsg(d: unknown, fallback: string) {
  const e = (d as { error?: { message?: string } | string })?.error;
  return typeof e === "string" ? e : (e?.message ?? fallback);
}

/** Generate an image, or edit `source` by prompt when given. Returns a displayable URL. */
export async function generateImage(
  prompt: string,
  engine: string,
  source?: Blob,
  signal?: AbortSignal,
): Promise<string> {
  let r: Response;
  if (source) {
    const form = new FormData();
    form.set("prompt", prompt);
    form.set("engine", engine);
    form.set("image", source, "source.png");
    r = await fetch("/api/image", { method: "POST", signal: signal ?? null, body: form });
  } else {
    r = await fetch("/api/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, engine }),
      signal: signal ?? null,
    });
  }
  const text = await r.text();
  let d: ImgResp = {};
  try {
    d = JSON.parse(text) as ImgResp;
  } catch {
    throw new Error(text.slice(0, 160) || "Image service error");
  }
  const item = d.data?.[0];
  const url = item?.b64_json ? `data:image/png;base64,${item.b64_json}` : item?.url;
  if (!r.ok || !url) throw new Error(errMsg(d, "The image service didn't return an image."));
  return url;
}

/** Create a video job, poll until finished, return an object URL for the clip. */
export async function generateVideo(
  prompt: string,
  engine: string,
  motion: string,
  opts: {
    image?: Blob | undefined;
    duration?: string;
    onStatus?: (s: string) => void;
    signal?: AbortSignal;
    jobId?: string;
    onJob?: (id: string) => Promise<void>;
  } = {},
): Promise<string> {
  opts.signal?.throwIfAborted();
  const body: Record<string, unknown> = { prompt, engine, motion, duration: opts.duration ?? "6s" };
  if (opts.image) body["image"] = await fileToMedia(opts.image);
  let jobId = opts.jobId;
  if (!jobId) {
    const r = await fetch("/api/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    const job = (await r.json().catch(() => ({}))) as { id?: string; status?: string };
    if (!r.ok || !job.id) throw new Error(errMsg(job, "The video service rejected the request."));
    jobId = job.id;
    await opts.onJob?.(jobId);
  }
  const started = Date.now();
  for (;;) {
    await new Promise<void>((resolve, reject) => {
      opts.signal?.throwIfAborted();
      const abort = () => {
        clearTimeout(timer);
        reject(opts.signal?.reason);
      };
      const timer = setTimeout(() => {
        opts.signal?.removeEventListener("abort", abort);
        resolve();
      }, 5000);
      opts.signal?.addEventListener("abort", abort, { once: true });
    });
    const poll = await fetch(`/api/video/${jobId}`, { signal: opts.signal ?? null });
    const p = (await poll.json().catch(() => ({}))) as { status?: string; error?: unknown };
    if (!poll.ok) throw new Error(errMsg(p, `Could not check video job (${poll.status}).`));
    const s = (p.status ?? "").toLowerCase();
    opts.onStatus?.(s || "working");
    if (["completed", "succeeded", "done"].includes(s)) break;
    if (["failed", "error", "cancelled", "canceled"].includes(s))
      throw new Error(errMsg(p, "Video generation failed."));
    if (Date.now() - started > 8 * 60 * 1000)
      throw new Error("Video took too long — try a shorter or simpler prompt.");
  }
  const content = await fetch(`/api/video/${jobId}/content`, { signal: opts.signal ?? null });
  if (!content.ok)
    throw new Error("Could not download the generated video. Retry to download the same job.");
  const blob = await content.blob();
  if (!blob.size || !blob.type.startsWith("video/"))
    throw new Error("The video service returned invalid media.");
  return URL.createObjectURL(blob);
}

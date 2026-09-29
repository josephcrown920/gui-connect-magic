/** Browser helpers that call the app's own generation endpoints. */

async function fileToMedia(file: Blob) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { data: btoa(bin), mime: file.type || "image/png" };
}

export async function urlToBlob(url: string) {
  return (await fetch(url)).blob();
}

type ImgResp = { data?: { b64_json?: string; url?: string }[]; error?: { message?: string } | string };

function errMsg(d: unknown, fallback: string) {
  const e = (d as { error?: { message?: string } | string })?.error;
  return typeof e === "string" ? e : e?.message ?? fallback;
}

/** Generate an image, or edit `source` by prompt when given. Returns a displayable URL. */
export async function generateImage(prompt: string, engine: string, source?: Blob): Promise<string> {
  let r: Response;
  if (source) {
    const form = new FormData();
    form.set("prompt", prompt);
    form.set("engine", engine);
    form.set("image", source, "source.png");
    r = await fetch("/api/image", { method: "POST", body: form });
  } else {
    r = await fetch("/api/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, engine }) });
  }
  const text = await r.text();
  let d: ImgResp = {};
  try { d = JSON.parse(text) as ImgResp; } catch { throw new Error(text.slice(0, 160) || "Image service error"); }
  const item = d.data?.[0];
  const url = item?.b64_json ? `data:image/png;base64,${item.b64_json}` : item?.url;
  if (!url) throw new Error(errMsg(d, "The image service didn't return an image."));
  return url;
}

/** Create a video job, poll until finished, return an object URL for the clip. */
export async function generateVideo(
  prompt: string,
  engine: string,
  motion: string,
  opts: { image?: Blob; duration?: string; onStatus?: (s: string) => void } = {},
): Promise<string> {
  const body: Record<string, unknown> = { prompt, engine, motion, duration: opts.duration ?? "6s" };
  if (opts.image) body["image"] = await fileToMedia(opts.image);
  const r = await fetch("/api/video", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const job = (await r.json().catch(() => ({}))) as { id?: string; status?: string };
  if (!r.ok || !job.id) throw new Error(errMsg(job, "The video service rejected the request."));
  const started = Date.now();
  for (;;) {
    await new Promise((res) => setTimeout(res, 5000));
    const p = (await (await fetch(`/api/video/${job.id}`)).json().catch(() => ({}))) as { status?: string; error?: unknown };
    const s = (p.status ?? "").toLowerCase();
    opts.onStatus?.(s || "working");
    if (["completed", "succeeded", "done"].includes(s)) break;
    if (["failed", "error", "cancelled", "canceled"].includes(s)) throw new Error(errMsg(p, "Video generation failed."));
    if (Date.now() - started > 8 * 60 * 1000) throw new Error("Video took too long — try a shorter or simpler prompt.");
  }
  const blob = await (await fetch(`/api/video/${job.id}/content`)).blob();
  return URL.createObjectURL(blob);
}

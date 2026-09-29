/** Renders the timeline in real time onto a canvas and records it to a WebM file. */
export type ExportClip = { assetId: string; track: string; start: number; dur: number; inPoint: number; opacity: number; speed: number; volume: number; filterCss: string };
export type ExportAsset = { id: string; kind: "video" | "image" | "audio"; url: string };

export async function renderTimeline(
  clips: ExportClip[],
  assets: ExportAsset[],
  duration: number,
  onProgress: (p: number) => void,
): Promise<Blob> {
  const W = 1280, H = 720;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const ac = new AudioContext();
  const dest = ac.createMediaStreamDestination();

  const els = new Map<string, HTMLImageElement | HTMLMediaElement>();
  const gains = new Map<string, GainNode>();
  await Promise.all(assets.map(async (a) => {
    if (a.kind === "image") {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = a.url;
      await img.decode().catch(() => {});
      els.set(a.id, img);
    } else {
      const m = document.createElement(a.kind === "audio" ? "audio" : "video") as HTMLMediaElement;
      m.crossOrigin = "anonymous";
      m.src = a.url; m.preload = "auto"; (m as HTMLVideoElement).playsInline = true;
      await new Promise((r) => { m.onloadeddata = r; m.onerror = r; setTimeout(r, 4000); });
      try {
        const src = ac.createMediaElementSource(m);
        const g = ac.createGain();
        src.connect(g).connect(dest);
        gains.set(a.id, g);
      } catch { /* no audio */ }
      els.set(a.id, m);
    }
  }));

  const stream = canvas.captureStream(30);
  dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<Blob>((res) => { rec.onstop = () => res(new Blob(chunks, { type: "video/webm" })); });

  const order = ["V1", "V2", "V3"];
  const active = new Set<HTMLMediaElement>();
  rec.start(250);
  const t0 = performance.now();

  await new Promise<void>((resolve) => {
    const frame = () => {
      const t = (performance.now() - t0) / 1000;
      onProgress(Math.min(1, t / duration));
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
      const now = new Set<HTMLMediaElement>();
      for (const c of clips) {
        if (t < c.start || t >= c.start + c.dur) continue;
        const el = els.get(c.assetId);
        if (!el) continue;
        if (el instanceof HTMLMediaElement) {
          now.add(el);
          const want = c.inPoint + (t - c.start) * c.speed;
          if (!active.has(el) || Math.abs(el.currentTime - want) > 0.5) el.currentTime = want;
          el.playbackRate = c.speed;
          const g = gains.get(c.assetId); if (g) g.gain.value = c.volume;
          if (el.paused) void el.play().catch(() => {});
        }
      }
      for (const tr of order) {
        const c = clips.find((x) => x.track === tr && t >= x.start && t < x.start + x.dur);
        const el = c && els.get(c.assetId);
        if (!c || !el || el instanceof HTMLAudioElement) continue;
        const w = el instanceof HTMLImageElement ? el.naturalWidth : (el as HTMLVideoElement).videoWidth;
        const h = el instanceof HTMLImageElement ? el.naturalHeight : (el as HTMLVideoElement).videoHeight;
        if (!w || !h) continue;
        const s = Math.min(W / w, H / h);
        ctx.globalAlpha = c.opacity;
        ctx.filter = c.filterCss || "none";
        ctx.drawImage(el as CanvasImageSource, (W - w * s) / 2, (H - h * s) / 2, w * s, h * s);
        ctx.globalAlpha = 1; ctx.filter = "none";
      }
      active.forEach((el) => { if (!now.has(el)) el.pause(); });
      active.clear(); now.forEach((e) => active.add(e));
      if (t >= duration) return resolve();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });

  active.forEach((el) => el.pause());
  rec.stop();
  const blob = await done;
  void ac.close();
  return blob;
}

export function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

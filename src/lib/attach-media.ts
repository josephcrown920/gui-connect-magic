import type { ChatAttachment } from "./multimodal";

/** Sends private/local media as bytes, never a browser-only blob URL. */
export async function attachMedia(asset: {
  name: string;
  kind: "image" | "video";
  url: string;
}): Promise<ChatAttachment> {
  const response = await fetch(asset.url);
  if (!response.ok) throw new Error("Could not read the selected media.");
  const blob = await response.blob();
  if (blob.size > 20 * 1024 * 1024)
    throw new Error("For media understanding, choose a file under 20 MB or trim your video first.");
  if (!blob.size) throw new Error("The selected media is empty.");
  const mime = blob.type.split(";")[0] || (asset.kind === "video" ? "video/mp4" : "image/jpeg");
  if (
    ![
      "image/png",
      "image/jpeg",
      "image/webp",
      "video/mp4",
      "video/webm",
      "video/mpeg",
      "video/mov",
      "video/quicktime",
    ].includes(mime)
  )
    throw new Error("Use PNG/JPEG/WebP images or MP4/WebM/MPEG/MOV videos.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return {
    name: asset.name,
    kind: asset.kind,
    mime: mime as ChatAttachment["mime"],
    data: btoa(binary),
  };
}

import { proxyToShared } from "../shared-proxy.server.ts";
import { authorizeStudio } from "../studio-access.server.ts";
import { GATEWAY, apiKey } from "../gateway.server.ts";

import { falContent, mediaError } from "../fal.server.ts";

export async function handleVideoContent(request: Request, id: string) {
  const denied = await authorizeStudio(request);
  if (denied) return denied;
  const shared = await proxyToShared(request);
  if (shared) return shared;
  if (id.startsWith("fal_")) {
    try {
      return await falContent(id);
    } catch (error) {
      return mediaError(error);
    }
  }
  const r = await fetch(`${GATEWAY}/v1/videos/${encodeURIComponent(id)}/content`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  return new Response(r.body, {
    status: r.status,
    headers: { "Content-Type": r.headers.get("Content-Type") ?? "video/mp4" },
  });
}

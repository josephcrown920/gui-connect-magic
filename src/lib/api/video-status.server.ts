import { proxyToShared } from "../shared-proxy.server.ts";
import { authorizeStudio } from "../studio-access.server.ts";
import { GATEWAY, apiKey, passthrough } from "../gateway.server.ts";

import { falStatus, mediaError } from "../fal.server.ts";

export async function handleVideoStatus(request: Request, id: string) {
  const denied = await authorizeStudio(request);
  if (denied) return denied;
  const shared = await proxyToShared(request);
  if (shared) return shared;
  if (id.startsWith("fal_")) {
    try {
      return Response.json(await falStatus(id));
    } catch (error) {
      return mediaError(error);
    }
  }
  return passthrough(
    await fetch(`${GATEWAY}/v1/videos/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${apiKey()}` },
    }),
  );
}

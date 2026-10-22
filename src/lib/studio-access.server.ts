/** Owner access gate: provider keys must not fund anonymous public requests. */
export async function authorizeStudio(request: Request): Promise<Response | null> {
  const configured = process.env["STUDIO_ACCESS_TOKEN"];
  if (!configured || configured.length < 24)
    return Response.json(
      {
        error: {
          message:
            "Set STUDIO_ACCESS_TOKEN (at least 24 random characters) in server secrets before enabling paid AI.",
        },
      },
      { status: 503 },
    );
  const supplied = request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
  const digest = async (text: string) =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  const [expected, actual] = await Promise.all([digest(configured), digest(supplied)]);
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected[i]! ^ actual[i]!;
  if (mismatch)
    return Response.json(
      { error: { message: "Unlock the studio with its access code before using AI." } },
      { status: 401 },
    );
  return null;
}

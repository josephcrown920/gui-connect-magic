# Shared AI backend

A separately runnable service for all your projects. Provider keys are configured
once on this backend. Each client application receives its own revocable key and
calls this service from its **server**, not from browser JavaScript. No ChatGPT
subscription is involved in running the service on an external host.

## What runs where

- This small Node service routes requests, saves job ownership and request results,
  and enforces application limits. It does **not** run GPU models locally.
- OpenRouter runs the selected text/understanding models. fal runs media models.
  Their inference charges are separate from hosting charges.
- Open-source/open-weight options include FLUX Schnell, Wan 2.2, Qwen3 32B and
  DeepSeek V3.2. LTX 2.3 is included under its own community license. Hosted model
  availability does not mean hosted inference is free.

Model licenses/source:
- FLUX Schnell: https://huggingface.co/black-forest-labs/FLUX.1-schnell
- Wan 2.2: https://github.com/Wan-Video/Wan2.2
- Qwen3 32B: https://huggingface.co/Qwen/Qwen3-32B
- DeepSeek V3.2: https://huggingface.co/deepseek-ai/DeepSeek-V3.2
- LTX 2.3: https://huggingface.co/Lightricks/LTX-2.3

## Deploy without owning a server

This version uses Node 24 and SQLite. It needs **one running instance and a
persistent disk mounted at `/data`**. Do not enable multiple replicas with
independent disks; application quotas, recovery and job ownership rely on one
shared database. Back up the disk. Losing it loses quotas, recovery and ownership.

### Render

Create a Blueprint from this repository and the `feature/agentic-video-production`
branch, using `shared-ai/render.yaml` as the Blueprint path. The template requests
a **paid Starter web service and a 1 GB disk**; review the displayed charge before
applying. Enter the runtime secrets listed below. After deployment, Render supplies
an HTTPS URL. A custom domain is optional. Update the branch after merging if you
want deployments to follow `main`.

### Railway

Deploy from the repository/feature branch. Select `shared-ai/railway.json` as the
service configuration file (or set the Dockerfile path to `shared-ai/Dockerfile`).
Attach a volume at `/data`, add runtime secrets, and generate a public HTTPS domain.
Keep one replica and review Railway's plan and metered usage before activation.

The current service cannot be deployed unchanged to Netlify Functions or
Cloudflare Workers. Netlify has execution/payload limits that conflict with this
implementation; Workers needs a storage/runtime adapter such as D1 or Durable
Objects instead of Node SQLite. This package does not promise perpetual free
hosting or bypass a provider's quotas/billing requirements.

## Backend runtime secrets

1. `OPENROUTER_API_KEY`
2. `FAL_KEY`
3. `SHARED_AI_APPS_JSON` (application IDs, **hashed** keys, model permissions, limits)

`SHARED_AI_DATABASE=/data/shared-ai.sqlite` and `PORT` are ordinary runtime settings.
Optional legacy integrations use `LOVABLE_API_KEY` and `ARK_API_KEY`. Do not set
`SHARED_AI_BASE_URL` on the shared service itself. The service generates an internal
handler-access code at startup; that code is never issued to clients.

Create an application credential locally:

```bash
node shared-ai/scripts/create-app.mjs reel
```

The command prints the app's server credential once and an application entry to
**merge** into `SHARED_AI_APPS_JSON`. Keep the printed credential private. Run the
command once per application with a different app ID. To revoke a client, remove
its entry and restart/redeploy the backend. To rotate it, replace the hash while
keeping its app ID. Existing jobs remain associated with the same app ID.

A client entry has:

```json
{
  "reel": {
    "keyHash": "<SHA-256 hex hash from create-app>",
    "allowedModels": ["astra", "sunburst", "seedance", "ltx", "omni-reader"],
    "requestsPerMinute": 30,
    "dailyStarts": 50,
    "concurrent": 2
  }
}
```

`allowedModels` uses catalog IDs (not raw provider model names). Use `"*"` only for
an app you trust to use the whole catalog. A production request can make two
planning calls; `dailyStarts` counts accepted API POSTs, **not dollars, tokens or
provider jobs**. Set provider-side spending limits too. Failed accepted requests
still consume a daily start, to avoid unbounded retries. Polls and recovery do not
consume daily starts, but do count toward the per-minute request limit.

## Connect the existing studio

On the **studio's** server, configure:

```text
SHARED_AI_BASE_URL=https://<your-deployed-backend-domain>
SHARED_AI_APP_ID=reel
SHARED_AI_APP_KEY=<the generated app key>
STUDIO_ACCESS_TOKEN=<your studio owner's access code, at least 24 random characters>
```

The app keeps its owner access gate; its server replaces that credential with the
app credential when it proxies to the shared backend. Provider keys are no longer
needed on each client app. Never put the app key or provider keys in `VITE_*`
variables. Other applications can use the same API through their own server with
different credentials.

## API contract

Every private request requires:

```text
Authorization: Bearer <app key>
X-App-Id: <app ID>
```

Every paid POST also requires a unique `Idempotency-Key` (8–120 letters, digits,
hyphens or underscores). Reuse the **same key and request body** when recovering a
network retry. A different body with the same key is rejected. Results are cached
for 24 hours; an in-flight duplicate is rejected rather than submitted again.
After a process restart, interrupted requests are marked uncertain: inspect the
provider dashboard before creating a replacement paid request.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Public process health; no credentials/values |
| GET | `/v1/models` | Allowed image/video/agent catalogs and provider configuration flags |
| GET | `/v1/agent` | Studio-compatible provider/catalog response |
| POST | `/v1/agent` | Existing studio edit or `operation: production` request |
| POST | `/v1/image` | JSON generation or multipart image edit |
| POST | `/v1/video` | Video/performance job submission |
| GET | `/v1/video/<id>` | Poll a job owned by this app |
| GET | `/v1/video/<id>/content` | Stream that job's completed video |
| GET | `/v1/requests/<idempotency-key>` | Recover a saved result or see pending state |

Job ownership and application quotas survive restarts on the persistent disk.
fal handles also expire after seven days and become invalid when FAL_KEY rotates.
Response recovery has an 8 MB limit; use URL-based image results for large images.
Generated media remains on provider storage unless the client copies it; this is
not a permanent media asset store. No raw uploads or provider keys are logged by
the server. Cached scene plans and responses can contain private content, so treat
the database/backups as private application data.

## Optional Docker deployment

From the repository root, copy `shared-ai/.env.example` to `shared-ai/.env`, fill it
locally, then run:

```bash
docker compose -f shared-ai/compose.yaml up -d --build
```

The container binds port 8787 to localhost. Put an HTTPS reverse proxy in front of
it before connecting remote applications. This path is for operators who already
have a server; Render/Railway provide managed hosting without one.

## Verification

From the repository root with dependencies installed:

```bash
npm test
node --experimental-strip-types --test shared-ai/tests/*.test.ts
npx tsc --noEmit
```

Provider calls are mocked in tests; live inference needs configured paid accounts.

### Ollama: local Qwen vision and cloud Nemotron

The chat picker and production director picker include Qwen3-VL 2B/4B, Nemotron 3 Nano/Super/Ultra, and MiniMax M3.1 Flash through Ollama. Configure `OLLAMA_BASE_URL` on the backend (default `http://127.0.0.1:11434`). Pull `qwen3-vl:2b` or `qwen3-vl:4b` on the same Ollama daemon for local vision. Cloud tags require `ollama signin` on that daemon and use the account's cloud allowance. Local weights use your hardware; cloud weights are not downloaded locally.

Qwen accepts image attachments through the OpenAI-compatible endpoint. Video uploads are rejected with instructions to extract frames or select Qwen Omni; frame extraction is not automated here. These models return text and edit decisions, not generated images/video. Add the catalog IDs (`qwen-vl-2b`, `qwen-vl-4b`, `nemotron-nano`, `nemotron-super`, `nemotron-ultra`, `minimax-ollama`) to a shared application's `allowedModels` to permit them.

A published backend cannot reach the Ollama daemon in this temporary ChatGPT workspace. Run Ollama alongside your backend or use a protected reachable HTTPS endpoint; never expose an unauthenticated Ollama port publicly. In Docker, localhost means the container itself. Set an appropriate protected endpoint instead. Ollama's API does not enforce `OLLAMA_API_KEY` itself; remote deployments need an authentication proxy. No cloud-to-paid-provider fallback is performed.

# System Companion GUI

Build me a gui with a computer integration

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b34979e1-a65e-4706-a774-3109d9f51efc).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Agentic production

The **Brief to video** panel runs a director and a continuity/pacing reviewer as
separate server-side AI calls. It validates their storyboard before spending on
media, then generates scenes sequentially (or reuses supplied visual assets) and
assembles a contiguous timeline. A new brief can revise the previous storyboard.
The previous timeline can be restored with **Undo production assembly**.

- Drafts have at most 10 scenes and 60 seconds. Choose image storyboards or generated video clips; video generation uses the engine selected in the editor and requests eight-second source clips, trimmed to the planned duration.
- The latest production and its media are saved to this browser's IndexedDB. This is device-local recovery, not cloud project storage. Manual timeline edits are not included in that recovery.
- Pause stops further work. Submitted video jobs may continue at the provider; their IDs are checkpointed and reused on resume. Completed scenes are not generated again. A lost job-creation response or interrupted image request cannot guarantee recovery of the provider result.
- Timeline replacement happens only after every scene succeeds. Source files and completed scenes remain available for retries; provider and storage errors are shown explicitly.
- Narration is a written script. This flow does not synthesize voiceover, add music/captions, or perform background/cloud rendering. Export uses the existing browser WebM renderer.
- Planning reasons from source names, kinds and durations, not visual analysis of uploaded footage.

Configure these **server runtime secrets** on the deployment host (see `.env.example`):

- `OPENROUTER_API_KEY`: agent chat and the director/reviewer. Selected before Lovable when both are configured. There is no automatic retry on another paid provider after an error.
- `FAL_KEY`: image, video, character animation and motion-transfer models.
- `STUDIO_ACCESS_TOKEN`: at least 24 random characters, used as your owner access code. Paid API routes fail closed until configured. Enter this code in **Unlock studio**; only this studio code is kept in browser session storage, not provider keys. It is a single-owner gate, not a multi-user login/billing system.
- `LOVABLE_API_KEY`: optional existing Lovable gateway integration. This is managed by Lovable when its AI integration is enabled.
- `ARK_API_KEY`: optional existing ModelArk integration. Dola/Seed Pro still needs its exact service/endpoint identified.

OpenRouter planners: Astra (default), DeepSeek V4.1 Flash, Claude Sonnet 5,
Qwen 3.8 Flash, and MiniMax M3. Model IDs can be overridden with the
`STUDIO_<AGENT>_MODEL` names in `.env.example`. The catalog IDs and fal input schemas
were checked against the public provider APIs on October 20, 2026.

Media choices: GPT Image 2.5 Sunburst (default), Seedream 5.0 Pro, GPT Image 2,
FLUX.2 Pro, Seedance 2.5 (default video), Wan 2.7, MiniMax H3 Max, LTX 2.3,
Gemini Omni 1.1, and Kling Omni O3 Pro. Sunburst uses fal when FAL_KEY is configured;
otherwise it retains the existing Lovable gateway path. Veo and other legacy
gateway choices still require Lovable AI and provider model availability.

The **Character performance** panel has dedicated image + audio inputs for
OmniHuman 1.5 and image + reference video inputs for Kling 3 motion transfer.
Completed results enter the media bin. In-flight performance jobs can resume in
the same tab; unlike the main production draft, this panel's job state does not
survive reload. Files must be under 10 MB (images) or 20 MB (audio/video), and
provider-specific duration/format constraints still apply.

fal videos use signed, seven-day job handles that restrict polling/downloading to
known model endpoints. Rotating FAL_KEY invalidates old job handles. Drafts retain
these handles for recovery; image-generation requests do not have the same retry
guarantees. No provider key is returned to the browser. This implementation runs
inside the studio's server; a separately hosted, cross-project AI service has not
been deployed yet.

Live generation requires the secrets, paid credits, and account access to the
selected models. These were not available for live testing in this workspace.

Checks (Node 22.6+): `npm test`, `npx tsc --noEmit`, and `npm run build`.
The automated tests use mocked providers; they do not spend generation credits.

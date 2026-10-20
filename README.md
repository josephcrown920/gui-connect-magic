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

Configure `LOVABLE_API_KEY` on the server through Lovable's secret settings.
Optionally set `STUDIO_PLANNER_MODEL` to a model supported by your gateway; the
existing workspace orchestrator model is the default. Keys must never be placed
in client-side `VITE_*` variables. Missing credentials return a clear 503 error.
Live generation requires a connected provider, supported models and AI credits.

Checks (Node 22.6+): `npm test`, `npx tsc --noEmit`, and `npm run build`.
The automated tests use mocked providers; they do not spend generation credits.

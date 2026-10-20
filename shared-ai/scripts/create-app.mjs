import { createHash, randomBytes } from "node:crypto";
const id = process.argv[2];
if (!id || !/^[a-zA-Z0-9_-]{1,60}$/.test(id)) { console.error("Usage: node shared-ai/scripts/create-app.mjs <app-id>"); process.exit(1); }
const key = randomBytes(32).toString("base64url");
console.log("Store this app credential in the CLIENT APP'S SERVER secrets, not browser code:");
console.log(JSON.stringify({ SHARED_AI_APP_ID: id, SHARED_AI_APP_KEY: key }, null, 2));
console.log("Merge this app entry into the backend's SHARED_AI_APPS_JSON (never replace other entries):");
console.log(JSON.stringify({ [id]: { keyHash: createHash("sha256").update(key).digest("hex"), allowedModels: ["*"], requestsPerMinute: 30, dailyStarts: 50, concurrent: 2 } }, null, 2));

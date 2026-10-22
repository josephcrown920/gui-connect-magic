import type { ProductionMedia, ProductionRun } from "./production";

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("reel-production", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("draft");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function write(key: string, value: unknown) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("draft", "readwrite");
      tx.objectStore("draft").put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function saveProductionMedia(media: ProductionMedia) {
  const response = await fetch(media.url);
  if (!response.ok) throw new Error("Could not save generated media on this device.");
  await write(`media:${media.id}`, await response.blob());
}
export async function saveProductionRun(run: ProductionRun) {
  await write("current", run);
  // Keep only media referenced by the latest draft; repeated revisions should not
  // fill IndexedDB with abandoned video blobs.
  const keep = new Set([...run.sources, ...Object.values(run.media)].map((a) => `media:${a.id}`));
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("draft", "readwrite");
      const store = tx.objectStore("draft");
      const cursor = store.openKeyCursor();
      cursor.onsuccess = () => {
        const item = cursor.result;
        if (!item) return;
        if (typeof item.key === "string" && item.key.startsWith("media:") && !keep.has(item.key))
          store.delete(item.key);
        item.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function restoreProductionRun(): Promise<ProductionRun | null> {
  const db = await database();
  const read = (key: string) =>
    new Promise<unknown>((resolve, reject) => {
      const request = db.transaction("draft", "readonly").objectStore("draft").get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  try {
    const run = (await read("current")) as ProductionRun | undefined;
    if (!run) return null;
    const urls = new Map<string, string>();
    const restore = async (asset: ProductionMedia) => {
      let url = urls.get(asset.id);
      if (!url) {
        const blob = await read(`media:${asset.id}`);
        if (!(blob instanceof Blob))
          throw new Error("Draft media is missing. Start a new production.");
        url = URL.createObjectURL(blob);
        urls.set(asset.id, url);
      }
      return { ...asset, url };
    };
    const sources = await Promise.all(run.sources.map(restore));
    const media = Object.fromEntries(
      await Promise.all(
        Object.entries(run.media).map(async ([id, asset]) => [id, await restore(asset)]),
      ),
    );
    return { ...run, sources, media };
  } finally {
    db.close();
  }
}

const STORAGE_KEY = "reel-studio-access";
export function saveStudioAccess(value: string) {
  sessionStorage.setItem(STORAGE_KEY, value);
}
export function studioFetch(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.method?.toUpperCase() === "POST" && !headers.has("Idempotency-Key"))
    headers.set("Idempotency-Key", crypto.randomUUID());
  const code = typeof window === "undefined" ? null : sessionStorage.getItem(STORAGE_KEY);
  if (code) headers.set("Authorization", `Bearer ${code}`);
  return fetch(input, { ...init, headers });
}

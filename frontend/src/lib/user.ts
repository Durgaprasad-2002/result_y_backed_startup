const KEY = "result-anonymous-user-id";

export function getAnonymousUserId() {
  const existing = localStorage.getItem(KEY);
  if (existing) return existing;

  const next = `anon_${crypto.randomUUID()}`;
  localStorage.setItem(KEY, next);
  return next;
}

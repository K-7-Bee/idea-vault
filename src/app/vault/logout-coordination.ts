// Ephemeral coordination only. These signals can lock, never authorize a session.
let pending: symbol | null = null;
const listeners = new Set<() => void>();

export function logoutPending() { return pending !== null; }

export function beginLogout() {
  if (pending) return null;
  pending = Symbol();
  for (const listener of listeners) listener();
  return pending;
}

export function finishLogout(attempt: symbol) {
  if (pending !== attempt) return;
  pending = null;
  for (const listener of listeners) listener();
}

export function subscribeLogout(listener: () => void) {
  listeners.add(listener);
  if (pending) listener();
  return () => { listeners.delete(listener); };
}

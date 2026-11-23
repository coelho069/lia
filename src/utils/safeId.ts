/**
 * Safe ID generator: uses crypto.randomUUID() when available,
 * otherwise falls back to 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2).
 * Never use crypto.randomUUID() directly without this wrapper.
 */
export function safeId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // ignored
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}
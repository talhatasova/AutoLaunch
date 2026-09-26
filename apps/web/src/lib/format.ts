/** Deterministic on server and client - no locale drift, no hydration mismatch. */
export function clockTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** "Submitting to 14 directories" reads better than "14 directorys". */
export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

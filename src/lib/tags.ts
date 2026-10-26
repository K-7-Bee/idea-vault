// A tag is a # followed by letters, numbers, _ or -, at the start of a word.
const TAG = /(^|\s)#([\p{L}\p{N}_-]+)/gu;

export function extractTags(text: string): string[] {
  const tags = new Set<string>();
  for (const m of text.matchAll(TAG)) tags.add(m[2].toLowerCase());
  return [...tags];
}

// Splits text into plain pieces and tag pieces so tags can be styled.
export function splitTags(text: string): { text: string; tag?: string }[] {
  const parts: { text: string; tag?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(TAG)) {
    const start = m.index + m[1].length;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: `#${m[2]}`, tag: m[2].toLowerCase() });
    last = start + 1 + m[2].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

// Phase 5A: finds the record labels an answer cites ([L3], [S1, S4]) and checks each one against
// the labels that were actually sent. Unknown labels are reported so the page can flag them.

const GROUP = /\[((?:[A-Z]{1,2}\d{1,4})(?:\s*[,;]\s*[A-Z]{1,2}\d{1,4})*)\]/g;

export type Piece = { text: string } | { label: string; known: boolean };

export function checkCitations(answer: string, sent: Iterable<string>): { cited: string[]; unknown: string[] } {
  const known = new Set(sent);
  const cited = new Set<string>();
  const unknown = new Set<string>();
  for (const match of answer.matchAll(GROUP)) {
    for (const label of match[1].split(/\s*[,;]\s*/)) (known.has(label) ? cited : unknown).add(label);
  }
  return { cited: [...cited], unknown: [...unknown] };
}

// Splits an answer into plain text and citations, for rendering (as text, never HTML).
export function splitCitations(answer: string, sent: Iterable<string>): Piece[] {
  const known = new Set(sent);
  const pieces: Piece[] = [];
  let at = 0;
  for (const match of answer.matchAll(GROUP)) {
    if (match.index! > at) pieces.push({ text: answer.slice(at, match.index) });
    for (const label of match[1].split(/\s*[,;]\s*/)) pieces.push({ label, known: known.has(label) });
    at = match.index! + match[0].length;
  }
  if (at < answer.length) pieces.push({ text: answer.slice(at) });
  return pieces;
}

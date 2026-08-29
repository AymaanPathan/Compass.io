/** Parses a JSON string that may be truncated mid-stream, returning whatever prefix is valid. */
export function parsePartialJson<T = unknown>(
  input: string,
): Partial<T> | null {
  const text = input.trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    // fall through to repair
  }

  let inString = false;
  let escape = false;
  const stack: string[] = [];
  let lastSafeIndex = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") stack.push(ch);
    if (ch === "}" || ch === "]") stack.pop();
    if (ch === "," || ch === "}" || ch === "]") lastSafeIndex = i + 1;
  }

  let candidate = text.slice(0, lastSafeIndex || text.length);
  if (inString) {
    const lastQuote = candidate.lastIndexOf('"');
    if (lastQuote !== -1) candidate = candidate.slice(0, lastQuote);
  }
  candidate = candidate.replace(/,\s*$/, "");

  const closers = [...stack].reverse().map((c) => (c === "{" ? "}" : "]"));

  try {
    return JSON.parse(candidate + closers.join(""));
  } catch {
    return null;
  }
}

/** Selects original document text, without model calls or changes to the document. */
export interface DocumentPassage {
  text: string;
  heading?: string;
  /** True only when this range and its required ancestor safety context fit. */
  complete: boolean;
  /** The range or required safety context was omitted by the context budget. */
  truncated: boolean;
  omittedSafety?: boolean;
  omittedPassages?: boolean;
  start: number;
  end: number;
  score: number;
}

export interface DocumentPassageOptions {
  /** Total raw source characters across the returned passages (not a token count). */
  maxChars?: number;
  maxPassages?: number;
  /** Preserve small receipts and similar documents whole. */
  wholeDocumentChars?: number;
}

interface Heading {
  start: number;
  end: number;
  level: number;
  title: string;
  number?: string;
}

interface Candidate {
  start: number;
  end: number;
  heading?: string;
  score: number;
  matches: Set<string>;
  headingMatches: Set<string>;
  safety?: { start: number; end: number; heading?: string }[];
}

const STOP = new Set(
  "a an and are as at be been but by can could did do does for from give has have how i in into is it its me mine my of on or our please should show tell than that the their them there these they this those through to us was were what when where which who why will with would you your manual document instruction instructions step steps procedure procedures appliance machine device".split(" "),
);
const ACTIONS = new Set("clean descal wash rins replac remov install assembl disassembl adjust calibrat repair maintain troubleshoot drain empty lubricat charg reset connect disconnect".split(" "));
const CONTINUATION = /^(?:(?:please\s+)?note\b|important\b|caution\b|warning\b|attention\b|safety\b|prepar(?:e|ation|ations)\b|before\s+(?:you\s+)?(?:start|begin)\b|rins(?:e|ing)\b|finish(?:ing)?\b|clean[ -]?up\b)/i;
const SAFETY = /\b(?:warning|caution|important|safety|disconnect|unplug|protective|preparation|prepare)\b/i;
const SCALE_REMOVAL = /\b(?:remov(?:e|ing|al)|clear(?:ing)?)\s+(?:the\s+)?(?:lime[ -]?)?scale\b|\b(?:lime[ -]?)?scale\s+removal\b|\bde[ -]+scaling\b/gi;

/** Keep keyword-only item discovery aligned with the selector's conservative phrase equivalence. */
export function documentSearchQuestion(question: string): string {
  return question.replace(SCALE_REMOVAL, "descaling");
}

function root(word: string): string {
  if (/^maint(?:enance|ain(?:ing)?)$/.test(word)) return "maintain";
  let value = word;
  if (value.length > 6 && value.endsWith("ing")) value = value.slice(0, -3);
  else if (value.length > 5 && value.endsWith("ed")) value = value.slice(0, -2);
  else if (value.length > 4 && value.endsWith("ies")) value = `${value.slice(0, -3)}y`;
  else if (value.length > 4 && value.endsWith("s") && !value.endsWith("ss")) value = value.slice(0, -1);
  if (value.length > 4 && value.endsWith("e")) value = value.slice(0, -1);
  return value;
}

function words(text: string): Set<string> {
  const normalized = documentSearchQuestion(text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/([\p{L}])-\r?\n\s*([\p{L}])/gu, "$1$2"));
  return new Set((normalized.match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length >= 3 && !STOP.has(w)).map(root));
}

/** Normalized evidence coverage, shared with the caller's cross-document budgeting. */
export function relevantQueryTerms(text: string, question: string): string[] {
  const evidence = words(text);
  return [...words(question)].filter((term) => evidence.has(term));
}

function headingsIn(text: string): Heading[] {
  const headings: Heading[] = [];
  const lines = [...text.matchAll(/[^\n]*(?:\n|$)/g)].filter((m) => m[0]);
  let fence: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const content = line[0].replace(/\r?\n$/, "");
    const fenced = /^\s{0,3}(`{3,}|~{3,})/.exec(content);
    if (fenced) {
      if (!fence) fence = fenced[1]![0];
      else if (fenced[1]![0] === fence) fence = undefined;
      continue;
    }
    if (fence) continue;
    const atx = /^\s{0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/.exec(content);
    const underline = lines[i + 1] && /^\s{0,3}(=+|-+)[ \t]*\r?\n?$/.exec(lines[i + 1]![0]);
    if (!atx && (!underline || !content.trim() || /^\s*[-*|>]/.test(content))) continue;
    const title = (atx ? atx[2]! : content).trim();
    const number = /^(\d+(?:\.\d+)*)(?:[.)])?\s+/.exec(title)?.[1];
    headings.push({
      start: line.index,
      end: line.index + line[0].length + (atx ? 0 : lines[i + 1]![0].length),
      level: atx ? atx[1]!.length : underline![1]![0] === "=" ? 1 : 2,
      title,
      ...(number ? { number } : {}),
    });
    if (!atx) i++;
  }
  return headings;
}

function sectionEnd(headings: Heading[], index: number, textLength: number): number {
  const current = headings[index]!;
  for (const next of headings.slice(index + 1)) {
    if (next.level < current.level && !(current.number && next.number?.startsWith(`${current.number}.`))) return next.start;
    if (current.number && next.number) {
      if (!next.number.startsWith(`${current.number}.`)) return next.start;
    } else if (next.level <= current.level && !CONTINUATION.test(next.title)) return next.start;
  }
  return textLength;
}

/** A child procedure inherits warnings in its ancestors' introductions, not sibling chapters. */
function ancestorSafety(text: string, headings: Heading[], index: number): NonNullable<Candidate["safety"]> {
  const child = headings[index]!;
  const safety: NonNullable<Candidate["safety"]> = [];
  const preambleEnd = headings.find((h) => !CONTINUATION.test(h.title))?.start ?? 0;
  if (preambleEnd > 0 && preambleEnd <= child.start) {
    // Preserve warning paragraphs before the first real heading without copying
    // an entire introductory chapter. Long OCR paragraphs can be split by line.
    for (const paragraph of text.slice(0, preambleEnd).matchAll(/\S[\s\S]*?(?=\r?\n[ \t]*\r?\n|$)/g)) {
      const pieces = paragraph[0].length > 2000 && paragraph[0].includes("\n")
        ? [...paragraph[0].matchAll(/\S[^\n]*(?:\n|$)/g)].filter((m) => m[0])
        : [{ index: 0, 0: paragraph[0] }];
      for (const piece of pieces) {
        if (SAFETY.test(piece[0])) safety.push({ start: paragraph.index + piece.index, end: paragraph.index + piece.index + piece[0].length });
      }
    }
  }
  for (let i = 0; i < index; i++) {
    const parent = headings[i]!;
    const ancestor = parent.number && child.number
      ? child.number.startsWith(`${parent.number}.`)
      : parent.level < child.level;
    if (!ancestor || sectionEnd(headings, i, text.length) <= child.start) continue;
    // OCR sometimes promotes "Warning" to the same level as its parent section.
    // Such headings remain part of the introduction until the first real child.
    const firstChild = headings.slice(i + 1).find((h) => !CONTINUATION.test(h.title));
    const end = Math.min(firstChild?.start ?? child.start, child.start);
    if (end <= parent.end || !SAFETY.test(text.slice(parent.end, end))) continue;
    safety.push({ start: parent.start, end, heading: parent.title });
  }
  return safety;
}

function scoreCandidate(text: string, query: Set<string>, actions: Set<string>, start: number, end: number, heading?: string): Candidate | undefined {
  const raw = text.slice(start, end);
  const allWords = words(raw);
  const headingWords = words(heading ?? "");
  const matches = new Set([...query].filter((term) => allWords.has(term)));
  const headingMatches = new Set([...query].filter((term) => headingWords.has(term)));
  if (!matches.size || (actions.size && ![...actions].some((term) => matches.has(term)))) return;
  const weight = (term: string) => actions.has(term) ? 3 : 1;
  const titleScore = [...headingMatches].reduce((sum, term) => sum + 10 * weight(term), 0);
  const bodyScore = [...matches].reduce((sum, term) => sum + 2 * weight(term), 0);
  const steps = (raw.match(/^\s*\d+[.)]\s+/gm) ?? []).length;
  const body = raw.replace(/^.*\r?\n/, "").trim();
  // A contents heading with no real section body must not beat the actual instructions.
  const substantive = body.length >= 40 || steps > 1;
  const referenceOnly = /^(?:see\b|refer(?:\s+to)?\b|for\s+.{0,60}\s+(?:see|refer)\b)/i.test(body) && steps === 0;
  const score = (titleScore + bodyScore + Math.min(steps, 6) * 0.5) * (heading && (!substantive || referenceOnly) ? 0.1 : 1);
  return { start, end, ...(heading ? { heading } : {}), score, matches, headingMatches };
}

function paragraphCandidates(text: string, query: Set<string>, actions: Set<string>): Candidate[] {
  const blocks = [...text.matchAll(/\S[\s\S]*?(?=\r?\n[ \t]*\r?\n|$)/g)]
    .flatMap((paragraph) => {
      // OCR can omit blank lines throughout a long manual. Individual lines still
      // let us locate a late procedure and join its adjacent numbered instructions.
      const pieces = paragraph[0].includes("\n") && (paragraph[0].length > 2000 || /\n\s*\d+[.)]\s+/.test(paragraph[0]))
        ? [...paragraph[0].matchAll(/\S[^\n]*(?:\n|$)/g)].filter((m) => m[0])
        : [{ index: 0, 0: paragraph[0] }];
      return pieces.map((piece) => ({ start: paragraph.index + piece.index, end: paragraph.index + piece.index + piece[0].length, text: piece[0] }));
    });
  const continuation = (block: string) => /^\s*(?:\d+[.)]\s|[-*]\s|(?:please\s+)?note\b|warning\b|caution\b|important\b|<!--\s*(?:image|figure)|!\[)/i.test(block);
  const sectionBoundary = (block: string) => {
    const firstLine = block.split(/\r?\n/, 1)[0]!.trim();
    if (SAFETY.test(firstLine) || /\b(?:do not|never)\b/i.test(firstLine) || /^(?:figure|fig\.?|illustration)\b/i.test(firstLine)) return false;
    return /^#{1,6}\s/.test(firstLine) || /^(?:storage|troubleshooting|specifications|warranty|technical (?:data|specifications)|contents|index|appendix)\b/i.test(firstLine) ||
      (/^[\p{L}\d\s.-]+$/u.test(firstLine) && /\p{L}{3}/u.test(firstLine) && firstLine === firstLine.toUpperCase());
  };
  const sequentialStep = (from: number, expected: number) => {
    let chars = 0;
    // Step explanations may span several paragraphs or OCR lines. Bridge those
    // only when the same numbered sequence resumes nearby, never across a chapter.
    for (let j = from; j < Math.min(blocks.length, from + 8); j++) {
      const block = blocks[j]!;
      chars += block.text.length;
      if (chars > 2500) break;
      const number = /^\s*(\d+)[.)]\s+/.exec(block.text)?.[1];
      if (number) return Number(number) === expected ? j : undefined;
      if (sectionBoundary(block.text)) break;
    }
    return undefined;
  };
  const out: Candidate[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    if (!scoreCandidate(text, query, actions, block.start, block.end)) continue;
    let first = i;
    let last = i;
    while (first > 0 && continuation(blocks[first - 1]!.text)) first--;
    while (last + 1 < blocks.length) {
      if (continuation(blocks[last + 1]!.text)) { last++; continue; }
      const numbers = [...text.slice(blocks[first]!.start, blocks[last]!.end).matchAll(/^\s*(\d+)[.)]\s+/gm)];
      const expected = numbers.length ? Number(numbers.at(-1)![1]) + 1 : 1;
      const next = sequentialStep(last + 1, expected);
      if (next === undefined) break;
      last = next;
    }
    const candidate = scoreCandidate(text, query, actions, blocks[first]!.start, blocks[last]!.end);
    if (candidate) out.push(candidate);
  }
  return out;
}

/**
 * Returns original Markdown ranges. `complete` describes context omissions only;
 * it cannot establish that OCR captured every diagram or that a manual is complete.
 */
export function selectDocumentPassages(text: string, question: string, options: DocumentPassageOptions = {}): DocumentPassage[] {
  const maxChars = Math.max(0, Math.floor(options.maxChars ?? 6000));
  const maxPassages = Math.max(0, Math.floor(options.maxPassages ?? 3));
  const wholeDocumentChars = Math.max(0, Math.floor(options.wholeDocumentChars ?? 1500));
  if (!text.trim() || !maxChars || !maxPassages) return [];
  if (text.length <= wholeDocumentChars) {
    const end = Math.min(text.length, maxChars);
    return [{ text: text.slice(0, end), complete: end === text.length, truncated: end < text.length, start: 0, end, score: 1 }];
  }
  const query = words(question);
  if (!query.size) return [];
  const actions = new Set([...query].filter((term) => ACTIONS.has(term)));
  const headings = headingsIn(text);
  const candidates = headings.flatMap((h, i) => {
    const candidate = scoreCandidate(text, query, actions, h.start, sectionEnd(headings, i, text.length), h.title);
    if (candidate) candidate.safety = ancestorSafety(text, headings, i);
    return candidate ? [candidate] : [];
  });
  if (!candidates.length) candidates.push(...paragraphCandidates(text, query, actions));
  candidates.sort((a, b) => b.score - a.score || (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const actionHeadings = candidates.filter((candidate) => [...candidate.headingMatches].some((term) => actions.has(term)));
  const bestScore = candidates[0]?.score ?? 0;
  const namedSubjects = new Set(actionHeadings.filter((candidate) => candidate.score >= bestScore * 0.6)
    .flatMap((candidate) => [...candidate.headingMatches].filter((term) => !actions.has(term))));
  const sameOperation = (candidate: Candidate) =>
    actions.size > 0 && candidate.score >= bestScore * 0.6 &&
    [...candidate.headingMatches].some((term) => actions.has(term)) &&
    (!namedSubjects.size || [...candidate.headingMatches].some((term) => namedSubjects.has(term)) ||
      /\b(?:prepar\w*|cycle|stage|phase|start\w*|finish\w*|rins(?:e|ing)|cleanup)\b/i.test(candidate.heading ?? "") ||
      [...words(candidate.heading ?? "")].every((term) => actions.has(term) || /^\d+$/.test(term)));
  const selected: DocumentPassage[] = [];
  const covered = new Set<string>();
  let remaining = maxChars;
  let omittedPassages = false;
  for (const candidate of candidates) {
    if (selected.some((passage) => candidate.start < passage.end && candidate.end > passage.start)) continue;
    if (selected.length && ![...candidate.matches].some((term) => !covered.has(term)) && !sameOperation(candidate)) continue;
    if (selected.length >= maxPassages || remaining <= 0) {
      omittedPassages = true;
      continue;
    }
    let omittedSafety = false;
    for (const safety of candidate.safety ?? []) {
      if (selected.some((passage) => passage.start === safety.start && passage.end === safety.end && passage.complete)) continue;
      const length = safety.end - safety.start;
      // Always reserve a slot and a useful excerpt for the actual child. If a
      // warning cannot fit intact, explicitly make the child context incomplete.
      if (selected.length + 1 >= maxPassages || length + Math.min(256, candidate.end - candidate.start) > remaining) {
        omittedSafety = true;
        continue;
      }
      selected.push({ text: text.slice(safety.start, safety.end), heading: safety.heading, complete: true, truncated: false, start: safety.start, end: safety.end, score: candidate.score });
      remaining -= length;
    }
    let end = Math.min(candidate.end, candidate.start + remaining);
    if (end < candidate.end) {
      const lastLine = text.lastIndexOf("\n", end);
      if (lastLine > candidate.start + remaining / 2) end = lastLine;
    }
    const complete = end === candidate.end && !omittedSafety;
    selected.push({ text: text.slice(candidate.start, end), heading: candidate.heading, complete, truncated: !complete, ...(omittedSafety ? { omittedSafety: true } : {}), start: candidate.start, end, score: candidate.score });
    remaining -= end - candidate.start;
    for (const term of candidate.matches) covered.add(term);
    if (!complete) break;
  }
  if (omittedPassages && selected.length) {
    const last = selected[selected.length - 1]!;
    last.complete = false;
    last.truncated = true;
    last.omittedPassages = true;
  }
  // Rank decides what fits; original document order decides what the model reads.
  return selected.sort((a, b) => a.start - b.start);
}

/** Keep the incompleteness warning attached whenever a passage enters model context. */
export function formatDocumentPassage(passage: DocumentPassage): string {
  if (passage.complete) return passage.text;
  const reason = passage.omittedSafety ? "context budget omitted required safety or preparation text from the parent section"
    : passage.omittedPassages ? "context budget omitted additional relevant source passages"
      : "context budget omitted part of this passage";
  return `${passage.text}\n\n[INCOMPLETE SOURCE EXCERPT: ${reason}. Do not present this excerpt as a complete procedure; consult the original attachment for the remaining instructions and warnings.]`;
}

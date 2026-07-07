import { GeneratedSection, SectionType } from './song.types';

const SECTION_TYPES: SectionType[] = [
  'Intro',
  'Verse',
  'Pre-Chorus',
  'Chorus',
  'Bridge',
  'Instrumental',
  'Tag',
  'Outro',
];

const INSTRUMENTAL_TYPES: SectionType[] = ['Intro', 'Instrumental', 'Outro', 'Tag'];

const VALID_REPEAT = new Set([0, 2, 3, 4]);

function inferType(block: string, isChorus: boolean): SectionType {
  const head = block.split('\n')[0]?.trim() ?? '';
  if (/^intro\b/i.test(head) || /^\[intro\]/i.test(head)) return 'Intro';
  if (/^outro\b/i.test(head) || /^\[outro\]/i.test(head)) return 'Outro';
  if (/^bridge\b/i.test(head) || /^\[bridge\]/i.test(head)) return 'Bridge';
  if (/^pre-?chorus\b/i.test(head)) return 'Pre-Chorus';
  if (/^instrumental\b/i.test(head) || /^\[instrumental\]/i.test(head)) return 'Instrumental';
  if (/^tag\b/i.test(head)) return 'Tag';
  if (isChorus || /chorus|refrain|vamp/i.test(block)) return 'Chorus';
  if (/bridge/i.test(block)) return 'Bridge';
  return 'Verse';
}

function stripSectionHeader(block: string): string {
  const lines = block.split('\n');
  if (lines.length > 1 && /^(intro|verse|chorus|bridge|outro|pre-?chorus|instrumental|tag|vamp)\b/i.test(lines[0].trim())) {
    return lines.slice(1).join('\n').trim();
  }
  return block;
}

function countRepeats(block: string, blocks: string[]): number {
  const occurrences = blocks.filter((b) => b === block).length;
  if (occurrences >= 4) return 4;
  if (occurrences === 3) return 3;
  if (occurrences === 2) return 2;
  const match = block.match(/\b(?:repeat|×|x)\s*(\d)\b/i);
  if (match) {
    const n = parseInt(match[1], 10);
    if (n >= 2 && n <= 4) return n;
  }
  return 0;
}

function defaultProg(type: SectionType): Array<string | number> {
  switch (type) {
    case 'Bridge':
      return [4, 5, 6, 4];
    case 'Chorus':
      return [1, 4, 1, 5, 1];
    case 'Intro':
    case 'Outro':
    case 'Instrumental':
      return [1, 5, 6, 4];
    default:
      return [1, 4, 1, 5];
  }
}

function arrangementNote(type: SectionType, repeat: number): string {
  if (repeat >= 3) return 'Repeat with building dynamics each pass.';
  if (type === 'Bridge') return 'Build — add harmonies and drive into the next section.';
  if (type === 'Intro') return 'Establish feel before vocals enter.';
  if (type === 'Outro') return 'Land on the final chord at the MD’s cue.';
  if (type === 'Chorus') return 'Congregation in — open and steady.';
  return '';
}

function sectionLabel(type: SectionType, block: string, verseCount: number, chorusCount: number): string {
  if (type === 'Verse') return `Verse ${verseCount}`;
  if (type === 'Chorus') {
    if (/vamp/i.test(block)) return chorusCount > 0 ? 'Vamp' : 'Chorus / Vamp';
    return chorusCount > 1 ? 'Chorus' : 'Chorus';
  }
  return type;
}

/** Naive structure detection with repeats, types, and basic arrangement cues. */
export function detectStructureManual(
  text: string,
  suggestedKey = 'C',
): Pick<DetectStructureResultShape, 'key' | 'tempo' | 'sections'> {
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  if (!blocks.length) {
    return {
      key: suggestedKey,
      tempo: 76,
      sections: [
        {
          type: 'Verse',
          label: 'Verse 1',
          prog: [1, 4, 1, 5],
          lyrics: text || '',
          repeat: 0,
          bars: '',
          note: '',
          trans: [],
          key: '',
        },
      ],
    };
  }

  let verseCount = 0;
  let chorusCount = 0;
  const sections = blocks.map((block) => {
    const isChorus =
      blocks.filter((x) => x === block).length > 1 ||
      /chorus|refrain|vamp/i.test(block);
    const type = inferType(block, isChorus);
    const lyrics = stripSectionHeader(block);
    const repeat = countRepeats(block, blocks);
    const instrumental = INSTRUMENTAL_TYPES.includes(type) && !lyrics;

    if (type === 'Verse') verseCount++;
    if (type === 'Chorus') chorusCount++;

    const label = sectionLabel(type, block, verseCount, chorusCount);
    const note = arrangementNote(type, repeat);
    const bars = instrumental ? '4–8 bars' : '';

    return {
      type,
      label,
      prog: defaultProg(type),
      lyrics: instrumental ? '' : lyrics,
      repeat,
      bars,
      note,
      trans: [] as Array<string | number>,
      key: '',
    };
  });

  return { key: suggestedKey, tempo: 76, sections };
}

interface DetectStructureResultShape {
  key: string;
  tempo: number;
  sections: GeneratedSection[];
}

export function normalizeSections(raw: unknown): GeneratedSection[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const sections: GeneratedSection[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const row = item as Record<string, unknown>;
    const type = String(row.type ?? '') as SectionType;
    if (!SECTION_TYPES.includes(type)) return null;

    const label = String(row.label ?? '').trim();
    if (!label) return null;

    const lyrics = String(row.lyrics ?? '').trim();
    if (!lyrics && !INSTRUMENTAL_TYPES.includes(type)) return null;

    const progRaw = row.prog;
    if (!Array.isArray(progRaw) || progRaw.length === 0) return null;
    const prog = progRaw.map((p) =>
      typeof p === 'number' ? p : String(p).trim(),
    );
    if (prog.some((p) => p === '')) return null;

    let repeat = typeof row.repeat === 'number' ? row.repeat : 0;
    if (!VALID_REPEAT.has(repeat)) repeat = 0;

    const bars = typeof row.bars === 'string' ? row.bars.trim() : '';
    const note = typeof row.note === 'string' ? row.note.trim() : '';
    const key = typeof row.key === 'string' ? row.key.trim() : '';

    let trans: Array<string | number> = [];
    if (Array.isArray(row.trans)) {
      trans = row.trans
        .map((p) => (typeof p === 'number' ? p : String(p).trim()))
        .filter((p) => p !== '');
    }

    sections.push({ type, label, prog, lyrics, repeat, bars, note, trans, key });
  }

  return sections.length ? sections : null;
}

export function normalizeTempo(raw: unknown, fallback = 76): number {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n) || n < 40 || n > 220) return fallback;
  return Math.round(n);
}

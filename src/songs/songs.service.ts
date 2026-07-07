import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  detectStructureManual,
  normalizeSections,
  normalizeTempo,
} from './manual-structure';
import { DetectStructureDto } from './detect-structure.dto';
import { DetectStructureResult } from './song.types';
import { resolveSongMetadata } from './resolve-metadata';

const STRUCTURE_SYSTEM_PROMPT = `You are a worship-band charting assistant. Analyze lyrics and return a rich JSON chart for live musicians.

Return JSON only with this exact shape:
{
  "title": "Hosanna",
  "artist": "Kirk Franklin",
  "key": "Ab",
  "tempo": 132,
  "sections": [
    {
      "type": "Verse",
      "label": "Verse 1",
      "prog": [1, "5/7", "6m", 4],
      "lyrics": "line one\\nline two",
      "repeat": 2,
      "bars": "4 bars",
      "note": "Leader out front, rhythm section pulls back — builds on the repeat.",
      "trans": ["2m7", 5],
      "key": ""
    }
  ]
}

Field rules:
- type: one of Intro, Verse, Pre-Chorus, Chorus, Bridge, Instrumental, Tag, Outro
- label: descriptive (e.g. "Verse 1", "Chorus", "Vamp", "Vamp (lift)", "Bridge", "Outro (ad-lib)")
- prog: Nashville numbers (1-7) and/or chord symbols (e.g. "5/7", "6m", "2m7") — infer typical progressions for the style/key when not stated
- lyrics: full text with \\n line breaks; empty string for instrumental intro/outro/tag sections
- repeat: 0 (none), 2, 3, or 4 — how many times the band typically loops this section live
- bars: length/feel (e.g. "4 bars", "4–8 bars", "as led")
- note: arrangement & dynamics cue for the MD/musicians (who leads, when to build, congregation in, half-step lift, ritard, etc.)
- trans: transition chords into the next section (e.g. ["2m7", 5]); empty array if none
- key: only set when this section modulates (e.g. "A" for a half-step lift); otherwise ""

Song-level rules:
- title and artist: identify the song from lyrics when possible; use the provided title/artist only when they are clearly correct
- infer key and tempo (BPM) from genre/context when possible
- split structure into all distinct sections in performance order
- repeated choruses/vamps that return later should be separate section entries when arrangement differs
- vamps are type "Chorus" with label "Vamp" or similar
- include intro/outro when typical for the song style
- notes should be as descriptive as a rehearsal chart — repeats, builds, who carries the section, transitions`;

@Injectable()
export class SongsService {
  private readonly logger = new Logger(SongsService.name);
  private openai: OpenAI | null = null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  async detectStructure(dto: DetectStructureDto): Promise<DetectStructureResult> {
    const title = dto.title?.trim() || 'Untitled song';
    const artist = dto.artist?.trim() || 'Unknown artist';
    const suggestedKey = dto.suggestedKey?.trim() || 'C';
    const lyrics = dto.lyrics?.trim() ?? '';

    if (!lyrics) {
      return this.manualResult(title, artist, suggestedKey, '');
    }

    if (this.openai) {
      try {
        const ai = await this.detectWithOpenAi(lyrics, title, artist, suggestedKey);
        if (ai) {
          return { ...ai, source: 'openai' };
        }
      } catch (err) {
        this.logger.warn(
          `OpenAI structure detection failed, using manual fallback: ${err instanceof Error ? err.message : err}`,
        );
      }
    } else {
      this.logger.debug('OPENAI_API_KEY not set — using manual structure detection');
    }

    return this.manualResult(title, artist, suggestedKey, lyrics);
  }

  private manualResult(
    title: string,
    artist: string,
    suggestedKey: string,
    lyrics: string,
  ): DetectStructureResult {
    const { key, tempo, sections } = detectStructureManual(lyrics, suggestedKey);
    return { title, artist, key, tempo, sections, source: 'manual' };
  }

  private async detectWithOpenAi(
    lyrics: string,
    title: string,
    artist: string,
    suggestedKey: string,
  ): Promise<Omit<DetectStructureResult, 'source'> | null> {
    const model = this.config.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';

    const response = await this.openai!.chat.completions.create({
      model,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: STRUCTURE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Title: ${title}\nArtist: ${artist}\nSuggested key: ${suggestedKey}\n\nLyrics:\n${lyrics}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return null;
    }

    if (!parsed || typeof parsed !== 'object') return null;
    const body = parsed as Record<string, unknown>;
    const sections = normalizeSections(body.sections);
    if (!sections) return null;

    const key =
      typeof body.key === 'string' && body.key.trim()
        ? body.key.trim()
        : suggestedKey;

    const tempo = normalizeTempo(body.tempo);
    const { title: resolvedTitle, artist: resolvedArtist } = resolveSongMetadata(
      title,
      artist,
      body,
    );

    return {
      title: resolvedTitle,
      artist: resolvedArtist,
      key,
      tempo,
      sections,
    };
  }
}

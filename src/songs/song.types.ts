export type SectionType =
  | 'Intro'
  | 'Verse'
  | 'Pre-Chorus'
  | 'Chorus'
  | 'Bridge'
  | 'Instrumental'
  | 'Tag'
  | 'Outro';

export interface GeneratedSection {
  type: SectionType;
  label: string;
  prog: Array<string | number>;
  lyrics: string;
  repeat: number;
  bars: string;
  note: string;
  trans: Array<string | number>;
  key: string;
}

export interface DetectStructureResult {
  title: string;
  artist: string;
  key: string;
  tempo: number;
  sections: GeneratedSection[];
  source: 'openai' | 'manual';
}

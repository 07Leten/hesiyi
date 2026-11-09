/**
 * 数据包中的原始记录格式（JSON 文件 / 后端 API 返回值）。
 * 与内存实体的区别：曲谱可以用紧凑的简谱文本录入，由 normalize 展开。
 */
import type {
  Author, Instrument, Performance, Poem, Provenance, ScoreAnnotation, ScoreMeter, ScoreNote, TunePattern, ToneInfo,
} from './types';

export interface ScoreRecord {
  id: string;
  poemId: string;
  tunePatternId: string;
  title: string;
  provenance: Provenance;
  key: { tonic: string; tonicMidi?: number; gongcheKey?: string; shangDegree?: number };
  meter: ScoreMeter;
  tempo: number;
  tempoNote?: string;
  notation?: { primary: 'gongche' | 'jianpu' };
  /** 歌词原文（含标点，「／」分段） */
  lyrics: string;
  /** 逐字声调串，如「平去平平入去」 */
  tones?: string;
  toneSystem?: string;
  toneConfidence?: ToneInfo['confidence'];
  /** 紧凑简谱文本（见 notation/jianpu.ts） */
  jianpu?: string;
  /** 原谱工尺字，按非休止音顺序以空格分隔；未识读处写「□」 */
  gongche?: string;
  /** 完整音符数组（与 jianpu 二选一） */
  notes?: ScoreNote[];
  noteMarks?: { note: number; text: string; uncertain?: boolean }[];
  annotations?: ScoreAnnotation[];
}

export interface PackFiles {
  tunePatterns?: string;
  authors?: string;
  poems?: string;
  scores?: string;
  performances?: string;
}

export interface PackManifestEntry {
  id: string;
  label: string;
  origin: Provenance['origin'];
  description?: string;
  base: string;
  files: PackFiles;
  enabled?: boolean;
}

export interface Manifest {
  version: number;
  instruments: string;
  packs: PackManifestEntry[];
}

export interface RawPack {
  entry: PackManifestEntry;
  tunePatterns: TunePattern[];
  authors: Author[];
  poems: Poem[];
  scores: ScoreRecord[];
  performances: Performance[];
}

export interface RawDataset {
  instruments: Instrument[];
  packs: RawPack[];
}

/**
 * 合四一 · 核心数据实体
 *
 * 所有页面只通过 Repository 读取这些实体；实体本身来自数据包（public/data）
 * 或未来的后端 API，经 normalize 后进入内存。
 */

/** 数据来源类型：文献 / 演示 / AI 创作 / 规则生成（非 AI） */
export type DataOrigin = 'literature' | 'demo' | 'ai' | 'rule';

/** 校订状态 */
export type RevisionStatus = 'unverified' | 'draft' | 'proofread' | 'verified';

export type Dynasty = '唐' | '五代' | '宋' | '金' | '元' | '明' | '清' | '近现代';

/** 小令 / 中调 / 长调（清·毛先舒以字数划分之说，仅作检索便利） */
export type FormType = '小令' | '中调' | '长调';

export type ToneCategory = '平' | '上' | '去' | '入';

export interface Provenance {
  origin: DataOrigin;
  /** 出处书名，如《魏氏乐谱今译》 */
  sourceTitle?: string;
  /** 卷次、页码、曲目编号等 */
  sourceDetail?: string;
  edition?: string;
  editor?: string;
  revisionStatus: RevisionStatus;
  note?: string;
}

/* ---------- 词牌 ---------- */

export interface MeterLine {
  /** 用 平 / 仄 / 中（可平可仄）书写的格律，如「中仄中平中仄」 */
  pattern: string;
  /** rhyme 押韵；none 不押；repeat 叠句（叠韵） */
  mark: 'rhyme' | 'none' | 'repeat';
}

export interface MeterScheme {
  /** 依据的体式说明，如「单调三十三字，五仄韵一叠韵」 */
  description: string;
  stanzas: MeterLine[][];
  rhymeNote?: string;
  source: string;
  verified: boolean;
}

export interface TunePattern {
  id: string;
  name: string;
  aliases: string[];
  summary: string;
  history?: string;
  /** 正体字数；多体词牌以 wordCountNote 说明 */
  wordCount?: number;
  wordCountNote?: string;
  stanzaType?: '单调' | '双调' | '三叠' | '四叠';
  formType?: FormType;
  meter?: MeterScheme | null;
  tags?: string[];
  provenance: Provenance;
}

/* ---------- 作者、词作 ---------- */

export interface Author {
  id: string;
  name: string;
  courtesyName?: string;
  dynasty: Dynasty;
  /** 细分时期，如 北宋 / 南宋 / 南唐 */
  period?: string;
  lifespan?: string;
  bio: string;
  provenance: Provenance;
}

export interface Poem {
  id: string;
  tunePatternId: string;
  /** 词题或首句，如「常记溪亭日暮」 */
  title: string;
  authorId: string;
  dynasty: Dynasty;
  /** 全文，分段以换行分隔 */
  text: string;
  preface?: string;
  note?: string;
  provenance: Provenance;
}

/* ---------- 曲谱 ---------- */

export interface Pitch {
  /** 简谱级数 1–7；0 表示休止 */
  degree: number;
  /** 八度偏移：+1 高音点，-1 低音点 */
  octave: number;
  /** -1 降，0 本音，+1 升 */
  accidental: number;
}

export type BanYan = '板' | '眼';

export interface GongcheGlyph {
  /** 工尺字，如 合、四、一、上、尺、工、凡、六、五、乙、仩… */
  char: string;
  /** 无标准字形时用的八度标记 */
  octaveMark?: 'high' | 'low' | null;
  banyan?: BanYan | null;
  /** true = 由简谱按调门推导；false = 来自原谱 */
  derived: boolean;
  /** 原谱的原始记写（含异体、增减字等），用于保留文献信息 */
  raw?: string;
  note?: string;
}

export interface ScoreNote {
  id: string;
  index: number;
  /** 小节号（从 1 开始） */
  bar: number;
  /** 从曲首起算的拍位 */
  startBeat: number;
  /** 时值（拍），已含延长线 */
  duration: number;
  /** 由延长线「-」带来的额外拍数，用于简谱显示 */
  extensionBeats: number;
  dotted: boolean;
  /** 时值下划线条数（八分 1，十六分 2） */
  underlines: number;
  pitch: Pitch;
  isRest: boolean;
  /** 对应 LyricSyllable.index；休止为 null */
  syllableIndex: number | null;
  /** 是否为同一字的后续腔音（一字多音） */
  isMelisma: boolean;
  gongche?: GongcheGlyph | null;
  uncertain?: boolean;
  uncertaintyNote?: string;
  annotation?: string;
}

export interface ToneInfo {
  category: ToneCategory;
  /** 依据的音韵体系，如「《广韵》中古四声」 */
  system: string;
  confidence: 'demo' | 'reference' | 'verified';
  note?: string;
}

export interface LyricSyllable {
  index: number;
  char: string;
  /** 紧随其后的标点 */
  punctuation?: string;
  lineEnd: boolean;
  stanzaEnd: boolean;
  tone?: ToneInfo | null;
  noteIds: string[];
}

export interface ScoreKey {
  /** 简谱调号主音，如 D */
  tonic: string;
  /** 主音（1）的 MIDI 音高，如 D4 = 62 */
  tonicMidi: number;
  /** 工尺调门，如「小工调」 */
  gongcheKey?: string;
  /** 「上」字对应的简谱级数（小工调为 1） */
  shangDegree?: number;
}

export interface ScoreMeter {
  beatsPerBar: number;
  beatUnit: number;
  /** 板眼形式，如 一板三眼 / 一板一眼 / 散板 */
  banyan?: string;
}

export interface ScoreAnnotation {
  noteIndex?: number;
  syllableIndex?: number;
  text: string;
}

export interface Score {
  id: string;
  poemId: string;
  tunePatternId: string;
  title: string;
  provenance: Provenance;
  key: ScoreKey;
  meter: ScoreMeter;
  /** 建议速度（每分钟拍数） */
  tempo: number;
  tempoNote?: string;
  notation: {
    /** 原始记谱法 */
    primary: 'gongche' | 'jianpu';
    gongcheAvailable: boolean;
    /** 工尺谱是否为推导所得（非原谱） */
    gongcheDerived: boolean;
  };
  toneSystem?: string;
  notes: ScoreNote[];
  syllables: LyricSyllable[];
  annotations: ScoreAnnotation[];
  /** 原始录入文本，原样保留以便核对 */
  raw: {
    jianpu?: string;
    gongche?: string;
    lyrics?: string;
    tones?: string;
  };
  totalBeats: number;
}

/* ---------- 乐器与演奏版本 ---------- */

export type SynthEngine = 'sample';

export interface InstrumentPreset {
  id: string;
  name: string;
  description: string;
  engine: SynthEngine;
  /** public/samples/banks.json 里的录音组 */
  bank: string;
  params: Record<string, number | number[]>;
}

export interface Instrument {
  id: string;
  name: string;
  family: '弹拨' | '吹管' | '拉弦' | '键盘';
  description: string;
  /** 默认选用哪一组录音（以半音计）。只换录音，不把采样变速。 */
  defaultOctaveShift: number;
  defaultGain: number;
  /** 这套录音实际覆盖的音高（MIDI）。超出范围的音区不提供，避免播到一半没声音。 */
  sampleLow: number;
  sampleHigh: number;
  presets: InstrumentPreset[];
}

export interface PerformanceLayer {
  instrumentId: string;
  presetId: string;
  gain: number;
  octaveShift: number;
}

export interface Performance {
  id: string;
  scoreId: string;
  title: string;
  /** 速度倍率（相对曲谱建议速度） */
  tempoScale?: number;
  layers: PerformanceLayer[];
  source: {
    kind: 'sample' | 'recording' | 'ai';
    audioUrl?: string;
    performer?: string;
    note: string;
  };
  provenance: Provenance;
}

/* ---------- 数据包 ---------- */

export interface DataPackInfo {
  id: string;
  label: string;
  origin: DataOrigin;
  description?: string;
  counts: Record<string, number>;
}

export interface Dataset {
  tunePatterns: TunePattern[];
  poems: Poem[];
  authors: Author[];
  scores: Score[];
  instruments: Instrument[];
  performances: Performance[];
  packs: DataPackInfo[];
  issues: DataIssue[];
}

export interface DataIssue {
  level: 'error' | 'warning';
  packId: string;
  entity: string;
  id?: string;
  message: string;
}

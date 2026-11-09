import type { LyricSyllable, ToneCategory, ToneInfo } from '../types';

const LINE_END = '，。？！；：,.?!;:';
const PUNCT = LINE_END + '、·“”‘’「」『』《》（）()';
const STANZA_BREAK = '／/\n';

export function isHanChar(c: string): boolean {
  return /\p{Script=Han}/u.test(c);
}

/** 只保留汉字，用于计算字数和对齐 */
export function hanChars(text: string): string[] {
  return [...text].filter(isHanChar);
}

/**
 * 将歌词文本切分为逐字音节。
 * 标点附着到前一字；句末标点标记 lineEnd；「／」或换行标记段落结束。
 */
export function splitLyrics(text: string): LyricSyllable[] {
  const out: LyricSyllable[] = [];
  for (const c of text) {
    if (isHanChar(c)) {
      out.push({ index: out.length, char: c, lineEnd: false, stanzaEnd: false, noteIds: [] });
      continue;
    }
    const prev = out[out.length - 1];
    if (!prev) continue;
    if (STANZA_BREAK.includes(c)) {
      prev.stanzaEnd = true;
      prev.lineEnd = true;
    } else if (PUNCT.includes(c)) {
      prev.punctuation = (prev.punctuation ?? '') + c;
      if (LINE_END.includes(c)) prev.lineEnd = true;
    }
  }
  const last = out[out.length - 1];
  if (last) {
    last.lineEnd = true;
    last.stanzaEnd = true;
  }
  return out;
}

const TONES: ToneCategory[] = ['平', '上', '去', '入'];

/** 解析声调串，如「平去平平入去」；「?」表示未定 */
export function parseTones(tones: string | undefined, system: string, confidence: ToneInfo['confidence']): (ToneInfo | null)[] {
  if (!tones) return [];
  return [...tones.replace(/[\s，。／|]/g, '')].map((c) =>
    TONES.includes(c as ToneCategory) ? { category: c as ToneCategory, system, confidence } : null,
  );
}

export function isOblique(t: ToneCategory): boolean {
  return t !== '平';
}

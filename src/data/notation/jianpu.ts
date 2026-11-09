/**
 * 简谱文本解析器
 *
 * 便于把《魏氏乐谱今译》中的简谱逐小节录入为文本，再规范化为 ScoreNote。
 *
 * 语法（以空格分隔记号，以 | 分隔小节）：
 *   1–7      音级；0 为休止
 *   # / b    前缀：升 / 降
 *   ' / ,    后缀：高八度 / 低八度，可重复
 *   _        后缀：减半时值（_ 八分，__ 十六分）
 *   .        后缀：附点
 *   ~        后缀：与前一音同属一字（一字多音、拖腔）
 *   ?        后缀：存疑音（转写或识读不确定）
 *   -        独立记号：前一音延长一拍
 *
 * 例：  3 5_ 6_~ 1' 6_ 5_~ | 3 2_ 3_~ 5~ -
 */

export interface ParsedNote {
  degree: number;
  octave: number;
  accidental: number;
  duration: number;
  extensionBeats: number;
  dotted: boolean;
  underlines: number;
  melisma: boolean;
  uncertain: boolean;
  bar: number;
  startBeat: number;
  raw: string;
}

export interface ParseResult {
  notes: ParsedNote[];
  totalBeats: number;
  barCount: number;
  warnings: string[];
}

const NOTE_RE = /^([#b]?)([0-7])([',]*)(_{0,3})(\.?)([~?]*)$/;

export function parseJianpu(text: string, beatsPerBar?: number): ParseResult {
  const tokens = text.replace(/\|/g, ' | ').split(/\s+/).filter(Boolean);
  const notes: ParsedNote[] = [];
  const warnings: string[] = [];
  let bar = 1;
  let beat = 0;
  let barStartBeat = 0;

  const closeBar = () => {
    const len = beat - barStartBeat;
    if (beatsPerBar && Math.abs(len - beatsPerBar) > 1e-6) {
      warnings.push(`第 ${bar} 小节为 ${len} 拍，与拍号 ${beatsPerBar} 拍不符`);
    }
    bar += 1;
    barStartBeat = beat;
  };

  for (const tok of tokens) {
    if (tok === '|') {
      closeBar();
      continue;
    }
    if (tok === '-') {
      const prev = notes[notes.length - 1];
      if (!prev) {
        warnings.push('延长线「-」前没有音符，已忽略');
        continue;
      }
      prev.duration += 1;
      prev.extensionBeats += 1;
      beat += 1;
      continue;
    }
    const m = NOTE_RE.exec(tok);
    if (!m) {
      warnings.push(`无法识别的记号「${tok}」，已跳过`);
      continue;
    }
    const [, acc, deg, oct, under, dot, flags] = m;
    const octave = [...oct].reduce((s, c) => s + (c === "'" ? 1 : -1), 0);
    const underlines = under.length;
    let duration = 1 / Math.pow(2, underlines);
    if (dot) duration *= 1.5;
    notes.push({
      degree: Number(deg),
      octave,
      accidental: acc === '#' ? 1 : acc === 'b' ? -1 : 0,
      duration,
      extensionBeats: 0,
      dotted: Boolean(dot),
      underlines,
      melisma: flags.includes('~'),
      uncertain: flags.includes('?'),
      bar,
      startBeat: beat,
      raw: tok,
    });
    beat += duration;
  }
  if (beat > barStartBeat) closeBar();

  return { notes, totalBeats: beat, barCount: bar - 1, warnings };
}

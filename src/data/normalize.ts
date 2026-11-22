import { banyanAt, deriveGongche } from './notation/gongche';
import { parseJianpu } from './notation/jianpu';
import { hanChars, parseTones, splitLyrics } from './notation/lyrics';
import { tonicToMidi } from './notation/pitch';
import type { RawDataset, ScoreRecord } from './records';
import type { DataIssue, Dataset, FormType, Score, ScoreNote, TunePattern } from './types';

export function formTypeFor(wordCount?: number): FormType | undefined {
  if (!wordCount) return undefined;
  if (wordCount <= 58) return '小令';
  if (wordCount <= 90) return '中调';
  return '长调';
}

export function normalizeScore(rec: ScoreRecord, packId: string, issues: DataIssue[]): Score {
  const warn = (message: string, level: DataIssue['level'] = 'warning') =>
    issues.push({ level, packId, entity: 'Score', id: rec.id, message });

  const shangDegree = rec.key.shangDegree ?? 1;
  const tonicMidi = rec.key.tonicMidi ?? tonicToMidi(rec.key.tonic);
  const syllables = splitLyrics(rec.lyrics);
  const toneSystem = rec.toneSystem ?? '《广韵》中古四声';
  const tones = parseTones(rec.tones, toneSystem, rec.toneConfidence ?? 'demo');
  if (tones.length && tones.length !== syllables.length) {
    warn(`声调串 ${tones.length} 字，歌词 ${syllables.length} 字，未能完全对齐`);
  }
  syllables.forEach((s, i) => (s.tone = tones[i] ?? null));

  let notes: ScoreNote[] = [];
  let totalBeats = 0;

  if (rec.notes?.length) {
    notes = rec.notes.map((n, i) => ({ ...n, index: i, id: n.id || `${rec.id}-n${i}` }));
    let barStart = 0;
    let currentBar = 0;
    for (const n of notes) {
      if (n.bar !== currentBar) {
        currentBar = n.bar;
        barStart = n.startBeat;
      }
      if (!n.gongche) n.gongche = deriveGongche(n.pitch, shangDegree, banyanAt(n.startBeat - barStart));
    }
    const last = notes[notes.length - 1];
    totalBeats = last ? last.startBeat + last.duration : 0;
  } else if (rec.jianpu) {
    const parsed = parseJianpu(rec.jianpu, rec.meter.beatsPerBar);
    parsed.warnings.forEach((w) => warn(w));
    totalBeats = parsed.totalBeats;

    const originalGongche = rec.gongche?.split(/\s+/).filter(Boolean);
    let syl = -1;
    let pitched = 0;
    let barStart = 0;
    let currentBar = 0;

    notes = parsed.notes.map((p, i) => {
      if (p.bar !== currentBar) {
        currentBar = p.bar;
        barStart = p.startBeat;
      }
      const isRest = p.degree === 0;
      let syllableIndex: number | null = null;
      if (!isRest) {
        if (!p.melisma || syl < 0) syl += 1;
        syllableIndex = syl;
      }
      const pitch = { degree: p.degree, octave: p.octave, accidental: p.accidental };
      const banyan = banyanAt(p.startBeat - barStart);
      let gongche = deriveGongche(pitch, shangDegree, banyan);
      if (originalGongche && !isRest) {
        const raw = originalGongche[pitched];
        if (raw) gongche = { char: raw === '□' ? '' : raw, banyan, derived: false, raw, octaveMark: null };
        pitched += 1;
      }
      return {
        id: `${rec.id}-n${i}`,
        index: i,
        bar: p.bar,
        startBeat: p.startBeat,
        duration: p.duration,
        extensionBeats: p.extensionBeats,
        dotted: p.dotted,
        underlines: p.underlines,
        pitch,
        isRest,
        syllableIndex,
        isMelisma: !isRest && p.melisma,
        gongche,
        uncertain: p.uncertain || undefined,
      } satisfies ScoreNote;
    });
    const sylCount = syl + 1;
    if (sylCount !== syllables.length) {
      warn(`曲谱含 ${sylCount} 个字位，歌词为 ${syllables.length} 字，逐字对齐可能有误`, 'error');
    }
  } else {
    warn('曲谱既无 notes 也无 jianpu 文本，无法播放', 'error');
  }

  for (const mark of rec.noteMarks ?? []) {
    const n = notes[mark.note];
    if (!n) {
      warn(`注释指向不存在的第 ${mark.note} 个音`);
      continue;
    }
    if (mark.uncertain) {
      n.uncertain = true;
      n.uncertaintyNote = mark.text;
    } else {
      n.annotation = mark.text;
    }
  }

  for (const n of notes) {
    if (n.syllableIndex != null) syllables[n.syllableIndex]?.noteIds.push(n.id);
  }

  return {
    id: rec.id,
    poemId: rec.poemId,
    tunePatternId: rec.tunePatternId,
    title: rec.title,
    provenance: rec.provenance,
    key: { tonic: rec.key.tonic, tonicMidi, gongcheKey: rec.key.gongcheKey, shangDegree },
    meter: rec.meter,
    tempo: rec.tempo,
    tempoNote: rec.tempoNote,
    notation: {
      primary: rec.notation?.primary ?? 'jianpu',
      gongcheAvailable: notes.some((n) => n.gongche?.char),
      gongcheDerived: !rec.gongche,
    },
    toneSystem: rec.tones ? toneSystem : undefined,
    notes,
    syllables,
    annotations: rec.annotations ?? [],
    raw: { jianpu: rec.jianpu, gongche: rec.gongche, lyrics: rec.lyrics, tones: rec.tones },
    totalBeats,
  };
}

/** 合并多个数据包：后加载的包按 id 覆盖先加载的包，并做引用完整性校验 */
export function buildDataset(raw: RawDataset): Dataset {
  const issues: DataIssue[] = [];
  const tunes = new Map<string, TunePattern>();
  const authors = new Map<string, Dataset['authors'][number]>();
  const poems = new Map<string, Dataset['poems'][number]>();
  const scores = new Map<string, Score>();
  const performances = new Map<string, Dataset['performances'][number]>();

  const packs = raw.packs.map((pack) => {
    const id = pack.entry.id;
    pack.tunePatterns.forEach((t) =>
      tunes.set(t.id, { ...t, formType: t.formType ?? formTypeFor(t.wordCount) }),
    );
    pack.authors.forEach((a) => authors.set(a.id, a));
    pack.poems.forEach((p) => poems.set(p.id, p));
    pack.scores.forEach((s) => scores.set(s.id, normalizeScore(s, id, issues)));
    pack.performances.forEach((p) => performances.set(p.id, p));
    return {
      id,
      label: pack.entry.label,
      origin: pack.entry.origin,
      description: pack.entry.description,
      counts: {
        词牌: pack.tunePatterns.length,
        作者: pack.authors.length,
        词作: pack.poems.length,
        曲谱: pack.scores.length,
        演奏版本: pack.performances.length,
      },
    };
  });

  const ref = (entity: string, id: string, message: string) =>
    issues.push({ level: 'error', packId: '-', entity, id, message });

  for (const p of poems.values()) {
    if (!tunes.has(p.tunePatternId)) ref('Poem', p.id, `引用了不存在的词牌 ${p.tunePatternId}`);
    if (!authors.has(p.authorId)) ref('Poem', p.id, `引用了不存在的作者 ${p.authorId}`);
  }
  for (const s of scores.values()) {
    const poem = poems.get(s.poemId);
    if (!poem) ref('Score', s.id, `引用了不存在的词作 ${s.poemId}`);
    else if (hanChars(poem.text).join('') !== s.syllables.map((x) => x.char).join('')) {
      issues.push({
        level: 'warning', packId: '-', entity: 'Score', id: s.id,
        message: '曲谱歌词与词作正文不完全一致（可能为异文），作品全文的逐字高亮将停用',
      });
    }
  }
  for (const p of performances.values()) {
    if (!scores.has(p.scoreId)) ref('Performance', p.id, `引用了不存在的曲谱 ${p.scoreId}`);
    for (const l of p.layers) {
      const inst = raw.instruments.find((i) => i.id === l.instrumentId);
      if (!inst) ref('Performance', p.id, `引用了不存在的乐器 ${l.instrumentId}`);
      else if (!inst.presets.some((x) => x.id === l.presetId)) ref('Performance', p.id, `乐器 ${inst.name} 没有音色 ${l.presetId}`);
    }
  }

  return {
    tunePatterns: [...tunes.values()],
    authors: [...authors.values()],
    poems: [...poems.values()],
    scores: [...scores.values()],
    performances: [...performances.values()],
    instruments: raw.instruments,
    packs,
    issues,
  };
}

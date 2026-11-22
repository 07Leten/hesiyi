import { hanChars } from './notation/lyrics';
import type {
  Author, Dataset, Dynasty, FormType, Instrument, Performance, Poem, Score, TunePattern,
} from './types';

export type SearchField = 'all' | 'tune' | 'author' | 'poem';
export type ScoreFilter = 'any' | 'has' | 'literature' | 'model' | 'restore' | 'none';

export interface LibraryQuery {
  text: string;
  field: SearchField;
  dynasties: Dynasty[];
  forms: FormType[];
  minWords?: number;
  maxWords?: number;
  score: ScoreFilter;
  playableOnly: boolean;
}

export interface TuneStats {
  poemCount: number;
  scoreCount: number;
  literatureScoreCount: number;
  demoScoreCount: number;
  modelScoreCount: number;
  restoreScoreCount: number;
  playable: boolean;
  playableLiterature: boolean;
  authors: Author[];
  dynasties: Dynasty[];
}

export function scoreOriginLabel(st: TuneStats): string {
  const parts: string[] = [];
  if (st.literatureScoreCount) parts.push('文献');
  if (st.restoreScoreCount) parts.push('唱词清理');
  if (st.modelScoreCount) parts.push('模型预测');
  if (st.demoScoreCount) parts.push('演示');
  return parts.length ? `（${parts.join('、')}）` : '';
}

export interface SearchResult {
  tunes: TunePattern[];
  poems: Poem[];
}

const norm = (s: string) => s.trim().toLowerCase();

export function isPlayable(s: Score): boolean {
  return s.notes.some((n) => !n.isRest);
}

export class Repository {
  readonly data: Dataset;
  private tuneById = new Map<string, TunePattern>();
  private poemById = new Map<string, Poem>();
  private authorById = new Map<string, Author>();
  private scoreById = new Map<string, Score>();
  private instrumentById = new Map<string, Instrument>();
  private statsCache = new Map<string, TuneStats>();

  constructor(data: Dataset) {
    this.data = data;
    data.tunePatterns.forEach((t) => this.tuneById.set(t.id, t));
    data.poems.forEach((p) => this.poemById.set(p.id, p));
    data.authors.forEach((a) => this.authorById.set(a.id, a));
    data.scores.forEach((s) => this.scoreById.set(s.id, s));
    data.instruments.forEach((i) => this.instrumentById.set(i.id, i));
  }

  tune(id: string) { return this.tuneById.get(id); }
  poem(id: string) { return this.poemById.get(id); }
  author(id: string) { return this.authorById.get(id); }
  score(id: string) { return this.scoreById.get(id); }
  instrument(id: string) { return this.instrumentById.get(id); }

  poemsByTune(tuneId: string) { return this.data.poems.filter((p) => p.tunePatternId === tuneId); }
  poemsByAuthor(authorId: string) { return this.data.poems.filter((p) => p.authorId === authorId); }
  scoresByPoem(poemId: string) { return this.data.scores.filter((s) => s.poemId === poemId); }
  scoresByTune(tuneId: string) { return this.data.scores.filter((s) => s.tunePatternId === tuneId); }
  performancesByScore(scoreId: string): Performance[] {
    return this.data.performances.filter((p) => p.scoreId === scoreId);
  }

  /** 可播放曲谱的顺序列表，供上一曲 / 下一曲使用 */
  playableScores(): Score[] {
    return this.data.scores.filter(isPlayable);
  }

  tuneStats(tuneId: string): TuneStats {
    const cached = this.statsCache.get(tuneId);
    if (cached) return cached;
    const poems = this.poemsByTune(tuneId);
    const scores = this.scoresByTune(tuneId);
    const lit = scores.filter((s) => s.provenance.origin === 'literature');
    const authorIds = [...new Set(poems.map((p) => p.authorId))];
    const stats: TuneStats = {
      poemCount: poems.length,
      scoreCount: scores.length,
      literatureScoreCount: lit.length,
      demoScoreCount: scores.filter((s) => s.provenance.origin === 'demo').length,
      modelScoreCount: scores.filter((s) => s.provenance.origin === 'model').length,
      restoreScoreCount: scores.filter((s) => s.provenance.origin === 'restore').length,
      playable: scores.some(isPlayable),
      playableLiterature: lit.some(isPlayable),
      authors: authorIds.map((id) => this.authorById.get(id)).filter((a): a is Author => Boolean(a)),
      dynasties: [...new Set(poems.map((p) => p.dynasty))],
    };
    this.statsCache.set(tuneId, stats);
    return stats;
  }

  private matchTuneText(t: TunePattern, q: string, field: SearchField): boolean {
    if (!q) return true;
    const byName = norm(t.name).includes(q) || t.aliases.some((a) => norm(a).includes(q));
    if (field === 'tune') return byName;
    const poems = this.poemsByTune(t.id);
    const byAuthor = poems.some((p) => this.matchAuthor(p, q));
    const byPoem = poems.some((p) => this.matchPoem(p, q));
    if (field === 'author') return byAuthor;
    if (field === 'poem') return byPoem;
    return byName || byAuthor || byPoem;
  }

  private matchAuthor(p: Poem, q: string) {
    const a = this.authorById.get(p.authorId);
    return Boolean(a && (norm(a.name).includes(q) || (a.courtesyName && norm(a.courtesyName).includes(q))));
  }

  private matchPoem(p: Poem, q: string) {
    return norm(p.title).includes(q) || hanChars(p.text).join('').includes(q) || norm(p.preface ?? '').includes(q);
  }

  private passesFilters(t: TunePattern, q: LibraryQuery): boolean {
    const st = this.tuneStats(t.id);
    if (q.dynasties.length && !st.dynasties.some((d) => q.dynasties.includes(d))) return false;
    if (q.forms.length && (!t.formType || !q.forms.includes(t.formType))) return false;
    if (q.minWords && (!t.wordCount || t.wordCount < q.minWords)) return false;
    if (q.maxWords && (!t.wordCount || t.wordCount > q.maxWords)) return false;
    if (q.score === 'has' && st.scoreCount === 0) return false;
    if (q.score === 'literature' && st.literatureScoreCount === 0) return false;
    if (q.score === 'model' && st.modelScoreCount === 0) return false;
    if (q.score === 'restore' && st.restoreScoreCount === 0) return false;
    if (q.score === 'none' && st.scoreCount > 0) return false;
    if (q.playableOnly && !st.playable) return false;
    return true;
  }

  search(q: LibraryQuery): SearchResult {
    const text = norm(q.text);
    const tunes = this.data.tunePatterns.filter((t) => this.matchTuneText(t, text, q.field) && this.passesFilters(t, q));
    const tuneIds = new Set(tunes.map((t) => t.id));
    const poems = this.data.poems.filter((p) => {
      if (!tuneIds.has(p.tunePatternId)) return false;
      if (q.dynasties.length && !q.dynasties.includes(p.dynasty)) return false;
      if (q.playableOnly && !this.scoresByPoem(p.id).some(isPlayable)) return false;
      if (q.score === 'has' && this.scoresByPoem(p.id).length === 0) return false;
      if (q.score === 'literature' && !this.scoresByPoem(p.id).some((s) => s.provenance.origin === 'literature')) return false;
      if (q.score === 'model' && !this.scoresByPoem(p.id).some((s) => s.provenance.origin === 'model')) return false;
      if (q.score === 'restore' && !this.scoresByPoem(p.id).some((s) => s.provenance.origin === 'restore')) return false;
      if (q.score === 'none' && this.scoresByPoem(p.id).length > 0) return false;
      if (!text) return true;
      const t = this.tuneById.get(p.tunePatternId);
      const tuneHit = Boolean(t && (norm(t.name).includes(text) || t.aliases.some((a) => norm(a).includes(text))));
      switch (q.field) {
        case 'tune': return tuneHit;
        case 'author': return this.matchAuthor(p, text);
        case 'poem': return this.matchPoem(p, text);
        default: return tuneHit || this.matchAuthor(p, text) || this.matchPoem(p, text);
      }
    });
    return { tunes, poems };
  }

  /** 首页「今日推荐」：按日期在有曲谱的词作中轮换 */
  dailyPick(date = new Date()): { poem: Poem; score: Score } | null {
    const scored = this.playableScores();
    if (!scored.length) return null;
    const day = Math.floor(date.getTime() / 86_400_000);
    const score = scored[day % scored.length];
    const poem = this.poemById.get(score.poemId);
    return poem ? { poem, score } : null;
  }
}

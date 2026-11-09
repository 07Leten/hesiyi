import { splitLyrics } from '../../data/notation/lyrics';
import { normalizeScore } from '../../data/normalize';
import type { DataIssue, ToneCategory } from '../../data/types';
import type { GenerationJob, GenerationRequest, MusicGenerationProvider } from './types';

/**
 * 本地规则旋律（非 AI）。
 *
 * 依据字声的高低走向与句读，在五声音阶上排布旋律：
 * 平声字持平、上声字上行、去声字下行、入声字短促，句末拖腔收于调式主音。
 * 它只用于演示创作流程，产物明确标记为「规则生成」，不冒充 AI 或文献。
 */

const LADDER: [number, number][] = [
  [5, -1], [6, -1], [1, 0], [2, 0], [3, 0], [5, 0], [6, 0], [1, 1], [2, 1], [3, 1],
];

const MODES: Record<string, { home: number; label: string }> = {
  清丽: { home: 2, label: '宫调式' },
  婉约: { home: 1, label: '羽调式' },
  沉郁: { home: 3, label: '商调式' },
  旷达: { home: 5, label: '徵调式' },
  激越: { home: 7, label: '宫调式（高音区）' },
};

const STYLE_TEMPO: Record<string, number> = { 琴歌: 58, 昆曲韵味: 62, 江南丝竹: 76, 现代国风: 84 };
const MOOD_TEMPO: Record<string, number> = { 清丽: 4, 婉约: -4, 沉郁: -8, 旷达: 6, 激越: 12 };

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const tok = (i: number, suffix = '') => {
  const [d, o] = LADDER[Math.max(0, Math.min(LADDER.length - 1, i))];
  return `${d}${o > 0 ? "'".repeat(o) : ','.repeat(-o)}${suffix}`;
};

export function composeByRules(req: GenerationRequest) {
  const rand = rng(req.seed);
  const syl = splitLyrics(req.text);
  const toneChars = [...(req.tones ?? '').replace(/[^平上去入仄中?？]/g, '')];
  const mode = MODES[req.mood] ?? MODES['清丽'];
  const melismaRate = req.style === '昆曲韵味' ? 0.45 : req.style === '琴歌' ? 0.3 : 0.15;

  const out: string[] = [];
  let beat = 0;
  const BAR = 4;

  const push = (index: number, len: 0.5 | 1, melisma: boolean) => {
    const posInBar = beat % BAR;
    if (len === 1 && posInBar === BAR - 0.5) {
      out.push(tok(index, '_' + (melisma ? '~' : '')), '|', tok(index, '_~'));
    } else {
      out.push(tok(index, (len === 0.5 ? '_' : '') + (melisma ? '~' : '')));
      if ((beat + len) % BAR === 0) out.push('|');
    }
    beat += len;
  };
  const rest = (len: 0.5 | 1) => {
    out.push(len === 0.5 ? '0_' : '0');
    beat += len;
    if (beat % BAR === 0) out.push('|');
  };
  const hold = () => {
    out.push('-');
    beat += 1;
    if (beat % BAR === 0) out.push('|');
  };

  let pos = mode.home;
  syl.forEach((s, i) => {
    const t = toneChars[i];
    const tone: ToneCategory | '仄' | null = t === '平' || t === '上' || t === '去' || t === '入' || t === '仄' ? t : null;
    const drift = rand() < 0.5 ? -1 : 1;
    pos = Math.max(1, Math.min(LADDER.length - 3, pos + (tone === '平' ? 0 : drift)));
    if (Math.abs(pos - mode.home) > 3) pos += pos > mode.home ? -1 : 1;

    if (s.lineEnd) {
      const target = s.stanzaEnd && i === syl.length - 1 ? mode.home : rand() < 0.5 ? mode.home : mode.home + 1;
      push(pos, 0.5, false);
      push(target + 1, 0.5, true);
      push(target, 1, true);
      while (beat % BAR !== 0) {
        if (beat % 1 !== 0) rest(0.5);
        else hold();
      }
      return;
    }
    switch (tone) {
      case '上':
        push(pos, 0.5, false);
        push(pos + 1, 0.5, true);
        break;
      case '去':
      case '仄':
        push(pos + 1, 0.5, false);
        push(pos, 0.5, true);
        break;
      case '入':
        push(pos, 0.5, false);
        rest(0.5);
        break;
      default:
        if (rand() < melismaRate) {
          push(pos, 0.5, false);
          push(pos + drift, 0.5, true);
        } else push(pos, 1, false);
    }
  });
  if (out[out.length - 1] === '|') out.pop();

  const tempo = (STYLE_TEMPO[req.style] ?? 66) + (MOOD_TEMPO[req.mood] ?? 0);
  const issues: DataIssue[] = [];
  const id = `rule-${req.seed.toString(36)}`;
  const score = normalizeScore(
    {
      id,
      poemId: req.poemId ?? 'custom',
      tunePatternId: req.tunePatternId ?? 'custom',
      title: `${req.title}（规则生成）`,
      provenance: {
        origin: 'rule',
        revisionStatus: 'unverified',
        note: `本地规则生成，非 AI、非文献：按字声走向与句读在五声${mode.label}上排布旋律，仅用于演示创作流程。`,
      },
      key: { tonic: 'D', tonicMidi: 62, gongcheKey: '小工调', shangDegree: 1 },
      meter: { beatsPerBar: BAR, beatUnit: 4 },
      tempo,
      lyrics: req.text,
      tones: toneChars.every((c) => '平上去入'.includes(c)) && toneChars.length ? toneChars.join('') : undefined,
      toneSystem: '用户提供的字声',
      toneConfidence: 'demo',
      jianpu: out.join(' '),
    },
    'local-rule',
    issues,
  );
  return { score, issues };
}

export class LocalRuleProvider implements MusicGenerationProvider {
  readonly id = 'local-rule';
  readonly label = '本地规则旋律（非 AI）';
  readonly description = '在浏览器内按字声与句读规则即时排布一段旋律，用于体验创作流程。结果标记为「规则生成」，不是 AI 作品。';
  readonly isAI = false;
  readonly capabilities = { vocal: false, audio: false, symbolic: true };

  isConfigured() {
    return true;
  }

  async submit(req: GenerationRequest): Promise<GenerationJob> {
    if (req.vocal) throw new Error('本地规则旋律只能生成纯音乐，不能生成演唱版本。');
    const { score } = composeByRules(req);
    return {
      id: score.id,
      providerId: this.id,
      status: 'succeeded',
      request: req,
      createdAt: Date.now(),
      result: { score, model: 'rules-v1', note: '规则生成 · 非 AI' },
    };
  }
}

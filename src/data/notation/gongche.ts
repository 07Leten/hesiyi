import type { BanYan, GongcheGlyph, Pitch } from '../types';

/**
 * 工尺字推导
 *
 * 以「上」字所在的简谱级数为基准（小工调：上 = 1），按音阶位置推出工尺字。
 * 只有通行、无争议的字形直接给出（合四一 / 上尺工凡六五乙 / 仩伬仜），
 * 其余高低八度以「高 / 低」标记呈现，不自造字形。
 * 工尺谱与简谱并非严格一一对应，推导结果一律标记 derived = true。
 */

const MIDDLE = ['上', '尺', '工', '凡', '六', '五', '乙'];
const LOW_SPECIAL: Record<number, string> = { [-3]: '合', [-2]: '四', [-1]: '一' };
const HIGH_SPECIAL: Record<number, string> = { 7: '仩', 8: '伬', 9: '仜' };

export interface GongcheRow {
  char: string;
  octaveMark: 'high' | 'low' | null;
  degree: number;
  octave: number;
}

/** 由音阶位置（以「上」为 0）求工尺字 */
export function gongcheForStep(step: number): { char: string; octaveMark: 'high' | 'low' | null } {
  if (LOW_SPECIAL[step]) return { char: LOW_SPECIAL[step], octaveMark: null };
  if (HIGH_SPECIAL[step]) return { char: HIGH_SPECIAL[step], octaveMark: null };
  const octave = Math.floor(step / 7);
  const name = MIDDLE[((step % 7) + 7) % 7];
  if (octave === 0) return { char: name, octaveMark: null };
  return { char: name, octaveMark: octave > 0 ? 'high' : 'low' };
}

export function deriveGongche(p: Pitch, shangDegree = 1, banyan: BanYan | null = null): GongcheGlyph | null {
  if (p.degree < 1) {
    return banyan ? { char: '', octaveMark: null, banyan, derived: true, note: '休止（空板 / 空眼）' } : null;
  }
  const step = p.degree - shangDegree + 7 * p.octave;
  const g = gongcheForStep(step);
  return {
    char: g.char,
    octaveMark: g.octaveMark,
    banyan,
    derived: true,
    note: p.accidental !== 0 ? '变化音无统一的工尺对应，待校' : undefined,
  };
}

/** 学习页用：小工调下合四一至仜的完整对照 */
export function gongcheTable(shangDegree = 1): GongcheRow[] {
  const rows: GongcheRow[] = [];
  for (let step = -3; step <= 9; step++) {
    const g = gongcheForStep(step);
    const abs = step + shangDegree - 1;
    rows.push({
      char: g.char,
      octaveMark: g.octaveMark,
      degree: (((abs % 7) + 7) % 7) + 1,
      octave: Math.floor(abs / 7),
    });
  }
  return rows;
}

/** 按拍位推定板眼：小节首拍为板，其余整拍为眼 */
export function banyanAt(beatInBar: number): BanYan | null {
  if (Math.abs(beatInBar) < 1e-6) return '板';
  if (Math.abs(beatInBar - Math.round(beatInBar)) < 1e-6) return '眼';
  return null;
}

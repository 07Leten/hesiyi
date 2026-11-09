import type { Pitch } from '../types';

const DEGREE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

const TONIC_MIDI: Record<string, number> = {
  C: 60, 'C#': 61, Db: 61, D: 62, 'D#': 63, Eb: 63, E: 64, F: 65,
  'F#': 66, Gb: 66, G: 55, 'G#': 56, Ab: 56, A: 57, 'A#': 58, Bb: 58, B: 59,
};

export function tonicToMidi(tonic: string): number {
  return TONIC_MIDI[tonic] ?? 62;
}

export function pitchToMidi(p: Pitch, tonicMidi: number): number | null {
  if (p.degree < 1 || p.degree > 7) return null;
  return tonicMidi + DEGREE_SEMITONES[p.degree - 1] + p.accidental + p.octave * 12;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

import { fadeOut, noiseBuffer, num, safeStop, vibrato, type NoteSpec, type SynthParams, type Voice } from './common';

/** 拉弦音色：双锯齿波 + 琴筒共鸣峰 + 弓噪 + 揉弦；换音时从前一音滑入 */
export function bowedVoice(ctx: BaseAudioContext, out: AudioNode, p: SynthParams, s: NoteSpec): Voice {
  const level = num(p, 'level', 0.5) * s.velocity;
  const attack = num(p, 'attack', 0.08);
  const release = num(p, 'release', 0.15);
  const porta = num(p, 'portamento', 0.06);

  const o1 = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  o1.type = 'sawtooth';
  o2.type = 'sawtooth';
  o2.detune.value = 7;
  const mix2 = ctx.createGain();
  mix2.gain.value = 0.45;

  const startFreq = s.prevFreq && porta > 0 ? s.prevFreq : s.freq;
  for (const o of [o1, o2]) {
    o.frequency.setValueAtTime(startFreq, s.when);
    if (startFreq !== s.freq) o.frequency.exponentialRampToValueAtTime(s.freq, s.when + porta);
  }

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = num(p, 'cutoff', 3000);
  lp.Q.value = 0.7;
  const f1 = ctx.createBiquadFilter();
  f1.type = 'peaking';
  f1.frequency.value = num(p, 'formant1', 900);
  f1.Q.value = 1.4;
  f1.gain.value = 7;
  const f2 = ctx.createBiquadFilter();
  f2.type = 'peaking';
  f2.frequency.value = num(p, 'formant2', 2400);
  f2.Q.value = 2;
  f2.gain.value = 4;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 220;

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, s.when);
  amp.gain.linearRampToValueAtTime(level * 0.8, s.when + attack);
  amp.gain.linearRampToValueAtTime(level, s.when + attack + Math.min(0.3, s.dur * 0.4));

  o1.connect(lp);
  o2.connect(mix2).connect(lp);
  lp.connect(f1).connect(f2).connect(hp).connect(amp).connect(out);

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx);
  noise.loop = true;
  const nb = ctx.createBiquadFilter();
  nb.type = 'bandpass';
  nb.frequency.value = 3200;
  nb.Q.value = 0.8;
  const ng = ctx.createGain();
  ng.gain.value = num(p, 'bowNoise', 0.04);
  noise.connect(nb).connect(ng).connect(amp);

  const rate = num(p, 'vibratoRate', 5.6);
  const depth = num(p, 'vibratoDepth', 20);
  const delay = num(p, 'vibratoDelay', 0.2);
  const l1 = vibrato(ctx, o1.detune, s.when, rate, depth, delay);
  const l2 = vibrato(ctx, o2.detune, s.when, rate, depth, delay);

  let end = s.when + s.dur;
  let freq = s.freq;
  amp.gain.setTargetAtTime(0, end, release);
  const nodes: AudioScheduledSourceNode[] = [o1, o2, noise, ...(l1 ? [l1] : []), ...(l2 ? [l2] : [])];
  const stopAll = (t: number) => nodes.forEach((n) => safeStop(n, t));
  o1.start(s.when);
  o2.start(s.when);
  noise.start(s.when, Math.random());
  stopAll(end + release * 6);

  const voice: Voice = {
    freq: s.freq,
    get end() {
      return end;
    },
    glideTo(f, at, time) {
      for (const o of [o1, o2]) {
        o.frequency.setValueAtTime(freq, at);
        o.frequency.exponentialRampToValueAtTime(f, at + time);
      }
      freq = f;
      voice.freq = f;
    },
    extend(newEnd) {
      amp.gain.cancelScheduledValues(end);
      amp.gain.setTargetAtTime(0, newEnd, release);
      end = newEnd;
      stopAll(end + release * 6);
    },
    stop(at) {
      fadeOut(amp.gain, at);
      stopAll(at + 0.15);
    },
  };
  return voice;
}

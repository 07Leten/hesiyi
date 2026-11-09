import { arr, fadeOut, harmonicWave, noiseBuffer, num, safeStop, vibrato, type NoteSpec, type SynthParams, type Voice } from './common';

/** 吹管音色：谐波振荡器 + 带通气声 + 笛膜（软削波后高通）+ 气颤 */

let shaperCurve: Float32Array<ArrayBuffer> | null = null;
function buzzCurve() {
  if (!shaperCurve) {
    shaperCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      shaperCurve[i] = Math.tanh(6 * x);
    }
  }
  return shaperCurve;
}

export function windVoice(ctx: BaseAudioContext, out: AudioNode, p: SynthParams, s: NoteSpec): Voice {
  const level = num(p, 'level', 0.6) * s.velocity;
  const attack = num(p, 'attack', 0.06);
  const release = num(p, 'release', 0.15);
  const bright = num(p, 'brightness', 6);

  const osc = ctx.createOscillator();
  osc.setPeriodicWave(harmonicWave(ctx, arr(p, 'harmonics', [1, 0.4, 0.2])));
  osc.frequency.setValueAtTime(s.freq, s.when);

  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.setValueAtTime(Math.min(s.freq * bright, 12000), s.when);
  tone.Q.value = 0.5;

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, s.when);
  amp.gain.linearRampToValueAtTime(level, s.when + attack);
  amp.gain.setTargetAtTime(level * 0.82, s.when + attack, 0.35);

  osc.connect(tone).connect(amp).connect(out);

  const buzz = num(p, 'buzz', 0);
  if (buzz > 0) {
    const ws = ctx.createWaveShaper();
    ws.curve = buzzCurve();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const bg = ctx.createGain();
    bg.gain.value = buzz * 0.12;
    osc.connect(ws).connect(hp).connect(bg).connect(amp);
  }

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx);
  noise.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = num(p, 'breathFreq', 2000);
  bp.Q.value = num(p, 'breathQ', 1);
  const breath = num(p, 'breath', 0.1);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(breath * 2.2, s.when);
  bg.gain.setTargetAtTime(breath, s.when + attack, 0.08);
  noise.connect(bp).connect(bg).connect(amp);

  const lfo = vibrato(ctx, osc.detune, s.when, num(p, 'vibratoRate', 5), num(p, 'vibratoDepth', 10), num(p, 'vibratoDelay', 0.3));

  let end = s.when + s.dur;
  let freq = s.freq;
  amp.gain.setTargetAtTime(0, end, release);
  const stopAll = (t: number) => {
    safeStop(osc, t);
    safeStop(noise, t);
    if (lfo) safeStop(lfo, t);
  };
  osc.start(s.when);
  noise.start(s.when, Math.random() * 1.5);
  stopAll(end + release * 6);

  const voice: Voice = {
    freq: s.freq,
    get end() {
      return end;
    },
    glideTo(f, at, time) {
      osc.frequency.setValueAtTime(freq, at);
      osc.frequency.exponentialRampToValueAtTime(f, at + time);
      tone.frequency.setValueAtTime(Math.min(f * bright, 12000), at + time);
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

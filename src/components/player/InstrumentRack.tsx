import { engine } from '../../audio/engine';
import type { LayerConfig } from '../../audio/sequence';
import type { Instrument, Performance } from '../../data/types';
import { IconSound } from '../common/Icons';

interface Props {
  instruments: Instrument[];
  layers: LayerConfig[];
  onChange: (layers: LayerConfig[]) => void;
  performances?: Performance[];
  activePerformanceId?: string | null;
  onPerformance?: (p: Performance) => void;
  /** 试音的参考音高（曲谱主音） */
  tonicMidi?: number;
}

const OCTAVES = [
  { v: -12, label: '低八度' },
  { v: 0, label: '原位' },
  { v: 12, label: '高八度' },
];

export function InstrumentRack({ instruments, layers, onChange, performances, activePerformanceId, onPerformance, tonicMidi = 62 }: Props) {
  const enabledCount = layers.filter((l) => l.enabled).length;
  const update = (id: string, patch: Partial<LayerConfig>) =>
    onChange(layers.map((l) => (l.instrumentId === id ? { ...l, ...patch } : l)));

  return (
    <div className="rack">
      {performances && performances.length > 0 && (
        <div className="rack-perfs">
          <span className="rack-label">演奏版本</span>
          {performances.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`chip${activePerformanceId === p.id ? ' is-on' : ''}`}
              onClick={() => onPerformance?.(p)}
              title={p.source.note}
            >
              {p.title}
            </button>
          ))}
          <span className={`chip chip-static${activePerformanceId ? '' : ' is-on'}`}>自定义组合</span>
        </div>
      )}
      <div className="rack-grid">
        {instruments.map((inst) => {
          const layer = layers.find((l) => l.instrumentId === inst.id);
          if (!layer) return null;
          const preset = inst.presets.find((p) => p.id === layer.presetId) ?? inst.presets[0];
          const lastOne = layer.enabled && enabledCount === 1;
          return (
            <section key={inst.id} className={`rack-card${layer.enabled ? ' is-on' : ''}`}>
              <header>
                <label className="rack-toggle" title={lastOne ? '至少保留一件乐器' : undefined}>
                  <input
                    type="checkbox"
                    checked={layer.enabled}
                    disabled={lastOne}
                    onChange={(e) => update(inst.id, { enabled: e.target.checked })}
                  />
                  <span className="rack-name">{inst.name}</span>
                  <small>{inst.family}</small>
                </label>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => void engine.previewNote(preset, inst.id, tonicMidi + layer.octaveShift + 7)}
                  aria-label={`试听${inst.name}·${preset.name}`}
                  title="试音"
                >
                  <IconSound />
                </button>
              </header>
              <div className="rack-presets" role="radiogroup" aria-label={`${inst.name}音色`}>
                {inst.presets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={p.id === preset.id}
                    className={p.id === preset.id ? 'is-on' : ''}
                    onClick={() => {
                      update(inst.id, { presetId: p.id });
                      void engine.previewNote(p, inst.id, tonicMidi + layer.octaveShift + 7);
                    }}
                    title={p.description}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              <p className="rack-desc">{preset.description}</p>
              <div className="rack-controls">
                <label>
                  <span>音量</span>
                  <input
                    type="range"
                    min={0}
                    max={1.2}
                    step={0.05}
                    value={layer.gain}
                    onChange={(e) => update(inst.id, { gain: Number(e.target.value) })}
                  />
                </label>
                <label>
                  <span>音区</span>
                  <select value={layer.octaveShift} onChange={(e) => update(inst.id, { octaveShift: Number(e.target.value) })}>
                    {OCTAVES.map((o) => (
                      <option key={o.v} value={o.v}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
          );
        })}
      </div>
      <p className="rack-foot">音色来自开源录音，不是这首曲子的真人演奏。洞箫用的是尺八采样。出处见「关于」。</p>
    </div>
  );
}

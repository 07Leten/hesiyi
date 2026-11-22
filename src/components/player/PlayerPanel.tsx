import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRepo } from '../../data/DataContext';
import type { Score } from '../../data/types';
import { usePlayer } from '../../player/PlayerContext';
import { IconClose, IconInstruments, IconLoop, IconMute, IconNext, IconPause, IconPlay, IconPrev, IconVolume } from '../common/Icons';
import { InstrumentRack } from './InstrumentRack';
import { ProgressBar } from './ProgressBar';

const RATES = [0.5, 0.75, 1, 1.25, 1.5];

interface Props {
  score: Score;
  /** 上一曲 / 下一曲：默认在可播放曲谱之间切换并跳转页面 */
  navigateOnStep?: boolean;
  label?: string;
}

/** 完整播放器：书衣色的条带，乐器架向上展开 */
export function PlayerPanel({ score, navigateOnStep = true, label }: Props) {
  const player = usePlayer();
  const repo = useRepo();
  const navigate = useNavigate();
  const [rackOpen, setRackOpen] = useState(false);
  const [lastVolume, setLastVolume] = useState(0.8);

  const isCurrent = player.score?.id === score.id;
  const playing = isCurrent && player.state.playing;
  const perfs = repo.performancesByScore(score.id);
  const activePerf = perfs.find((p) => p.id === player.performanceId);
  const ensemble = player.layers
    .filter((l) => l.enabled)
    .map((l) => repo.instrument(l.instrumentId)?.name)
    .filter(Boolean)
    .join(' · ');

  const ensureLoaded = () => {
    if (!isCurrent) player.loadScore(score);
  };

  const onPlay = () => {
    if (!isCurrent) player.loadScore(score, { autoplay: true });
    else player.toggle();
  };

  const step = (dir: 1 | -1) => {
    const list = repo.playableScores();
    if (list.length < 2) return;
    const i = list.findIndex((s) => s.id === score.id);
    const next = list[(i + dir + list.length) % list.length];
    player.loadScore(next, { autoplay: playing });
    if (navigateOnStep) navigate(`/poem/${next.poemId}?score=${next.id}`);
  };

  const canStep = navigateOnStep && repo.playableScores().length > 1;
  const muted = player.state.volume === 0;

  return (
    <section className={`player${rackOpen ? ' rack-open' : ''}`} aria-label="播放器">
      {rackOpen && (
        <div className="player-rack" id="player-rack">
          <div className="player-rack-head">
            <h3>乐器与音色</h3>
            <button type="button" className="icon-btn" onClick={() => setRackOpen(false)} aria-label="收起乐器面板">
              <IconClose />
            </button>
          </div>
          <InstrumentRack
            instruments={repo.data.instruments}
            layers={player.layers}
            tonicMidi={score.key.tonicMidi}
            performances={perfs}
            activePerformanceId={isCurrent ? player.performanceId : null}
            onPerformance={(p) => {
              ensureLoaded();
              player.applyPerformance(p);
            }}
            onChange={(l) => {
              ensureLoaded();
              player.setLayers(l);
            }}
          />
        </div>
      )}

      <div className="player-bar">
        <div className="player-info">
          <span className="player-kicker">{label ?? (isCurrent ? (playing ? '正在演奏' : '已就绪') : '未载入')}</span>
          <span className="player-ensemble">
            {isCurrent ? (activePerf ? activePerf.title : '自定义组合') : perfs[0]?.title ?? '钢琴'}
            <small>{isCurrent ? ensemble : ''}</small>
          </span>
        </div>

        <div className="player-transport">
          <div className="player-buttons">
            {canStep && (
              <button type="button" className="icon-btn" onClick={() => step(-1)} aria-label="上一曲" title="上一曲">
                <IconPrev />
              </button>
            )}
            <button type="button" className="play-btn" onClick={onPlay} aria-label={playing ? '暂停' : '播放'}>
              {playing ? <IconPause width={22} height={22} /> : <IconPlay width={22} height={22} />}
            </button>
            {canStep && (
              <button type="button" className="icon-btn" onClick={() => step(1)} aria-label="下一曲" title="下一曲">
                <IconNext />
              </button>
            )}
          </div>
          <ProgressBar
            score={score}
            isCurrent={isCurrent}
            onSeek={(b) => {
              ensureLoaded();
              player.seekBeat(b);
            }}
          />
        </div>

        <div className="player-opts">
          <label className="player-rate" title="播放速度">
            <span className="sr-only">播放速度</span>
            <select value={player.state.rate} onChange={(e) => player.setRate(Number(e.target.value))}>
              {RATES.map((r) => (
                <option key={r} value={r}>
                  {r === 1 ? '原速' : `${r}×`}
                </option>
              ))}
            </select>
          </label>
          <div className="player-volume">
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                if (muted) player.setVolume(lastVolume || 0.8);
                else {
                  setLastVolume(player.state.volume);
                  player.setVolume(0);
                }
              }}
              aria-label={muted ? '取消静音' : '静音'}
            >
              {muted ? <IconMute /> : <IconVolume />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={player.state.volume}
              onChange={(e) => player.setVolume(Number(e.target.value))}
              aria-label="音量"
            />
          </div>
          <button
            type="button"
            className={`icon-btn${player.state.loop ? ' is-on' : ''}`}
            onClick={() => player.setLoop(!player.state.loop)}
            aria-pressed={player.state.loop}
            aria-label="循环播放"
            title={player.state.loop ? '循环：开' : '循环：关'}
          >
            <IconLoop />
          </button>
          <button
            type="button"
            className={`rack-btn${rackOpen ? ' is-on' : ''}`}
            onClick={() => {
              ensureLoaded();
              setRackOpen((v) => !v);
            }}
            aria-expanded={rackOpen}
            aria-controls="player-rack"
          >
            <IconInstruments />
            <span>乐器</span>
          </button>
        </div>
      </div>
    </section>
  );
}

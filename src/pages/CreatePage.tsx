import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { audioBufferToWav, downloadBlob, renderOffline } from '../audio/render';
import { resolveLayers, scoreToEvents, type LayerConfig } from '../audio/sequence';
import { OriginBadge } from '../components/common/Badges';
import { IconDownload, IconPause, IconPlay } from '../components/common/Icons';
import { ScoreView } from '../components/score/ScoreView';
import { useRepo } from '../data/DataContext';
import { hanChars } from '../data/notation/lyrics';
import type { Instrument, Poem, Score } from '../data/types';
import { baseLayers, usePlayer } from '../player/PlayerContext';
import { useActiveNote } from '../player/usePlayback';
import { providers, type GenerationJob, type GenerationRequest } from '../services/generation';
import { useUser, userStore } from '../services/user/useUser';
import type { Creation } from '../services/user/UserStore';

const STYLES = [
  { id: '琴歌', desc: '文人琴歌的气质，舒缓含蓄' },
  { id: '昆曲韵味', desc: '一字多腔，婉转细腻' },
  { id: '江南丝竹', desc: '轻快流畅，加花较少' },
  { id: '现代国风', desc: '节奏明快，便于现代编配' },
];
const MOODS = ['清丽', '婉约', '沉郁', '旷达', '激越'];

type Notice = { kind: 'unconfigured'; hint: string; payload: GenerationRequest } | { kind: 'error'; message: string };

export function CreatePage() {
  const repo = useRepo();
  const user = useUser();
  const [sp] = useSearchParams();
  const instruments = repo.data.instruments;

  const initial = useMemo(() => {
    const poemId = sp.get('poem');
    const tuneId = sp.get('tune');
    if (poemId && repo.poem(poemId)) return { mode: 'library' as const, poemId, tuneId: repo.poem(poemId)!.tunePatternId };
    if (tuneId && repo.tune(tuneId)) {
      const first = repo.poemsByTune(tuneId)[0];
      return first ? { mode: 'library' as const, poemId: first.id, tuneId } : { mode: 'custom' as const, poemId: '', tuneId };
    }
    return { mode: sp.get('title') ? ('custom' as const) : ('library' as const), poemId: repo.data.poems[0]?.id ?? '', tuneId: '' };
  }, [repo, sp]);

  const [mode, setMode] = useState<'library' | 'custom'>(initial.mode);
  const [poemId, setPoemId] = useState(initial.poemId);
  const [customTitle, setCustomTitle] = useState(sp.get('title') ?? '');
  const [customTune, setCustomTune] = useState(initial.tuneId);
  const [customText, setCustomText] = useState('');
  const [style, setStyle] = useState('琴歌');
  const [mood, setMood] = useState('清丽');
  const [inst, setInst] = useState<string[]>(['piano', 'xiao']);
  const [followMeter, setFollowMeter] = useState(true);
  const [vocal, setVocal] = useState(false);
  const modelConfigured = providers[0].isConfigured();
  const [providerId, setProviderId] = useState(modelConfigured ? providers[0].id : 'local-rule');
  const [tones, setTones] = useState('');
  const [toneSource, setToneSource] = useState('');
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  const poem: Poem | undefined = mode === 'library' ? repo.poem(poemId) : undefined;
  const tuneId = mode === 'library' ? poem?.tunePatternId : customTune || undefined;
  const tune = tuneId ? repo.tune(tuneId) : undefined;
  const text = mode === 'library' ? poem?.text ?? '' : customText;
  const title = mode === 'library' ? `${tune?.name ?? ''}·${poem?.title ?? ''}` : customTitle || (tune ? `${tune.name}·自填` : '自填词');
  const provider = providers.find((p) => p.id === providerId)!;

  useEffect(() => {
    const chars = hanChars(text);
    const scored = poem ? repo.scoresByPoem(poem.id).find((s) => s.toneSystem) : undefined;
    if (scored && scored.syllables.length === chars.length) {
      setTones(scored.syllables.map((s) => s.tone?.category ?? '?').join(''));
      setToneSource('取自演示曲谱的字声标注（依《广韵》推定）');
      return;
    }
    if (followMeter && tune?.meter) {
      const pattern = tune.meter.stanzas.flat().map((l) => l.pattern).join('');
      if (pattern.length === chars.length) {
        setTones(pattern);
        setToneSource('取自词牌格律（平 / 仄 / 中），中为可平可仄');
        return;
      }
    }
    setTones('');
    setToneSource('暂无可靠字声资料；可手动填写，否则旋律只依句读起伏');
  }, [text, poem, tune, followMeter, repo]);

  const layersFor = (ids: string[]): LayerConfig[] => baseLayers(instruments).map((l) => ({ ...l, enabled: ids.includes(l.instrumentId) }));

  const buildRequest = (seed: number): GenerationRequest => ({
    poemId: poem?.id,
    tunePatternId: tuneId,
    title,
    text,
    tones: tones || undefined,
    style,
    mood,
    instruments: inst,
    followMeter,
    vocal,
    seed,
  });

  const run = async (req: GenerationRequest, replaceId?: string) => {
    setNotice(null);
    if (!provider.isConfigured()) {
      setNotice({ kind: 'unconfigured', hint: provider.configHint ?? '该服务尚未配置。', payload: req });
      return;
    }
    setBusy(true);
    try {
      let job = await provider.submit(req);
      setJobs((js) => (replaceId ? js.map((j) => (j.id === replaceId ? job : j)) : [job, ...js]));
      while (provider.poll && (job.status === 'queued' || job.status === 'running')) {
        await new Promise((r) => setTimeout(r, 3000));
        const prevId = job.id;
        job = await provider.poll(job);
        setJobs((js) => js.map((j) => (j.id === prevId ? job : j)));
      }
    } catch (e) {
      setNotice({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = hanChars(text).length >= 2 && inst.length > 0 && !busy;

  return (
    <div className="page create">
      <header className="page-head">
        <h1>音乐创作</h1>
        <p>当曲库中没有某个词牌的历史曲谱时，可以在这里为一首词创作新的旋律。所有结果都会标明是现代作品，不与文献曲谱混同。</p>
      </header>

      <div className="create-grid">
        <form
          className="create-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) void run(buildRequest(Date.now() % 1_000_000));
          }}
        >
          <fieldset>
            <legend>词作</legend>
            <div className="seg">
              <button type="button" className={mode === 'library' ? 'is-on' : ''} onClick={() => setMode('library')}>
                从曲库选择
              </button>
              <button type="button" className={mode === 'custom' ? 'is-on' : ''} onClick={() => setMode('custom')}>
                自己填写
              </button>
            </div>
            {mode === 'library' ? (
              <label className="field">
                <span>选择词作</span>
                <select value={poemId} onChange={(e) => setPoemId(e.target.value)}>
                  {repo.data.tunePatterns.map((t) => {
                    const ps = repo.poemsByTune(t.id);
                    return ps.length ? (
                      <optgroup key={t.id} label={t.name}>
                        {ps.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title} · {repo.author(p.authorId)?.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null;
                  })}
                </select>
              </label>
            ) : (
              <>
                <div className="field-row">
                  <label className="field">
                    <span>题目</span>
                    <input value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder="如：秋夜" />
                  </label>
                  <label className="field">
                    <span>词牌（可选）</span>
                    <select value={customTune} onChange={(e) => setCustomTune(e.target.value)}>
                      <option value="">不指定</option>
                      {repo.data.tunePatterns.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span>正文（用标点断句，「／」或换行分段）</span>
                  <textarea rows={5} value={customText} onChange={(e) => setCustomText(e.target.value)} placeholder="例：江南好，风景旧曾谙。" />
                </label>
              </>
            )}
            {text && (
              <p className="create-preview">
                {text.replace(/\n/g, ' ／ ')}
                <small>{hanChars(text).length} 字</small>
              </p>
            )}
            <label className="field">
              <span>逐字字声（可编辑：平、上、去、入；或平、仄、中）</span>
              <input value={tones} onChange={(e) => setTones(e.target.value.replace(/[^平上去入仄中?？]/g, ''))} placeholder="留空则只依句读" />
              <small className="field-hint">{toneSource}</small>
            </label>
          </fieldset>

          <fieldset>
            <legend>风格</legend>
            <div className="option-grid">
              {STYLES.map((s) => (
                <button key={s.id} type="button" className={`option${style === s.id ? ' is-on' : ''}`} onClick={() => setStyle(s.id)} aria-pressed={style === s.id}>
                  <b>{s.id}</b>
                  <small>{s.desc}</small>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>情绪</legend>
            <div className="chips">
              {MOODS.map((m) => (
                <button key={m} type="button" className={`chip${mood === m ? ' is-on' : ''}`} aria-pressed={mood === m} onClick={() => setMood(m)}>
                  {m}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>演奏乐器</legend>
            <div className="chips">
              {instruments.map((i) => {
                const on = inst.includes(i.id);
                return (
                  <button
                    key={i.id}
                    type="button"
                    className={`chip${on ? ' is-on' : ''}`}
                    aria-pressed={on}
                    onClick={() => setInst((v) => (on ? (v.length > 1 ? v.filter((x) => x !== i.id) : v) : [...v, i.id]))}
                  >
                    {i.name}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend>要求</legend>
            <label className="switch">
              <input type="checkbox" checked={followMeter} onChange={(e) => setFollowMeter(e.target.checked)} />
              <span>尽量遵循词牌句式与平仄</span>
            </label>
            <div className="seg seg-sm">
              <button type="button" className={!vocal ? 'is-on' : ''} onClick={() => setVocal(false)}>
                纯音乐
              </button>
              <button type="button" className={vocal ? 'is-on' : ''} onClick={() => setVocal(true)} disabled={!provider.capabilities.vocal}>
                含演唱
              </button>
            </div>
            {!provider.capabilities.vocal && <small className="field-hint">当前服务只能生成纯音乐；含演唱需要接入支持人声的音乐生成模型。</small>}
          </fieldset>

          <fieldset>
            <legend>生成服务</legend>
            <div className="provider-list">
              {providers.map((p) => (
                <label key={p.id} className={`provider${providerId === p.id ? ' is-on' : ''}`}>
                  <input
                    type="radio"
                    name="provider"
                    checked={providerId === p.id}
                    onChange={() => {
                      setProviderId(p.id);
                      if (!p.capabilities.vocal) setVocal(false);
                    }}
                  />
                  <span className="provider-name">
                    {p.label}
                    {p.isAI ? <OriginBadge origin="ai" /> : <OriginBadge origin="rule" />}
                    {!p.isConfigured() && <span className="badge badge-off">未接入</span>}
                  </span>
                  <small>{p.description}</small>
                </label>
              ))}
            </div>
          </fieldset>

          <button type="submit" className="btn btn-primary btn-lg" disabled={!canSubmit}>
            {busy ? '生成中…' : provider.isAI ? '提交给模型生成' : '按规则生成旋律'}
          </button>
          {hanChars(text).length < 2 && <small className="field-hint">请先选择或填写一首词。</small>}
        </form>

        <section className="create-results" aria-live="polite">
          <h2>结果</h2>
          {notice?.kind === 'unconfigured' && (
            <div className="notice">
              <p>
                <b>{notice.hint}</b>
              </p>
              <p>本页已经完成交互流程和接口占位，但不会伪造模型输出。接入后，下列参数会原样发送给模型：</p>
              <pre className="payload">{JSON.stringify(notice.payload, null, 2)}</pre>
              <p className="small muted">也可以先改用「本地规则旋律（非 AI）」体验试听、保存与下载。</p>
            </div>
          )}
          {notice?.kind === 'error' && <div className="notice notice-error">{notice.message}</div>}
          {jobs.length === 0 && !notice && <p className="empty-line">填好左侧选项后生成。结果可以试听、重新生成、保存和下载。</p>}
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} layers={layersFor(job.request.instruments)} onRegenerate={() => void run({ ...job.request, seed: job.request.seed + 7919 }, job.id)} busy={busy} />
          ))}

          <h2 className="mt">我的创作</h2>
          {user.creations.length === 0 ? (
            <p className="empty-line">保存的作品会出现在这里（保存在本浏览器中）。</p>
          ) : (
            <ul className="creation-list">
              {user.creations.map((c) => (
                <CreationRow key={c.id} c={c} />
              ))}
            </ul>
          )}
          <p className="small muted">
            还没有历史曲谱的词牌，可以到 <Link to="/library?score=none">曲库</Link> 查看。
          </p>
        </section>
      </div>
    </div>
  );

}

function JobCard({ job, layers, onRegenerate, busy }: { job: GenerationJob; layers: LayerConfig[]; onRegenerate: () => void; busy: boolean }) {
  const repo = useRepo();
  const player = usePlayer();
  const user = useUser();
  const score = job.result?.score ?? null;
  const isCurrent = Boolean(score && player.score?.id === score.id);
  const active = useActiveNote(score, isCurrent);
  const playing = isCurrent && player.state.playing;
  const saved = user.creations.some((c) => c.id === job.id);
  const isAI = providers.find((p) => p.id === job.providerId)?.isAI ?? false;
  const [exporting, setExporting] = useState(false);

  return (
    <article className="job-card">
      <header>
        <h3>{job.request.title}</h3>
        <OriginBadge origin={isAI ? 'ai' : 'rule'} />
        <span className={`job-status st-${job.status}`}>
          {{ queued: '排队中', running: `生成中${job.progress ? ` ${Math.round(job.progress * 100)}%` : ''}`, succeeded: '已完成', failed: '失败' }[job.status]}
        </span>
      </header>
      <p className="small muted">
        {job.request.style} · {job.request.mood} · {job.request.instruments.map((id) => repo.instrument(id)?.name).join('、')} · {job.request.vocal ? '含演唱' : '纯音乐'}
      </p>
      {job.error && <p className="notice notice-error">{job.error}</p>}
      {job.result && <p className="job-note">{score?.provenance.note ?? job.result.note}</p>}
      {score && (
        <div className="score-paper is-small">
          <ScoreView score={score} mode="jianpu" showLyrics showTones={false} showNotes={false} activeNote={active} following={false} onSeekNote={(i) => {
            const beat = score.notes[i].startBeat;
            if (!isCurrent) return player.loadScore(score, { layers, transient: true, autoplay: true, startBeat: beat });
            player.seekBeat(beat);
            if (!player.state.playing) player.play();
          }} compact />
        </div>
      )}
      {job.result?.audioUrl && <audio controls src={job.result.audioUrl} className="job-audio" />}
      {job.status === 'succeeded' && (
        <div className="job-actions">
          {score && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => (isCurrent ? player.toggle() : player.loadScore(score, { layers, transient: true, autoplay: true }))}>
              {playing ? <IconPause /> : <IconPlay />}
              {playing ? '暂停' : '试听'}
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onRegenerate} disabled={busy}>
            重新生成
          </button>
          {score && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={saved}
              onClick={() => {
                const c: Creation = {
                  id: job.id,
                  createdAt: Date.now(),
                  title: job.request.title,
                  providerId: job.providerId,
                  providerLabel: providers.find((p) => p.id === job.providerId)?.label ?? job.providerId,
                  isAI,
                  request: { ...job.request },
                  score,
                  layers,
                };
                userStore.saveCreation(c);
              }}
            >
              {saved ? '已保存' : '保存'}
            </button>
          )}
          {score && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={exporting}
              onClick={async () => {
                setExporting(true);
                try {
                  await exportWav(score, layers, repo.data.instruments);
                } finally {
                  setExporting(false);
                }
              }}
            >
              <IconDownload />
              {exporting ? '渲染中…' : '下载 WAV'}
            </button>
          )}
          {score && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => exportJson(score, job.request)}>
              <IconDownload />
              曲谱 JSON
            </button>
          )}
          {job.result?.audioUrl && (
            <a className="btn btn-ghost btn-sm" href={job.result.audioUrl} download>
              <IconDownload />
              下载音频
            </a>
          )}
        </div>
      )}
    </article>
  );
}

function CreationRow({ c }: { c: Creation }) {
  const repo = useRepo();
  const player = usePlayer();
  const isCurrent = player.score?.id === c.score.id;
  const playing = isCurrent && player.state.playing;
  return (
    <li>
      <button type="button" className="icon-btn" onClick={() => (isCurrent ? player.toggle() : player.loadScore(c.score, { layers: c.layers, transient: true, autoplay: true }))} aria-label={playing ? '暂停' : '播放'}>
        {playing ? <IconPause /> : <IconPlay />}
      </button>
      <span className="creation-title">{c.title}</span>
      <OriginBadge origin={c.isAI ? 'ai' : 'rule'} short />
      <time className="muted small">{new Date(c.createdAt).toLocaleDateString('zh-CN')}</time>
      <button type="button" className="linklike small" onClick={() => void exportWav(c.score, c.layers, repo.data.instruments)}>
        下载
      </button>
      <button type="button" className="linklike small" onClick={() => userStore.removeCreation(c.id)}>
        删除
      </button>
    </li>
  );
}

async function exportWav(score: Score, layers: LayerConfig[], instruments: Instrument[]) {
  const buf = await renderOffline(scoreToEvents(score), score.totalBeats, score.tempo, resolveLayers(layers, instruments).filter((l) => l.enabled));
  downloadBlob(audioBufferToWav(buf), `${score.title}.wav`);
}


function exportJson(score: Score, request: GenerationRequest) {
  const blob = new Blob([JSON.stringify({ request, score }, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `${score.title}.json`);
}

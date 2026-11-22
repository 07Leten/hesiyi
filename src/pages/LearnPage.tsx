import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { engine } from '../audio/engine';
import { IconPlay } from '../components/common/Icons';
import { ToneMark } from '../components/common/ToneMark';
import { ScoreView } from '../components/score/ScoreView';
import { useRepo } from '../data/DataContext';
import { gongcheTable } from '../data/notation/gongche';
import { pitchToMidi } from '../data/notation/pitch';
import type { ToneCategory } from '../data/types';
import { usePlayer } from '../player/PlayerContext';
import { useActiveNote } from '../player/usePlayback';

const SECTIONS = [
  { id: 'symbols', label: '工尺字与简谱' },
  { id: 'banyan', label: '板眼与节奏' },
  { id: 'reading', label: '识读示例' },
  { id: 'meter', label: '词牌与声律' },
  { id: 'tones', label: '平上去入' },
];

const BANYAN = [
  { name: '一板一眼', sig: '2/4', pattern: [true, false, true, false, true, false, true, false], desc: '每小节两拍：板落在第一拍，眼落在第二拍。节奏较为紧凑。' },
  { name: '一板三眼', sig: '4/4', pattern: [true, false, false, false, true, false, false, false], desc: '每小节四拍：板之后依次为头眼、中眼、末眼，宜于舒缓的曲调。' },
  { name: '散板', sig: '自由', pattern: [true, false, false, true, false, true, false, false], desc: '不受板眼约束，节奏自由伸缩，常用于引子或尾声。此处示范只是一种可能的处理。' },
];

const TONE_NAMES: ToneCategory[] = ['平', '上', '去', '入'];

export function LearnPage() {
  const repo = useRepo();
  const player = usePlayer();
  const piano = repo.instrument('piano');
  const xiao = repo.instrument('xiao');
  const [voice, setVoice] = useState<'piano' | 'xiao'>('piano');
  const table = gongcheTable(1);
  const example = repo.score('demo-rumengling-changji') ?? repo.playableScores()[0];
  const isCurrent = Boolean(example && player.score?.id === example.id);
  const active = useActiveNote(example ?? null, isCurrent);

  const exampleEnd = useMemo(() => {
    if (!example) return 0;
    const i = example.syllables.findIndex((s) => s.lineEnd);
    const next = example.syllables[i + 1];
    return next ? example.notes.findIndex((n) => n.id === next.noteIds[0]) : example.notes.length;
  }, [example]);

  const playPitch = (degree: number, octave: number) => {
    const inst = voice === 'piano' ? piano : xiao;
    if (!inst) return;
    const midi = pitchToMidi({ degree, octave, accidental: 0 }, 62)!;
    void engine.previewNote(inst.presets[0], inst.id, midi, 1.4);
  };

  return (
    <div className="page learn">
      <header className="page-head">
        <h1>曲谱学习</h1>
        <p>为初学者准备的工尺谱入门。先认字、再识板眼，最后对照一句曲谱读一遍。</p>
      </header>

      <div className="learn-grid">
        <nav className="learn-nav" aria-label="本页目录">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} onClick={(e) => {
              e.preventDefault();
              document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}>
              {s.label}
            </a>
          ))}
        </nav>

        <div className="learn-body">
          <section id="symbols" className="block">
            <h2>工尺字与简谱</h2>
            <p>
              工尺谱用汉字记写音高。最常用的十个字是「合、四、一、上、尺、工、凡、六、五、乙」，本平台即以开头三字为名。
              同一个工尺字在不同调门下对应的简谱音级不同；下表以昆曲、笛色中最常用的<b>小工调</b>为例（上 = 1）。
            </p>
            <div className="voice-pick">
              <span>试听音色</span>
              <button type="button" className={`chip${voice === 'piano' ? ' is-on' : ''}`} onClick={() => setVoice('piano')}>
                钢琴
              </button>
              <button type="button" className={`chip${voice === 'xiao' ? ' is-on' : ''}`} onClick={() => setVoice('xiao')}>
                洞箫
              </button>
            </div>
            <div className="gc-table" role="list">
              {table.map((r, i) => (
                <button key={i} type="button" role="listitem" className="gc-cell" onClick={() => playPitch(r.degree, r.octave)} aria-label={`工尺字${r.char}，简谱${r.degree}`}>
                  <span className="gc-cell-char">
                    {r.char}
                    {r.octaveMark && <sup>{r.octaveMark === 'high' ? '高' : '低'}</sup>}
                  </span>
                  <span className="gc-cell-jp">
                    <i className="dots-hi">{r.octave > 0 ? '•' : ''}</i>
                    {r.degree}
                    <i className="dots-lo">{r.octave < 0 ? '•' : ''}</i>
                  </span>
                </button>
              ))}
            </div>
            <ul className="plain-list">
              <li>「合、四、一」比「六、五、乙」低一个八度；「仩、伬、仜」是「上、尺、工」的高八度，加「亻」旁表示。</li>
              <li>更高或更低的音，各家谱本写法不一（加偏旁、加撇、加点等）。本平台遇到这类音时以「高 / 低」小字标注，不自造字形。</li>
              <li>「凡」「乙」在不同乐种中音高略有游移，翻译为简谱时常需结合曲调判断——这正是工尺谱与简谱不能机械互转的原因之一。</li>
            </ul>
          </section>

          <section id="banyan" className="block">
            <h2>板眼与节奏</h2>
            <p>工尺谱以「板眼」记节拍：板是强拍，眼是弱拍。谱上的板常写作「、」或「×」，眼常写作「。」或「○」，各家写法不同。本平台以朱色「、」表示板，「。」表示眼。</p>
            <div className="banyan-grid">
              {BANYAN.map((b) => (
                <div key={b.name} className="banyan-card">
                  <h3>
                    {b.name}
                    <small>{b.sig}</small>
                  </h3>
                  <p className="banyan-marks" aria-hidden="true">
                    {b.pattern.map((p, i) => (
                      <span key={i} className={p ? 'is-ban' : ''}>
                        {b.name === '散板' ? '·' : p ? '、' : '。'}
                      </span>
                    ))}
                  </p>
                  <p>{b.desc}</p>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void engine.playClapper(b.pattern, b.name === '散板' ? 66 : 92)}>
                    <IconPlay /> 听击节
                  </button>
                </div>
              ))}
            </div>
            <h3 className="sub">简谱的时值写法</h3>
            <dl className="glossary">
              <div>
                <dt>5</dt>
                <dd>四分音符，一拍</dd>
              </div>
              <div>
                <dt className="ul1">5</dt>
                <dd>下加一线，八分音符，半拍；两线为十六分音符</dd>
              </div>
              <div>
                <dt>5 –</dt>
                <dd>延长线，每条加一拍</dd>
              </div>
              <div>
                <dt>5·</dt>
                <dd>附点，增加本音一半的时值</dd>
              </div>
              <div>
                <dt>0</dt>
                <dd>休止</dd>
              </div>
              <div>
                <dt className="slur-demo">5 6</dt>
                <dd>上方弧线：一个字唱多个音（拖腔）</dd>
              </div>
            </dl>
          </section>

          {example && (
            <section id="reading" className="block">
              <h2>识读示例</h2>
              <p>
                下面是《如梦令》演示曲谱的第一句，上排为工尺字（朱色为板眼），中排为简谱，下排为歌词。
                <span className="muted">（演示旋律，非文献曲谱）</span>
              </p>
              <div className="score-paper">
                <ScoreView
                  score={example}
                  mode="dual"
                  showLyrics
                  showTones={false}
                  showNotes={false}
                  activeNote={active}
                  range={[0, exampleEnd]}
                  onSeekNote={(i) => {
                    const beat = example.notes[i].startBeat;
                    if (!isCurrent) return player.loadScore(example, { autoplay: true, startBeat: beat });
                    player.seekBeat(beat);
                    if (!player.state.playing) player.play();
                  }}
                />
              </div>
              <ol className="steps">
                <li>先找板：小节第一拍上的朱色「、」就是板，四拍一板为「一板三眼」。</li>
                <li>再读字：「常」唱「工」（3），「记」唱「六、五」（5、6）两个音，上方的弧线说明它们同属一字。</li>
                <li>最后看时值：数字下的短横表示半拍，「暮」字的「六」后面有延长线，要多唱一拍。</li>
              </ol>
              <p>
                <Link to={`/poem/${example.poemId}?score=${example.id}`} className="btn btn-ghost btn-sm">
                  打开全曲对照
                </Link>
              </p>
            </section>
          )}

          <section id="meter" className="block">
            <h2>词牌与声律</h2>
            <p>
              词牌原是曲调的名称，规定了一首词的段数、句数、每句字数、平仄和押韵位置。同一词牌可能有多种「体」，字数略有出入。
            </p>
            <ul className="plain-list">
              <li><b>单调 / 双调</b>：不分段的为单调，分上下两段（上片、下片）的为双调。</li>
              <li><b>小令、中调、长调</b>：按字数粗分，常引清人毛先舒之说（五十八字以内为小令，五十九至九十字为中调，九十一字以上为长调），学界对此多有讨论。</li>
              <li><b>平仄符号</b>：词谱中常以 ○ 表平声，● 表仄声，◐ 表可平可仄。</li>
              <li><b>押韵</b>：词韵较诗韵宽，清代戈载《词林正韵》将词韵归为十九部，为后人填词所常用。</li>
            </ul>
          </section>

          <section id="tones" className="block">
            <h2>平上去入</h2>
            <p>
              中古汉语有平、上、去、入四个声调。其中入声短促、以塞音收尾，在今天的普通话里已经消失，分别并入了其他声调（「入派三声」）。
              所以用普通话读宋词，很多字的平仄会判断错——例如「一」「白」「绿」在普通话里读作平声，在中古却是入声，属仄。
            </p>
            <p>
              本平台标注字声时以《广韵》等中古韵书为依据，并注明体系与可信度，不使用现代普通话声调代替。
              曲谱中可以开启「声调」显示：字的四角小圈即古人的<b>四声圈发</b>法——
            </p>
            <div className="quanfa">
              {TONE_NAMES.map((t) => (
                <div key={t} className="quanfa-item">
                  <span className="quanfa-char">
                    字
                    <ToneMark tone={{ category: t, system: '示意', confidence: 'reference' }} />
                  </span>
                  <span>{t}声 · {t === '平' ? '左下' : t === '上' ? '左上' : t === '去' ? '右上' : '右下'}</span>
                </div>
              ))}
            </div>
            <ToneQuiz />
          </section>
        </div>
      </div>
    </div>
  );
}

function ToneQuiz() {
  const repo = useRepo();
  const pool = useMemo(() => {
    const seen = new Set<string>();
    const out: { char: string; tone: ToneCategory; from: string }[] = [];
    for (const s of repo.data.scores) {
      for (const syl of s.syllables) {
        if (syl.tone && !seen.has(syl.char)) {
          seen.add(syl.char);
          out.push({ char: syl.char, tone: syl.tone.category, from: s.title });
        }
      }
    }
    return out;
  }, [repo]);
  const [i, setI] = useState(() => Math.floor(Math.random() * Math.max(1, pool.length)));
  const [answer, setAnswer] = useState<ToneCategory | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  if (!pool.length) return null;
  const q = pool[i % pool.length];

  const pick = (t: ToneCategory) => {
    if (answer) return;
    setAnswer(t);
    setScore((s) => ({ right: s.right + (t === q.tone ? 1 : 0), total: s.total + 1 }));
  };
  const next = () => {
    setAnswer(null);
    setI((v) => (v + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length);
  };

  return (
    <div className="quiz">
      <h3 className="sub">小练习：辨四声</h3>
      <div className="quiz-card">
        <span className="quiz-char">{q.char}</span>
        <div className="quiz-opts">
          {TONE_NAMES.map((t) => (
            <button
              key={t}
              type="button"
              className={`chip${answer && t === q.tone ? ' is-right' : ''}${answer === t && t !== q.tone ? ' is-wrong' : ''}`}
              onClick={() => pick(t)}
              disabled={Boolean(answer)}
            >
              {t}声
            </button>
          ))}
        </div>
        <p className="quiz-feedback" aria-live="polite">
          {answer ? (answer === q.tone ? `答对了，「${q.char}」是${q.tone}声。` : `「${q.char}」是${q.tone}声。`) : '选一个声调。'}
          {answer && <span className="muted">　出自：{q.from}</span>}
        </p>
        <div className="quiz-foot">
          <span className="muted">
            已答 {score.total} 题，对 {score.right} 题
          </span>
          {answer && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={next}>
              下一题
            </button>
          )}
        </div>
      </div>
      <p className="small muted">答案取自演示曲谱中的字声标注（依《广韵》推定，未经专家校订）。</p>
    </div>
  );
}

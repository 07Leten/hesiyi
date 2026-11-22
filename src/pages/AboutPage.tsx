import { OriginBadge } from '../components/common/Badges';
import { useRepo } from '../data/DataContext';

const SAMPLE = `{
  "id": "weishi-xxx",
  "poemId": "…",
  "tunePatternId": "…",
  "title": "某调 · 某词",
  "provenance": {
    "origin": "literature",
    "sourceTitle": "《魏氏乐谱今译》",
    "sourceDetail": "第 X 页 · 第 X 曲",
    "revisionStatus": "draft"
  },
  "key": { "tonic": "D", "gongcheKey": "小工调", "shangDegree": 1 },
  "meter": { "beatsPerBar": 4, "beatUnit": 4, "banyan": "一板三眼" },
  "tempo": 60,
  "lyrics": "（原词，含标点）",
  "tones": "（可选，逐字平上去入）",
  "jianpu": "3 5_ 6_~ 1' - | …",
  "gongche": "（可选，原谱工尺字，按出音顺序）",
  "noteMarks": [{ "note": 12, "text": "原谱此字漫漶", "uncertain": true }]
}`;

export function AboutPage() {
  const repo = useRepo();
  const { packs, issues } = repo.data;

  return (
    <div className="page about">
      <header className="page-head">
        <h1>关于合四一</h1>
        <p>
          「合、四、一」是工尺谱开头的三个音。这个平台想做的事很简单：围绕一首词，把词牌、词作、曲谱、声音和声律知识放在同一处，
          让人能检索、能读谱、也能听见。
        </p>
      </header>

      <section className="block">
        <h2>数据来源与标记</h2>
        <p>平台上的每一份曲谱都带有来源标记，并在页面上始终可见：</p>
        <dl className="origin-table">
          <div>
            <dt>
              <OriginBadge origin="literature" />
            </dt>
            <dd>来源于真实文献（如《魏氏乐谱今译》）的译谱，注明书名、页码与校订状态。优先保证准确，存疑之处逐音标出。</dd>
          </div>
          <div>
            <dt>
              <OriginBadge origin="demo" />
            </dt>
            <dd>为演示功能而编写或录入的数据。目前曲库中的三首曲谱都属此类：旋律由本项目编写，不是任何历史文献所载曲调；词作正文据通行文本录入，尚未与善本校对。</dd>
          </div>
          <div>
            <dt>
              <OriginBadge origin="ai" />
            </dt>
            <dd>由音乐生成模型创作的现代作品。接入模型后才会出现，不会冒充历史曲谱。</dd>
          </div>
          <div>
            <dt>
              <OriginBadge origin="rule" />
            </dt>
            <dd>浏览器内按字声与句读规则即时排布的旋律，只用于体验创作流程，既不是 AI 作品，也不是文献。</dd>
          </div>
        </dl>
        <p className="small muted">
          字声（平上去入）依《广韵》等中古韵书推定，并注明体系与可信度；演示数据中的字声标注尚未经音韵学者校订。工尺字若由简谱推导，会明确注明「推导」，与据原谱录入的区分开来。
        </p>
      </section>

      <section className="block">
        <h2>当前数据包</h2>
        <div className="pack-list">
          {packs.map((p) => (
            <article key={p.id} className="pack">
              <header>
                <h3>{p.label}</h3>
                <OriginBadge origin={p.origin} />
              </header>
              {p.description && <p>{p.description}</p>}
              <p className="pack-counts">
                {Object.entries(p.counts).map(([k, v]) => (
                  <span key={k}>
                    {k} <b>{v}</b>
                  </span>
                ))}
              </p>
            </article>
          ))}
        </div>
        <h3 className="sub">数据校验</h3>
        {issues.length === 0 ? (
          <p className="ok-line">全部数据通过校验：引用完整，曲谱字位与歌词逐字对齐。</p>
        ) : (
          <ul className="issue-list">
            {issues.map((i, k) => (
              <li key={k} className={`issue-${i.level}`}>
                <b>{i.level === 'error' ? '错误' : '提示'}</b> {i.entity} {i.id}：{i.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="block">
        <h2>导入《魏氏乐谱今译》</h2>
        <p>真实曲谱以独立的「文献数据包」导入，与演示数据分开存放，页面代码无需改动：</p>
        <ol className="steps">
          <li>在 <code>public/data/weishi/</code> 下放置 <code>tune-patterns.json</code>、<code>poems.json</code>、<code>scores.json</code>、<code>performances.json</code>（结构同演示包）。</li>
          <li>在 <code>public/data/manifest.json</code> 中把「魏氏」数据包的 <code>enabled</code> 改为 <code>true</code>。</li>
          <li>刷新页面，在本页「数据校验」查看对齐与引用是否有误。</li>
        </ol>
        <p>曲谱可以用紧凑的简谱文本逐小节录入，也可以直接给出完整的音符数组。一条曲谱记录大致如下：</p>
        <pre className="payload">{SAMPLE}</pre>
        <p className="small muted">
          简谱文本中：<code>'</code> 高八度、<code>,</code> 低八度、<code>_</code> 减半时值、<code>.</code> 附点、<code>-</code> 延长一拍、
          <code>~</code> 与前音同属一字、<code>?</code> 存疑音、<code>|</code> 小节线。原始录入文本会原样保存，便于日后核对。
        </p>
      </section>

      <section className="block">
        <h2>技术说明</h2>
        <ul className="plain-list">
          <li>前端：React + TypeScript + Vite，Hash 路由，可部署在任意静态托管。</li>
          <li>声音：Web Audio 播放开源乐器录音。钢琴、古筝、二胡是逐音采样；笛子、琵琶、古琴从一段示范录音里按起音切开，缺的音高用邻近采样变速。洞箫没有找到可再分发的逐音采样，用的是 FluidR3 里的尺八（同为竖吹）。来源与许可见 samples/CREDITS.md。板眼示范仍是一段短促的击节，不是乐器录音。</li>
          <li>数据层：数据源适配器（静态 JSON / 后端 API）→ 规范化与校验 → 检索仓库。用户数据（最近收听、收藏、创作）目前存于浏览器，接口已为接入用户系统预留。</li>
          <li>音乐生成：统一的服务接口，已预留模型 HTTP 适配器；未接入时不会伪造结果。</li>
        </ul>
      </section>
    </div>
  );
}

# 合四一 · 中国古典词乐数字化平台

> 依谱寻声，使旧词可听。

检索词牌 → 查看词作 → 阅读曲谱 → 按谱演奏 → 学习工尺谱与声韵。这是一个可直接运行的前端 Demo，所有音色都由浏览器实时合成，无需音频素材。

**在线演示：** <https://07leten.github.io/hesiyi/>

> **数据声明**：当前曲库中的三份曲谱都是**演示旋律**（为演示播放与逐字跟随而编写），**并非**《魏氏乐谱》或任何历史文献所载曲调；词作正文按通行文本录入，尚未与善本校对；字声依《广韵》推定，尚未经音韵学者校订。页面上每份曲谱都带有来源标记，「文献 / 演示 / AI 创作 / 规则生成」四类互不混同。

## 功能

| 页面 | 内容 |
| --- | --- |
| 首页 | 检索、今日一阕（竖排正文 + 首句曲谱试听）、词牌分类、推荐曲谱、最近收听 |
| 词牌曲库 | 按词牌、作者、词作检索；按朝代、体式、字数、有无曲谱、是否可播放筛选 |
| 词牌详情 | 源流、字数与分段、格律（仅在有可靠依据时展示）、代表词作、曲谱、作者 |
| 曲谱详情 | 简谱 / 工尺谱（竖排）/ 双谱对照；歌词、声调（四声圈发）、注释开关；逐音朱笔圈点跟随；点按音符或字即从该处播放 |
| 播放器 | 播放暂停、进度（句读刻度）、上下曲、变速、音量、循环；古琴、古筝、琵琶、竹笛、洞箫、二胡六种乐器，各两种音色，可多乐器合奏 |
| 音乐创作 | 选词或自填、风格、情绪、乐器、是否遵循格律、纯音乐或含演唱；试听、重新生成、保存、下载 WAV / 曲谱 JSON |
| 曲谱学习 | 工尺字与简谱对照（可点按试听）、板眼击节、识读示例、词牌声律、平上去入与辨四声练习 |

## 本地运行

```bash
npm install
npm run dev        # 开发服务器
npm run build      # 类型检查 + 生产构建，输出到 dist/
npm run preview    # 预览构建结果
```

需要 Node.js 20 或更高版本。

## 技术栈

- Vite + React 19 + TypeScript，`react-router-dom`（HashRouter，适配 GitHub Pages 等静态托管）
- 纯 CSS 与 CSS 变量，没有引入 UI 框架
- Web Audio API：前瞻调度器、物理建模合成、卷积混响、离线渲染导出 WAV
- 字体：思源宋体（Noto Serif SC）、霞鹜文楷（LXGW WenKai），均为 SIL OFL 授权，随站点自托管

## 目录结构

```
public/data/                 数据包（JSON），由 manifest.json 统一登记
  manifest.json
  instruments.json           乐器与音色参数
  demo/                      演示数据包
  weishi/                    预留：《魏氏乐谱今译》文献数据包（默认未启用）
src/
  data/
    types.ts                 实体定义：TunePattern、Poem、Author、Score、ScoreNote、LyricSyllable、Instrument、Performance
    records.ts               数据包原始记录格式
    notation/                简谱解析、工尺字推导、板眼、歌词与字声
    normalize.ts             原始记录 → 实体，并做引用与字位对齐校验
    sources/                 数据源适配器：StaticJsonSource / ApiSource
    repository.ts            检索、筛选、统计（页面只通过它取数）
  audio/
    synth/                   弹拨（Karplus-Strong）、吹管、拉弦三类合成器
    engine.ts                播放引擎（调度、变速、循环、跳转）
    sequence.ts              曲谱 → 音符事件，多乐器分层
    render.ts                离线渲染与 WAV 编码
  player/                    全局播放状态（PlayerContext）与逐帧同步 hooks
  services/
    user/                    用户数据接口（当前为 localStorage 实现）
    generation/              音乐生成服务接口与两种实现
  components/  pages/  styles/
scripts/check-classes.mjs    开发辅助：列出组件中使用但样式表中缺失的类名
```

## 数据架构

```
JSON 文件 / 后端 API  →  DataSource  →  normalize + 校验  →  Repository  →  页面
```

- 页面组件里不写死任何数据，一律通过 `Repository` 读取。
- 数据按「数据包」组织，每个包声明来源类型（`literature` / `demo` / `ai` / `rule`），在 `public/data/manifest.json` 中登记，可单独启用或停用。
- 每条曲谱、词作、词牌都带 `provenance`：来源、书名、页码、版本、整理者、校订状态（`unverified` 未校订 / `draft` 初稿 / `proofread` 已校对 / `verified` 已审定）。
- 工尺字分为「据原谱录入」和「由简谱推导」两种，推导所得会明确标注；未识读的字保留为空位，不做猜测。存疑的音逐个标记，并在页面上显示。
- 字声记录体系与可信度（如「《广韵》中古四声 · 演示标注」），不以现代普通话声调代替。

### 导入《魏氏乐谱今译》

1. 在 `public/data/weishi/` 下按演示包的格式准备 `tune-patterns.json`、`authors.json`、`poems.json`、`scores.json`、`performances.json`。词牌、作者如已在演示包中存在，可直接引用其 id。
2. 把 `manifest.json` 中 `weishi` 包的 `enabled` 改为 `true`。
3. 运行 `npm run dev`，打开「关于」页查看数据校验结果：引用缺失、歌词与正文不符、音符与字数对不上等问题都会列出。

一条曲谱记录示例：

```json
{
  "id": "weishi-001",
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
  "lyrics": "原词，含标点，「／」分段",
  "tones": "可选，逐字平上去入",
  "jianpu": "3 5_ 6_~ 1' - | …",
  "gongche": "可选：原谱工尺字，按出音顺序以空格分隔，未识读处写 □",
  "noteMarks": [{ "note": 12, "text": "原谱此字漫漶", "uncertain": true }]
}
```

### 简谱文本记法

为了便于逐小节录入，曲谱可以写成紧凑的简谱文本（由 `src/data/notation/jianpu.ts` 解析）。记号之间用空格分隔，小节之间用 `|` 分隔：

| 记号 | 含义 |
| --- | --- |
| `1`–`7`、`0` | 音级；`0` 为休止 |
| `#`、`b`（前缀） | 升、降 |
| `'`、`,`（后缀，可重复） | 高八度、低八度 |
| `_`（后缀） | 时值减半：`_` 八分音符，`__` 十六分音符 |
| `.`（后缀） | 附点 |
| `~`（后缀） | 与前一音同属一字（一字多音、拖腔） |
| `?`（后缀） | 存疑音 |
| `-`（独立记号） | 前一音延长一拍 |

例：`3 5_ 6_~ 1' 6_ 5_~ | 3 2_ 3_~ 5~ -`

音符与歌词逐字对齐：没有 `~` 的音各领一字。字数对不上时，校验会给出提示。

## 后端与扩展接口

| 环境变量 | 作用 |
| --- | --- |
| `VITE_DATA_API_URL` | 设置后改从后端读取数据：`GET {url}/dataset`，返回与静态数据包相同的结构 |
| `VITE_MUSIC_API_URL` | 接入音乐生成模型：`POST {url}/generations` 提交任务，`GET {url}/generations/{id}` 轮询结果 |

- 模型密钥不应放在前端，建议由后端代理持有密钥，前端只配置代理地址。
- 未配置模型时，创作页只展示将要发送的请求参数，**不会伪造 AI 输出**。另有一个「本地规则旋律」服务，在浏览器内按字声与句读排布旋律，结果标记为「规则生成 · 非 AI」，用于体验试听、保存与下载流程。
- 用户数据（最近收听、收藏、我的创作）目前通过 `UserStore` 接口保存在 localStorage；接入账号系统时实现同一接口即可。

## 部署

推送到 `main` 分支后，GitHub Actions（`.github/workflows/deploy.yml`）会自动构建并发布到 GitHub Pages。站点使用相对路径（`base: './'`）和 HashRouter，部署在任意子路径下都能正常访问。

## 许可

代码以 MIT 协议发布。字体遵循各自的 SIL Open Font License。

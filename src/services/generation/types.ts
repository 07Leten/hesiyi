import type { Score } from '../../data/types';

export interface GenerationRequest {
  poemId?: string;
  tunePatternId?: string;
  title: string;
  /** 词作全文（含标点） */
  text: string;
  /** 逐字声调（平上去入），可选 */
  tones?: string;
  style: string;
  mood: string;
  instruments: string[];
  /** 是否尽量遵循词牌句式与平仄 */
  followMeter: boolean;
  /** true = 含演唱；false = 纯音乐 */
  vocal: boolean;
  seed: number;
}

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface GenerationResult {
  /** 符号化结果（可直接在本平台播放、显示曲谱） */
  score?: Score;
  /** 音频结果（模型直接生成的音频文件） */
  audioUrl?: string;
  model: string;
  note: string;
}

export interface GenerationJob {
  id: string;
  providerId: string;
  status: JobStatus;
  progress?: number;
  message?: string;
  result?: GenerationResult;
  error?: string;
  request: GenerationRequest;
  createdAt: number;
}

export interface ProviderCapabilities {
  vocal: boolean;
  audio: boolean;
  symbolic: boolean;
}

/**
 * 音乐生成服务提供方。
 * isAI 为 false 的提供方产出的结果绝不能标记为 AI 创作。
 */
export interface MusicGenerationProvider {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly isAI: boolean;
  readonly capabilities: ProviderCapabilities;
  isConfigured(): boolean;
  /** 未配置时的说明 */
  configHint?: string;
  submit(req: GenerationRequest): Promise<GenerationJob>;
  /** 异步任务轮询；同步完成的提供方可不实现 */
  poll?(job: GenerationJob): Promise<GenerationJob>;
}

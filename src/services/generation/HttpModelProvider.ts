import type { GenerationJob, GenerationRequest, MusicGenerationProvider } from './types';

/**
 * 第三方音乐生成模型的 HTTP 适配器（预留）。
 *
 * 约定（可按所接模型调整本文件，页面无需改动）：
 *   POST {base}/generations        body: GenerationRequest   → { id, status }
 *   GET  {base}/generations/{id}                             → { id, status, progress?, audioUrl?, error? }
 *
 * 模型密钥不应放在前端。建议部署一个后端代理持有密钥，前端只配置代理地址：
 *   VITE_MUSIC_API_URL=https://your-proxy.example.com/api/music
 */
export class HttpModelProvider implements MusicGenerationProvider {
  readonly id = 'http-model';
  readonly label = '音乐生成模型';
  readonly description = '调用第三方音乐生成模型，依据词作、风格与情绪生成新作品。结果标记为「AI 创作」。';
  readonly isAI = true;
  readonly capabilities = { vocal: true, audio: true, symbolic: false };
  readonly configHint = '尚未接入音乐生成模型。部署时设置环境变量 VITE_MUSIC_API_URL（指向持有密钥的后端代理）即可启用。';

  private readonly base = (import.meta.env.VITE_MUSIC_API_URL as string | undefined)?.replace(/\/$/, '');

  isConfigured() {
    return Boolean(this.base);
  }

  async submit(req: GenerationRequest): Promise<GenerationJob> {
    if (!this.base) throw new Error(this.configHint);
    const res = await fetch(`${this.base}/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(`模型接口返回 HTTP ${res.status}`);
    const body = (await res.json()) as { id: string; status?: GenerationJob['status'] };
    return { id: body.id, providerId: this.id, status: body.status ?? 'queued', request: req, createdAt: Date.now() };
  }

  async poll(job: GenerationJob): Promise<GenerationJob> {
    if (!this.base) throw new Error(this.configHint);
    const res = await fetch(`${this.base}/generations/${encodeURIComponent(job.id)}`);
    if (!res.ok) throw new Error(`模型接口返回 HTTP ${res.status}`);
    const b = (await res.json()) as { status: GenerationJob['status']; progress?: number; audioUrl?: string; model?: string; error?: string };
    return {
      ...job,
      status: b.status,
      progress: b.progress,
      error: b.error,
      result: b.audioUrl
        ? { audioUrl: b.audioUrl, model: b.model ?? 'unknown', note: 'AI 创作 · 现代作品，非历史文献曲谱' }
        : job.result,
    };
  }
}

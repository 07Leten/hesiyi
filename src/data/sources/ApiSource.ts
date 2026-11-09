import type { RawDataset } from '../records';
import type { DataSource } from './DataSource';

/**
 * 后端 API 数据源（预留）。
 *
 * 约定接口：GET {baseUrl}/dataset 返回 RawDataset 结构；
 * 以后可拆成分页、按需加载的多个端点，只需在此类内部调整。
 * 启用方式：构建时设置环境变量 VITE_DATA_API_URL。
 */
export class ApiSource implements DataSource {
  readonly id = 'api';

  constructor(private readonly baseUrl: string) {}

  async load(): Promise<RawDataset> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/dataset`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`数据接口返回 HTTP ${res.status}`);
    return (await res.json()) as RawDataset;
  }
}

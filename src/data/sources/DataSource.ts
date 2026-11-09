import type { RawDataset } from '../records';

/**
 * 数据源适配器接口。
 * 页面不关心数据来自静态 JSON 还是后端，只依赖 Repository。
 */
export interface DataSource {
  readonly id: string;
  load(): Promise<RawDataset>;
}

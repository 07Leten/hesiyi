import { ApiSource } from './ApiSource';
import type { DataSource } from './DataSource';
import { StaticJsonSource } from './StaticJsonSource';

export function createDataSource(): DataSource {
  const api = import.meta.env.VITE_DATA_API_URL as string | undefined;
  return api ? new ApiSource(api) : new StaticJsonSource();
}

export type { DataSource };

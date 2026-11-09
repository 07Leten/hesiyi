import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { buildDataset } from './normalize';
import { Repository } from './repository';
import { createDataSource } from './sources';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; repo: Repository };

const Ctx = createContext<State>({ status: 'loading' });

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    createDataSource()
      .load()
      .then((raw) => alive && setState({ status: 'ready', repo: new Repository(buildDataset(raw)) }))
      .catch((e: unknown) => alive && setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useDataState() {
  return useContext(Ctx);
}

/** 仅在数据就绪后渲染的组件内使用 */
export function useRepo(): Repository {
  const s = useContext(Ctx);
  if (s.status !== 'ready') throw new Error('数据尚未加载');
  return s.repo;
}

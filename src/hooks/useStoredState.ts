import { useEffect, useState } from 'react';

/** 记住用户的阅读偏好（如曲谱显示模式） */
export function useStoredState<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`hesiyi:pref:${key}`);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`hesiyi:pref:${key}`, JSON.stringify(v));
    } catch {
      /* 忽略存储失败 */
    }
  }, [key, v]);
  return [v, setV] as const;
}

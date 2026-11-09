import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const IconPlay = (p: P) => (
  <svg {...base} {...p}><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" /></svg>
);
export const IconPause = (p: P) => (
  <svg {...base} {...p}><path d="M8.5 5.5v13M15.5 5.5v13" strokeWidth={2.6} /></svg>
);
export const IconPrev = (p: P) => (
  <svg {...base} {...p}><path d="M6.5 6v12" /><path d="M18 6.5v11L9.5 12z" fill="currentColor" stroke="none" /></svg>
);
export const IconNext = (p: P) => (
  <svg {...base} {...p}><path d="M17.5 6v12" /><path d="M6 6.5v11l8.5-5.5z" fill="currentColor" stroke="none" /></svg>
);
export const IconLoop = (p: P) => (
  <svg {...base} {...p}><path d="M5 11V9.5A3.5 3.5 0 0 1 8.5 6H18l-2.5-2.5M19 13v1.5a3.5 3.5 0 0 1-3.5 3.5H6l2.5 2.5" /></svg>
);
export const IconVolume = (p: P) => (
  <svg {...base} {...p}><path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></svg>
);
export const IconMute = (p: P) => (
  <svg {...base} {...p}><path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z" /><path d="M16 9.5l5 5M21 9.5l-5 5" /></svg>
);
export const IconSearch = (p: P) => (
  <svg {...base} {...p}><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5" /></svg>
);
export const IconInstruments = (p: P) => (
  <svg {...base} {...p}><path d="M4 18L18 4M7 21l-3-3M18 4l2 2" /><path d="M14 20c-2-1-3-3-3-5" /></svg>
);
export const IconHeart = ({ filled, ...p }: P & { filled?: boolean }) => (
  <svg {...base} {...p}><path d="M12 19s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 7.6a3.8 3.8 0 0 1 7 2.2C19 14.6 12 19 12 19z" fill={filled ? 'currentColor' : 'none'} /></svg>
);
export const IconDownload = (p: P) => (
  <svg {...base} {...p}><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" /></svg>
);
export const IconClose = (p: P) => (
  <svg {...base} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>
);
export const IconSound = (p: P) => (
  <svg {...base} {...p}><path d="M5 12h2l2-5 3 10 2.5-7 1.5 2h3" /></svg>
);

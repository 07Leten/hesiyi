import { HttpModelProvider } from './HttpModelProvider';
import { LocalRuleProvider } from './LocalRuleProvider';
import type { MusicGenerationProvider } from './types';

export const providers: MusicGenerationProvider[] = [new HttpModelProvider(), new LocalRuleProvider()];

export * from './types';

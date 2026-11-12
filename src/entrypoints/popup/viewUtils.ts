import type { Config, ConfigChange, EmailList } from '../../core/config';

export type Save = (change: ConfigChange) => Promise<Config>;

export const byName = (lists: readonly EmailList[]) => lists.toSorted((a, b) => a.name.localeCompare(b.name));
export const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

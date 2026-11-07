import { z } from 'zod';
import { mergeEmails } from './emails';
import { ACCESS_LEVELS, type AccessLevel } from './types';

const AccessSchema = z.enum(['view', 'comment', 'edit']);

const EmailListSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  emails: z.array(z.string()),
  access: AccessSchema.default('view'),
});

const DefaultSelectionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('all') }),
  z.object({ mode: z.literal('some'), listIds: z.array(z.string()) }),
]);

export const ConfigSchema = z.object({
  version: z.literal(2),
  lists: z.array(EmailListSchema).default([]),
  /** Which saved lists the Share tab ticks when it opens. */
  defaultSelection: DefaultSelectionSchema.default({ mode: 'some', listIds: [] }),
});

export type Config = z.infer<typeof ConfigSchema>;
export type EmailList = z.infer<typeof EmailListSchema>;
export type DefaultSelection = z.infer<typeof DefaultSelectionSchema>;

export const EMPTY_CONFIG: Config = {
  version: 2,
  lists: [],
  defaultSelection: { mode: 'some', listIds: [] },
};

/** The shape stored by version 0.1.0: named lists, one default access level, and jobs (now dropped). */
const V1Schema = z.object({
  version: z.literal(1),
  defaults: z.object({ access: AccessSchema.default('view') }).default({ access: 'view' }),
  lists: z.record(z.string(), z.array(z.string())).default({}),
});

/** Reads the stored config, upgrading the 0.1.0 format. Anything unreadable gives an empty config. */
export function loadStoredConfig(raw: unknown): Config {
  const current = ConfigSchema.safeParse(raw);
  if (current.success) return current.data;

  const v1 = V1Schema.safeParse(raw);
  if (!v1.success) return structuredClone(EMPTY_CONFIG);
  const lists = Object.entries(v1.data.lists)
    .filter(([name]) => name.trim())
    .map(([name, emails]) => createList(name, emails, v1.data.defaults.access));
  return { ...structuredClone(EMPTY_CONFIG), lists };
}

export function createList(name: string, emails: readonly string[], access: AccessLevel): EmailList {
  return { id: crypto.randomUUID(), name: name.trim(), emails: mergeEmails(emails), access };
}

/** Whether another list (not `exceptId`) already uses `name`, ignoring case. */
export function isNameTaken(config: Config, name: string, exceptId?: string): boolean {
  const key = name.trim().toLowerCase();
  return config.lists.some((l) => l.id !== exceptId && l.name.toLowerCase() === key);
}

/** Adds `list`, or replaces the list with the same id. */
export function upsertList(config: Config, list: EmailList): Config {
  const exists = config.lists.some((l) => l.id === list.id);
  return { ...config, lists: exists ? config.lists.map((l) => (l.id === list.id ? list : l)) : [...config.lists, list] };
}

/** Removes a list and drops it from the default selection. */
export function removeList(config: Config, id: string): Config {
  const sel = config.defaultSelection;
  return {
    ...config,
    lists: config.lists.filter((l) => l.id !== id),
    defaultSelection: sel.mode === 'some' ? { mode: 'some', listIds: sel.listIds.filter((x) => x !== id) } : sel,
  };
}

/** Ids of the lists ticked when the Share tab opens. */
export function defaultListIds(config: Config): string[] {
  const sel = config.defaultSelection;
  if (sel.mode === 'all') return config.lists.map((l) => l.id);
  return config.lists.filter((l) => sel.listIds.includes(l.id)).map((l) => l.id);
}

export interface Invitee {
  email: string;
  access: AccessLevel;
}

const rank = (a: AccessLevel) => ACCESS_LEVELS.indexOf(a);

/**
 * Everyone in the selected lists, each address once. When an address is in several lists,
 * it gets the highest access among them. Unknown ids are ignored.
 */
export function resolveInvites(config: Config, selectedIds: readonly string[]): Invitee[] {
  const byEmail = new Map<string, AccessLevel>();
  for (const list of config.lists) {
    if (!selectedIds.includes(list.id)) continue;
    for (const email of mergeEmails(list.emails)) {
      const current = byEmail.get(email);
      if (!current || rank(list.access) > rank(current)) byEmail.set(email, list.access);
    }
  }
  return [...byEmail].map(([email, access]) => ({ email, access }));
}

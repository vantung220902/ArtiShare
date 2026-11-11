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

/** Reads the stored config, upgrading the 0.1.0 format without overwriting unreadable data. */
export function loadStoredConfig(raw: unknown): Config {
  if (raw == null) return structuredClone(EMPTY_CONFIG);
  const current = ConfigSchema.safeParse(raw);
  if (current.success) return current.data;

  const v1 = V1Schema.safeParse(raw);
  if (!v1.success) {
    throw new Error('Saved lists have an unsupported or damaged format. They were not changed.');
  }
  const lists = Object.entries(v1.data.lists)
    .filter(([name]) => name.trim())
    .map(([name, emails]) => createList(name, emails, v1.data.defaults.access));

  return { ...structuredClone(EMPTY_CONFIG), lists };
}

export function createList(name: string, emails: readonly string[], access: AccessLevel): EmailList {
  return { id: crypto.randomUUID(), name: name.trim(), emails: mergeEmails(emails), access };
}

/**
 * The name a list gets when the user leaves it empty: its first two addresses, plus a count of
 * the rest. `emails` must already be deduplicated, so the count matches the people in the list.
 */
export function defaultListName(emails: readonly string[]): string {
  const [first, second] = emails;
  if (!first) return '';
  if (!second) return first;

  const more = emails.length - 2;

  return `${first} & ${second}${more > 0 ? ` +${more} ${more === 1 ? 'email' : 'emails'}` : ''}`;
}

/** Whether another list (not `exceptId`) already uses `name`, ignoring case. */
export function isNameTaken(config: Config, name: string, exceptId?: string): boolean {
  const key = name.trim().toLowerCase();

  return config.lists.some((l) => l.id !== exceptId && l.name.toLowerCase() === key);
}

/**
 * `base` if no other list uses it, otherwise `base (2)`, `base (3)`, … — the first free one.
 * For names the user didn't type: they never see an "already exists" error for those.
 */
export function uniqueListName(config: Config, base: string, exceptId?: string): string {
  if (!base) return base;

  let name = base;
  for (let n = 2; isNameTaken(config, name, exceptId); n++) name = `${base} (${n})`;

  return name;
}

/** Adds `list`, or replaces the list with the same id. */
export function upsertList(config: Config, list: EmailList): Config {
  const exists = config.lists.some((l) => l.id === list.id);

  return {
    ...config,
    lists: exists ? config.lists.map((l) => (l.id === list.id ? list : l)) : [...config.lists, list],
  };
}

/** Removes a list and drops it from the default selection. */
export function removeList(config: Config, id: string): Config {
  const sel = config.defaultSelection;

  return {
    ...config,
    lists: config.lists.filter((l) => l.id !== id),
    defaultSelection:
      sel.mode === 'some' ? { mode: 'some', listIds: sel.listIds.filter((x) => x !== id) } : sel,
  };
}

export type ConfigChange =
  | { type: 'save-list'; list: EmailList; expected: EmailList | null }
  | { type: 'delete-list'; id: string; expected: EmailList }
  | { type: 'set-default-mode'; mode: DefaultSelection['mode'] }
  | { type: 'set-default-list'; id: string; selected: boolean };

export function sameList(a: EmailList, b: EmailList): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.access === b.access &&
    a.emails.length === b.emails.length &&
    a.emails.every((email, i) => email === b.emails[i])
  );
}

/** Applies one user action to the latest stored config, rejecting stale list edits. */
export function applyConfigChange(config: Config, change: ConfigChange): Config {
  switch (change.type) {
    case 'save-list': {
      const current = config.lists.find((list) => list.id === change.list.id);
      if (change.expected === null && current)
        throw new Error('This list already exists. Reload and try again.');

      if (change.expected !== null && (!current || !sameList(current, change.expected))) {
        throw new Error('This list changed in another window. Reload its saved version before saving.');
      }

      const name = change.list.name.trim();
      if (!name || !change.list.emails.length)
        throw new Error('A list needs a name and at least one address.');
      if (isNameTaken(config, name, change.list.id))
        throw new Error(`A list called "${name}" already exists.`);

      return upsertList(config, { ...change.list, name });
    }

    case 'delete-list': {
      const current = config.lists.find((list) => list.id === change.id);

      if (!current || !sameList(current, change.expected)) {
        throw new Error('This list changed in another window. Reload its saved version before deleting.');
      }

      return removeList(config, change.id);
    }

    case 'set-default-mode':
      return {
        ...config,
        defaultSelection:
          change.mode === 'all' ? { mode: 'all' } : { mode: 'some', listIds: defaultListIds(config) },
      };

    case 'set-default-list': {
      const ids = new Set(defaultListIds(config));
      if (change.selected) ids.add(change.id);
      else ids.delete(change.id);

      return { ...config, defaultSelection: { mode: 'some', listIds: [...ids] } };
    }
  }
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

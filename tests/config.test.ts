import { describe, expect, it } from 'vitest';
import {
  applyConfigChange,
  type Config,
  createList,
  defaultListIds,
  defaultListName,
  EMPTY_CONFIG,
  isNameTaken,
  loadStoredConfig,
  removeList,
  resolveInvites,
  uniqueListName,
  upsertList,
} from '../src/core/config';

const acme = {
  id: 'acme',
  name: 'Acme',
  emails: ['alice@acme.com', 'bob@acme.com'],
  access: 'view' as const,
};
const qa = { id: 'qa', name: 'QA', emails: ['bob@acme.com', 'qa@nimblehq.co'], access: 'edit' as const };
const config = (overrides: Partial<Config> = {}): Config => ({
  ...EMPTY_CONFIG,
  lists: [acme, qa],
  ...overrides,
});

describe('uniqueListName', () => {
  it('keeps a free name and numbers a taken one from 2', () => {
    expect(uniqueListName(config(), 'Other')).toBe('Other');
    expect(uniqueListName(config(), 'Acme')).toBe('Acme (2)');
    expect(uniqueListName(config(), 'acme')).toBe('acme (2)');

    const withTwo = config({ lists: [acme, { ...acme, id: 'a2', name: 'Acme (2)' }] });
    expect(uniqueListName(withTwo, 'Acme')).toBe('Acme (3)');
  });

  it('ignores the list being edited and leaves an empty name empty', () => {
    expect(uniqueListName(config(), 'Acme', 'acme')).toBe('Acme');
    expect(uniqueListName(config(), '')).toBe('');
  });
});

describe('loadStoredConfig', () => {
  it('keeps a current config as is', () => {
    const c = config({ defaultSelection: { mode: 'all' } });
    expect(loadStoredConfig(c)).toEqual(c);
  });

  it('upgrades 0.1.0 configs, giving each list the old default access and dropping jobs and domains', () => {
    const c = loadStoredConfig({
      version: 1,
      defaults: { access: 'comment', delayMs: 500, orgDomains: ['nimblehq.co'] },
      lists: { acme: ['Alice@acme.com', 'alice@acme.com', 'bob@acme.com'], qa: ['qa@nimblehq.co'] },
      jobs: [{ name: 'Review', artifacts: [], lists: ['acme'], emails: [] }],
    });
    expect(c.version).toBe(2);
    expect(c.defaultSelection).toEqual({ mode: 'some', listIds: [] });
    expect(c.lists.map(({ name, emails, access }) => ({ name, emails, access }))).toEqual([
      { name: 'acme', emails: ['alice@acme.com', 'bob@acme.com'], access: 'comment' },
      { name: 'qa', emails: ['qa@nimblehq.co'], access: 'comment' },
    ]);
    expect(new Set(c.lists.map((l) => l.id)).size).toBe(2);
    expect(c).not.toHaveProperty('jobs');
    expect(c).not.toHaveProperty('defaults');
  });

  it('uses view access for 0.1.0 configs without defaults', () => {
    const c = loadStoredConfig({ version: 1, lists: { x: ['a@x.io'] } });
    expect(c.lists[0]?.access).toBe('view');
  });

  it('starts empty only when there is no saved config', () => {
    expect(loadStoredConfig(undefined)).toEqual(EMPTY_CONFIG);
    expect(loadStoredConfig(null)).toEqual(EMPTY_CONFIG);
  });

  it('refuses damaged or newer data so a save cannot overwrite it', () => {
    for (const raw of [
      'yaml',
      { version: 3 },
      { version: 2, lists: 'nope' },
      { version: 2, lists: [acme, { id: 'bad', name: '', emails: [], access: 'view' }] },
    ]) {
      expect(() => loadStoredConfig(raw)).toThrow(/unsupported or damaged/);
    }
  });
});

describe('list editing', () => {
  it('creates lists with an id and normalized addresses', () => {
    const l = createList('  Clients ', ['B@x.io', 'b@x.io', 'a@x.io'], 'comment');
    expect(l.id).toBeTruthy();
    expect(l).toMatchObject({ name: 'Clients', emails: ['b@x.io', 'a@x.io'], access: 'comment' });
  });

  it('checks names ignoring case, except for the list being edited', () => {
    expect(isNameTaken(config(), ' acme ')).toBe(true);
    expect(isNameTaken(config(), 'ACME', 'acme')).toBe(false);
    expect(isNameTaken(config(), 'Other')).toBe(false);
  });

  it('names a list after its first two addresses and counts the rest', () => {
    expect(defaultListName([])).toBe('');
    expect(defaultListName(['a@x.io'])).toBe('a@x.io');
    expect(defaultListName(['a@x.io', 'b@x.io'])).toBe('a@x.io & b@x.io');
    expect(defaultListName(['a@x.io', 'b@x.io', 'c@x.io'])).toBe('a@x.io & b@x.io +1 email');
    expect(defaultListName(['a@x.io', 'b@x.io', 'c@x.io', 'd@x.io'])).toBe('a@x.io & b@x.io +2 emails');
  });

  it('adds new lists and replaces existing ones', () => {
    const renamed = { ...acme, name: 'Acme Corp' };
    expect(upsertList(config(), renamed).lists).toEqual([renamed, qa]);
    const extra = { ...acme, id: 'new' };
    expect(upsertList(config(), extra).lists).toEqual([acme, qa, extra]);
  });

  it('drops a removed list from the default selection', () => {
    const c = removeList(config({ defaultSelection: { mode: 'some', listIds: ['acme', 'qa'] } }), 'acme');
    expect(c.lists).toEqual([qa]);
    expect(c.defaultSelection).toEqual({ mode: 'some', listIds: ['qa'] });
  });
});

describe('add-to-list', () => {
  it('appends to the list as it is stored now, keeping what another window changed', () => {
    // The popup read Acme with two addresses; another window has since renamed it and added carol.
    const changed = {
      ...acme,
      name: 'Acme Corp',
      access: 'edit' as const,
      emails: [...acme.emails, 'carol@acme.com'],
    };
    const next = applyConfigChange(config({ lists: [changed, qa] }), {
      type: 'add-to-list',
      id: 'acme',
      emails: ['dave@acme.com', 'Alice@acme.com'],
    });
    expect(next.lists[0]).toEqual({
      ...changed,
      emails: ['alice@acme.com', 'bob@acme.com', 'carol@acme.com', 'dave@acme.com'],
    });
    expect(next.lists[1]).toEqual(qa);
  });

  it('rejects a list that was deleted in another window and changes nothing', () => {
    const c = config({ lists: [qa] });
    expect(() => applyConfigChange(c, { type: 'add-to-list', id: 'acme', emails: ['d@x.io'] })).toThrow(
      /no longer exists/,
    );
  });
});

describe('defaultListIds', () => {
  it('ticks every list in "all" mode', () => {
    expect(defaultListIds(config({ defaultSelection: { mode: 'all' } }))).toEqual(['acme', 'qa']);
  });

  it('ticks only the chosen lists that still exist in "some" mode', () => {
    expect(defaultListIds(config({ defaultSelection: { mode: 'some', listIds: ['qa', 'gone'] } }))).toEqual([
      'qa',
    ]);
    expect(defaultListIds(config())).toEqual([]);
  });
});

describe('resolveInvites', () => {
  it('invites each address once, with the highest access among the selected lists', () => {
    expect(resolveInvites(config(), ['acme', 'qa'])).toEqual([
      { email: 'alice@acme.com', access: 'view' },
      { email: 'bob@acme.com', access: 'edit' },
      { email: 'qa@nimblehq.co', access: 'edit' },
    ]);
  });

  it('only uses the selected lists and ignores unknown ids', () => {
    expect(resolveInvites(config(), ['acme', 'gone'])).toEqual([
      { email: 'alice@acme.com', access: 'view' },
      { email: 'bob@acme.com', access: 'view' },
    ]);
    expect(resolveInvites(config(), [])).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { createList, EMPTY_CONFIG, type Config } from '../src/core/config';
import { createConfigController } from '../src/lib/configController';

function store(initial: Config = structuredClone(EMPTY_CONFIG)) {
  let saved = structuredClone(initial);
  const controller = createConfigController(
    async () => structuredClone(saved),
    async (next) => {
      saved = structuredClone(next);
    },
  );

  return { controller, read: () => saved };
}

describe('config controller', () => {
  it('preserves concurrent edits from separate popups', async () => {
    const { controller, read } = store();
    const a = createList('A', ['a@x.io'], 'view');
    const b = createList('B', ['b@x.io'], 'edit');
    await Promise.all([
      controller.change({ type: 'save-list', list: a, expected: null }),
      controller.change({ type: 'save-list', list: b, expected: null }),
    ]);
    expect(read().lists.map((list) => list.name)).toEqual(['A', 'B']);
  });

  it('rejects a stale list edit instead of overwriting another window', async () => {
    const original = createList('Clients', ['a@x.io'], 'view');
    const { controller, read } = store({ ...EMPTY_CONFIG, lists: [original] });
    await controller.change({
      type: 'save-list',
      list: { ...original, name: 'Clients updated' },
      expected: original,
    });
    await expect(
      controller.change({ type: 'save-list', list: { ...original, access: 'edit' }, expected: original }),
    ).rejects.toThrow(/changed in another window/);
    expect(read().lists[0]).toMatchObject({ name: 'Clients updated', access: 'view' });
  });

  it('applies default list toggles to the latest config', async () => {
    const a = createList('A', ['a@x.io'], 'view');
    const b = createList('B', ['b@x.io'], 'view');
    const { controller, read } = store({ ...EMPTY_CONFIG, lists: [a, b] });
    await Promise.all([
      controller.change({ type: 'set-default-list', id: a.id, selected: true }),
      controller.change({ type: 'set-default-list', id: b.id, selected: true }),
    ]);
    expect(read().defaultSelection).toEqual({ mode: 'some', listIds: [a.id, b.id] });
  });

  it('reads storage again before changing it, preserving edits from another context', async () => {
    let saved = structuredClone(EMPTY_CONFIG);
    const controller = createConfigController(
      async () => structuredClone(saved),
      async (next) => {
        saved = structuredClone(next);
      },
    );
    await controller.get();
    const external = createList('External', ['external@x.io'], 'view');
    saved = { ...saved, lists: [external] };
    const local = createList('Local', ['local@x.io'], 'view');
    await controller.change({ type: 'save-list', list: local, expected: null });
    expect(saved.lists.map((list) => list.name)).toEqual(['External', 'Local']);
  });
});

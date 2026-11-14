import type { BrowserContext, Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';

// F009: in Save to a list I choose exactly who to save, and can back out without saving anything,
// by mouse or keyboard. Driven in the side panel page: a popup page is itself the front tab, so it
// can't see an artifact.

test.beforeEach(async ({ context }) => {
  // Serve the pages ourselves: nothing may reach claude.ai.
  await context.route(/^https:\/\/claude\.ai\//, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>page</title>' }),
  );
});

/** Saves a new list from the given page, through the background like the Lists tab does. */
async function saveList(page: Page, name: string, emails: string[]) {
  await page.evaluate(
    async (args) => {
      const reply = (await chrome.runtime.sendMessage({
        type: 'config-change',
        change: {
          type: 'save-list',
          list: { id: crypto.randomUUID(), name: args.name, emails: args.emails, access: 'view' },
          expected: null,
        },
      })) as { ok: boolean; error?: string };
      if (!reply.ok) throw new Error(reply.error);
    },
    { name, emails },
  );
}

async function panelOver(context: BrowserContext, extensionId: string, id: string) {
  const tab = await context.newPage();
  await tab.goto(`https://claude.ai/artifact/${id}`);
  // The side panel page follows the tab in front, so it is opened first, then the tab is raised.
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.getByRole('heading', { name: 'ArtiShare' })).toBeVisible();
  await tab.bringToFront();

  return { panel, tab };
}

const SHARED = 'ExampleSharedArtifact1';
const share = (panel: Page) => panel.getByRole('tabpanel', { name: 'Share' });
// The Share form stays mounted (hidden) under Manage access and has a Name and a Permission of its own.
const saveView = (panel: Page) =>
  share(panel)
    .locator('section.card')
    .filter({ has: panel.getByRole('heading', { name: 'Save to a list' }) });
const openManage = (panel: Page) => panel.getByRole('button', { name: 'Manage access' }).click();
const openSave = (panel: Page) => share(panel).getByRole('button', { name: 'Save to a list' }).click();
const unlistedNote = (n: number) => `${n} people aren't in any of your lists.`;

/** What a keyboard user sees on the focused control: a ring made of an outline or a box-shadow. */
const hasFocusRing = (el: Locator) =>
  el.evaluate((node) => {
    const style = getComputedStyle(node);

    return (
      style.boxShadow !== 'none' || (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0)
    );
  });

test('unticking one person updates Select all, the count, the button and the name placeholder', async ({
  context,
  extensionId,
}) => {
  const { panel } = await panelOver(context, extensionId, SHARED);
  await openManage(panel);
  await openSave(panel);
  const view = saveView(panel);
  const selectAll = view.getByRole('checkbox', { name: 'Select all' });

  await view.getByRole('checkbox', { name: /^locked@example\.com/ }).uncheck();
  await expect(view.getByText('2 of 3 selected')).toBeVisible();
  await expect(selectAll).toHaveJSProperty('indeterminate', true);
  await expect(selectAll).not.toBeChecked();
  // The mixed box is drawn as a dash, not left looking empty.
  await expect
    .poll(() => selectAll.evaluate((box) => getComputedStyle(box).backgroundImage))
    .toContain('url(');
  await expect(view.getByRole('button', { name: 'Save 2 people' })).toBeEnabled();
  await expect(view.getByLabel('Name')).toHaveAttribute(
    'placeholder',
    'commenter@example.com & viewer@example.com',
  );
});

test('Select all ticks everyone, and again unticks everyone and disables saving', async ({
  context,
  extensionId,
}) => {
  const { panel } = await panelOver(context, extensionId, SHARED);
  await openManage(panel);
  await openSave(panel);
  const view = saveView(panel);
  const selectAll = view.getByRole('checkbox', { name: 'Select all' });
  const boxes = view.locator('.choices input[type="checkbox"]');

  await view.getByRole('checkbox', { name: /^locked@example\.com/ }).uncheck();
  await selectAll.click();
  await expect(boxes).toHaveCount(3);
  for (const box of await boxes.all()) await expect(box).toBeChecked();
  await expect(selectAll).toBeChecked();
  await expect(selectAll).toHaveJSProperty('indeterminate', false);

  await selectAll.click();
  for (const box of await boxes.all()) await expect(box).not.toBeChecked();
  await expect(selectAll).not.toBeChecked();
  await expect(selectAll).toHaveJSProperty('indeterminate', false);
  await expect(view.getByText('0 of 3 selected')).toBeVisible();
  await expect(view.getByRole('button', { name: /^Save/ })).toBeDisabled();
});

test('saving with only one person ticked leaves the other two out of any list', async ({
  context,
  extensionId,
}) => {
  const { panel } = await panelOver(context, extensionId, SHARED);
  await openManage(panel);
  await openSave(panel);
  const view = saveView(panel);

  await view.getByRole('checkbox', { name: 'Select all' }).uncheck();
  await view.getByRole('checkbox', { name: /^commenter@example\.com/ }).check();
  await expect(view.getByRole('button', { name: 'Save 1 person', exact: true })).toBeEnabled();
  await view.getByLabel('Name').fill('Just one');
  await view.getByRole('button', { name: 'Save 1 person' }).click();

  const people = share(panel);
  await expect(people.getByText('Saved 1 person to Just one.')).toBeVisible();
  const hint = (email: string) =>
    people.locator('ul.people > li').filter({ hasText: email }).locator('.hint');
  await expect(hint('commenter@example.com').filter({ hasText: 'In Just one' })).toHaveCount(1);
  await expect(hint('viewer@example.com').filter({ hasText: 'Not in a list' })).toHaveCount(1);
  await expect(hint('locked@example.com').filter({ hasText: 'Not in a list' })).toHaveCount(1);
  await expect(people.getByText(unlistedNote(2))).toBeVisible();
  await expect(people.getByRole('button', { name: 'Save to a list' })).toBeVisible();

  // Only that one address went into the list.
  await people.getByRole('button', { name: 'Open list' }).click();
  const card = panel
    .getByRole('tabpanel', { name: 'Lists' })
    .locator('details.list-card')
    .filter({ hasText: 'Just one' });
  expect((await card.locator('textarea').inputValue()).split(/\s+/).filter(Boolean)).toEqual([
    'commenter@example.com',
  ]);
});

test('Cancel returns to People with access, saves nothing and gives focus back', async ({
  context,
  extensionId,
}) => {
  const { panel } = await panelOver(context, extensionId, SHARED);
  await openManage(panel);
  const people = share(panel).locator('ul.people > li');
  await expect(people).toHaveCount(4);
  await openSave(panel);
  await saveView(panel)
    .getByRole('checkbox', { name: /^viewer@example\.com/ })
    .uncheck();
  await saveView(panel).getByLabel('Name').fill('Never saved');
  await saveView(panel).getByRole('button', { name: 'Cancel' }).click();

  await expect(share(panel).getByRole('heading', { name: 'People with access' })).toBeVisible();
  await expect(saveView(panel)).toHaveCount(0);
  await expect(people).toHaveCount(4);
  await expect(share(panel).getByText(unlistedNote(3))).toBeVisible();
  await expect(share(panel).getByText(/^Saved /)).toHaveCount(0);
  await expect(share(panel).getByRole('button', { name: 'Save to a list' })).toBeFocused();
  await expect(panel.getByRole('tab', { name: /Lists/ })).toContainText('0');

  // Opened again, it starts afresh: everyone ticked, nothing typed.
  await openSave(panel);
  await expect(saveView(panel).getByText('3 of 3 selected')).toBeVisible();
  await expect(saveView(panel).getByLabel('Name')).toHaveValue('');
});

test('Back at the top returns to the tab Manage access was opened from', async ({ context, extensionId }) => {
  const { panel } = await panelOver(context, extensionId, SHARED);
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });

  // From the Share tab.
  await openManage(panel);
  await openSave(panel);
  await expect(saveView(panel)).toBeVisible();
  await share(panel).getByRole('button', { name: 'Back' }).click();
  await expect(saveView(panel)).toHaveCount(0);
  await expect(share(panel).getByRole('heading', { name: 'People with access' })).toHaveCount(0);
  await expect(panel.getByRole('tab', { name: 'Share' })).toHaveAttribute('aria-selected', 'true');
  await expect(share(panel).getByRole('button', { name: /^Preview/ })).toBeVisible();

  // From the Lists tab.
  await panel.getByRole('tab', { name: /Lists/ }).click();
  await openManage(panel);
  await expect(lists.getByRole('heading', { name: 'People with access' })).toBeVisible();
  await lists.getByRole('button', { name: 'Save to a list' }).click();
  await expect(lists.getByRole('heading', { name: 'Save to a list' })).toBeVisible();
  await lists.getByRole('button', { name: 'Back' }).click();
  await expect(panel.getByRole('tab', { name: /Lists/ })).toHaveAttribute('aria-selected', 'true');
  await expect(lists.getByRole('heading', { name: 'Save to a list' })).toHaveCount(0);
  await expect(lists.getByRole('heading', { name: 'People with access' })).toHaveCount(0);
  await expect(lists.getByRole('button', { name: 'New list' })).toBeVisible();
});

test('the whole flow works from the keyboard, ending with Enter in the Name field', async ({
  context,
  extensionId,
}) => {
  const { panel } = await panelOver(context, extensionId, SHARED);
  await openManage(panel);
  await panel.getByRole('button', { name: 'Save to a list' }).first().focus();
  await panel.keyboard.press('Enter');
  const view = saveView(panel);
  await expect(view.getByRole('heading', { name: 'Save to a list' })).toBeFocused();

  // Tab order: Select all, each person, Name, Permission, Save, Cancel; each with a visible ring.
  const locked = view.getByRole('checkbox', { name: /^locked@example\.com/ });
  const nameField = view.getByLabel('Name');
  const order: Locator[] = [
    view.getByRole('checkbox', { name: 'Select all' }),
    view.getByRole('checkbox', { name: /^commenter@example\.com/ }),
    locked,
    view.getByRole('checkbox', { name: /^viewer@example\.com/ }),
    nameField,
    view.getByLabel('Permission'),
    view.getByRole('button', { name: 'Save 3 people' }),
    view.getByRole('button', { name: 'Cancel' }),
  ];
  for (const stop of order) {
    await panel.keyboard.press('Tab');
    await expect(stop).toBeFocused();
    await expect.poll(() => hasFocusRing(stop)).toBe(true);
  }

  // Back from Cancel to locked@example.com and untick them with Space.
  for (let i = 0; i < 5; i++) await panel.keyboard.press('Shift+Tab');
  await expect(locked).toBeFocused();
  await panel.keyboard.press('Space');
  await expect(locked).not.toBeChecked();
  await expect(view.getByText('2 of 3 selected')).toBeVisible();

  // Enter in Name saves, like the button does.
  await panel.keyboard.press('Tab');
  await panel.keyboard.press('Tab');
  await expect(nameField).toBeFocused();
  await panel.keyboard.type('By keyboard');
  await panel.keyboard.press('Enter');

  await expect(share(panel).getByText('Saved 2 people to By keyboard.')).toBeVisible();
  await expect(share(panel).getByRole('heading', { name: 'People with access' })).toBeVisible();
  await expect(panel.getByRole('tab', { name: /Lists/ })).toContainText('1');
});

test('Enter in Name saves nothing while nobody is ticked', async ({ context, extensionId }) => {
  const { panel } = await panelOver(context, extensionId, SHARED);
  await openManage(panel);
  await openSave(panel);
  const view = saveView(panel);
  await view.getByRole('checkbox', { name: 'Select all' }).uncheck();
  await view.getByLabel('Name').fill('Nobody');
  await view.getByLabel('Name').press('Enter');

  await expect(view.getByRole('heading', { name: 'Save to a list' })).toBeVisible();
  await expect(panel.getByRole('tab', { name: /Lists/ })).toContainText('0');
});

test('with lists saved, the choices and the List drop-down are in the tab order with a focus ring', async ({
  context,
  extensionId,
}) => {
  const { panel } = await panelOver(context, extensionId, SHARED);
  await saveList(panel, 'Team', ['a@example.com']);
  await openManage(panel);
  await openSave(panel);
  const view = saveView(panel);

  const newList = view.getByRole('radio', { name: 'New list' });
  const existing = view.getByRole('radio', { name: 'Add to an existing list' });
  await view.getByRole('checkbox', { name: /^viewer@example\.com/ }).focus();
  await panel.keyboard.press('Tab');
  await expect(newList).toBeFocused();
  await expect.poll(() => hasFocusRing(newList)).toBe(true);
  await expect(view.getByLabel('Name')).toBeVisible();

  // Arrow keys move within the radio group and choose, as they do for any radio group.
  await panel.keyboard.press('ArrowDown');
  await expect(existing).toBeFocused();
  await expect(existing).toBeChecked();
  await expect.poll(() => hasFocusRing(existing)).toBe(true);
  const list = view.getByLabel('List', { exact: true });
  await panel.keyboard.press('Tab');
  await expect(list).toBeFocused();
  await expect.poll(() => hasFocusRing(list)).toBe(true);
  const add = view.getByRole('button', { name: 'Add 3 people to Team' });
  await panel.keyboard.press('Tab');
  await expect(add).toBeFocused();
  await expect.poll(() => hasFocusRing(add)).toBe(true);
  await panel.keyboard.press('Enter');

  await expect(share(panel).getByText('Added 3 people to Team.')).toBeVisible();
});

test('closing the panel in the middle of choosing creates and changes no list', async ({
  context,
  extensionId,
}) => {
  const { panel } = await panelOver(context, extensionId, SHARED);
  await saveList(panel, 'Team', ['a@example.com']);
  await openManage(panel);
  await openSave(panel);
  const view = saveView(panel);
  await view.getByRole('checkbox', { name: /^viewer@example\.com/ }).uncheck();
  await view.getByLabel('Name').fill('Half done');
  await view.getByRole('radio', { name: 'Add to an existing list' }).check();

  // Closing and reopening is a fresh page over the same storage.
  await panel.reload();
  await expect(panel.getByRole('heading', { name: 'ArtiShare' })).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Save to a list' })).toHaveCount(0);
  await expect(panel.getByRole('tab', { name: /Lists/ })).toContainText('1');
  await panel.getByRole('tab', { name: /Lists/ }).click();
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });
  await expect(lists.locator('details.list-card')).toHaveCount(1);
  await lists.locator('summary', { hasText: 'Team' }).click();
  await expect(lists.locator('details.list-card textarea')).toHaveValue('a@example.com');
  await expect(lists.locator('summary', { hasText: 'Half done' })).toHaveCount(0);
});

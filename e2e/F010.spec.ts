import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';

// F010: if Save to a list can't save, it says why and keeps what I chose.
// Driven in the side panel page: a popup page is itself the front tab, so it can't see an artifact.

test.beforeEach(async ({ context }) => {
  // Serve the pages ourselves: nothing may reach claude.ai.
  await context.route(/^https:\/\/claude\.ai\//, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>page</title>' }),
  );
});

/** Saves a new list from the given page, through the background like the Lists tab does. */
async function saveList(page: Page, name: string, emails: string[], access: 'view' | 'comment' | 'edit') {
  await page.evaluate(
    async (args) => {
      const reply = (await chrome.runtime.sendMessage({
        type: 'config-change',
        change: {
          type: 'save-list',
          list: { id: crypto.randomUUID(), name: args.name, emails: args.emails, access: args.access },
          expected: null,
        },
      })) as { ok: boolean; error?: string };
      if (!reply.ok) throw new Error(reply.error);
    },
    { name, emails, access },
  );
}

/** What another window does to a list that is already saved: delete it, or replace its addresses. */
async function otherWindow(page: Page, name: string, action: 'delete' | { emails: string[] }) {
  await page.evaluate(
    async (args) => {
      const send = async (message: object) => {
        const reply = (await chrome.runtime.sendMessage(message)) as {
          ok: boolean;
          data?: { lists: { id: string; name: string; emails: string[]; access: string }[] };
          error?: string;
        };
        if (!reply.ok) throw new Error(reply.error);

        return reply.data!;
      };
      const config = await send({ type: 'config-get' });
      const list = config.lists.find((l) => l.name === args.name)!;
      await send({
        type: 'config-change',
        change:
          args.action === 'delete'
            ? { type: 'delete-list', id: list.id, expected: list }
            : { type: 'save-list', list: { ...list, emails: args.action.emails }, expected: list },
      });
    },
    { name, action },
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

  // Another window of the extension, which is where lists get changed behind the first one's back.
  const other = await context.newPage();
  await other.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(other.getByRole('heading', { name: 'ArtiShare' })).toBeVisible();
  await tab.bringToFront();

  return { panel, tab, other };
}

const SHARED = 'ExampleSharedArtifact1';
const share = (panel: Page) => panel.getByRole('tabpanel', { name: 'Share' });
// The Share form stays mounted (hidden) under Manage access and has fields of its own.
const saveView = (panel: Page) =>
  share(panel)
    .locator('section.card')
    .filter({ has: panel.getByRole('heading', { name: 'Save to a list' }) });
const openManage = (panel: Page) => panel.getByRole('button', { name: 'Manage access' }).click();
const openSave = (panel: Page) => share(panel).getByRole('button', { name: 'Save to a list' }).click();

/** Makes the next `config-change` messages from this page go through `answer`, and counts them. */
async function interceptSaves(page: Page, mode: 'fail' | 'slow') {
  await page.evaluate((m) => {
    const w = window as unknown as { __saves: number; __fail: boolean };
    w.__saves = 0;
    w.__fail = m === 'fail';
    const original = chrome.runtime.sendMessage.bind(chrome.runtime) as (msg: unknown) => Promise<unknown>;
    (chrome.runtime as unknown as { sendMessage: unknown }).sendMessage = async (msg: { type?: string }) => {
      if (msg?.type !== 'config-change') return original(msg);
      w.__saves++;
      if (w.__fail) return { ok: false, error: 'Storage is full' };
      await new Promise((resolve) => setTimeout(resolve, 600));

      return original(msg);
    };
  }, mode);
}
const saves = (page: Page) => page.evaluate(() => (window as unknown as { __saves: number }).__saves);
const stopFailing = (page: Page) =>
  page.evaluate(() => {
    (window as unknown as { __fail: boolean }).__fail = false;
  });

test('a name that is taken is explained and everything chosen is kept', async ({ context, extensionId }) => {
  const { panel } = await panelOver(context, extensionId, SHARED);
  await saveList(panel, 'Team', ['a@example.com'], 'edit');
  await openManage(panel);
  await openSave(panel);

  const view = saveView(panel);
  await view.getByRole('checkbox', { name: /locked@example.com/ }).uncheck();
  await view.getByLabel('Name').fill('team');
  await view.getByLabel('Permission').selectOption('edit');
  await view.getByRole('button', { name: 'Save 2 people' }).click();

  await expect(view.getByText('A list called "team" already exists.')).toBeVisible();
  // Nothing was saved, and the form is as it was.
  await expect(panel.getByRole('tab', { name: /Lists/ })).toContainText('1');
  await expect(view.getByText('2 of 3 selected')).toBeVisible();
  await expect(view.getByRole('checkbox', { name: /locked@example.com/ })).not.toBeChecked();
  await expect(view.getByLabel('Name')).toHaveValue('team');
  await expect(view.getByLabel('Permission')).toHaveValue('edit');
  await expect(view.getByRole('button', { name: 'Save 2 people' })).toBeEnabled();

  // Another name then works.
  await view.getByLabel('Name').fill('Team two');
  await view.getByRole('button', { name: 'Save 2 people' }).click();
  await expect(share(panel).getByText('Saved 2 people to Team two.')).toBeVisible();
});

test('a list deleted in another window is no longer offered, and nothing is saved', async ({
  context,
  extensionId,
}) => {
  const { panel, other } = await panelOver(context, extensionId, SHARED);
  await saveList(panel, 'Team', ['a@example.com'], 'edit');
  await saveList(panel, 'Design', ['b@example.com'], 'view');
  await openManage(panel);
  await openSave(panel);

  const view = saveView(panel);
  await view.getByRole('radio', { name: 'Add to an existing list' }).check();
  await view.getByLabel('List', { exact: true }).selectOption({ label: 'Team (1 address)' });
  await view.getByRole('checkbox', { name: /locked@example.com/ }).uncheck();

  await otherWindow(other, 'Team', 'delete');

  await expect(view.getByText(/The list "Team" no longer exists/)).toBeVisible();
  const list = view.getByLabel('List', { exact: true });
  await expect(list.locator('option')).toHaveText(['Pick a list', 'Design (1 address)']);
  await expect(view.getByRole('button', { name: /^Add 2 people/ })).toBeDisabled();
  // The ticks are kept.
  await expect(view.getByText('2 of 3 selected')).toBeVisible();

  // Pick another list, and the notice goes.
  await list.selectOption({ label: 'Design (1 address)' });
  await expect(view.getByText(/no longer exists/)).toHaveCount(0);
  await view.getByRole('button', { name: 'Add 2 people to Design' }).click();
  await expect(share(panel).getByText('Added 2 people to Design.')).toBeVisible();
  await expect(panel.getByRole('tab', { name: /Lists/ })).toContainText('1');
});

test('after the picked list is deleted I can choose New list instead', async ({ context, extensionId }) => {
  const { panel, other } = await panelOver(context, extensionId, SHARED);
  await saveList(panel, 'Team', ['a@example.com'], 'edit');
  await openManage(panel);
  await openSave(panel);

  const view = saveView(panel);
  await view.getByRole('radio', { name: 'Add to an existing list' }).check();
  await otherWindow(other, 'Team', 'delete');

  // It was the only list: there is nothing to add to, so New list is all that is left.
  await expect(view.getByText(/The list "Team" no longer exists/)).toBeVisible();
  await expect(view.getByRole('radio')).toHaveCount(0);
  await expect(view.getByLabel('Name')).toBeVisible();
  await view.getByRole('button', { name: 'Save 3 people' }).click();
  await expect(share(panel).getByText(/^Saved 3 people to /)).toBeVisible();
});

test('the background refuses to add to a list that was deleted, with the reason', async ({
  context,
  extensionId,
}) => {
  const { panel } = await panelOver(context, extensionId, SHARED);
  await saveList(panel, 'Team', ['a@example.com'], 'edit');
  // A window that hasn't heard about the deletion yet still sends the add by the list's id.
  const reply = await panel.evaluate(async () => {
    const got = (await chrome.runtime.sendMessage({ type: 'config-get' })) as {
      data: { lists: { id: string; name: string; emails: string[] }[] };
    };
    const team = got.data.lists[0]!;
    await chrome.runtime.sendMessage({
      type: 'config-change',
      change: { type: 'delete-list', id: team.id, expected: team },
    });

    return (await chrome.runtime.sendMessage({
      type: 'config-change',
      change: { type: 'add-to-list', id: team.id, emails: ['n@example.com'] },
    })) as { ok: boolean; error?: string };
  });
  expect(reply.ok).toBe(false);
  expect(reply.error).toMatch(/no longer exists/);
});

test('a list changed in another window keeps that change when people are added', async ({
  context,
  extensionId,
}) => {
  const { panel, other } = await panelOver(context, extensionId, SHARED);
  await saveList(panel, 'Team', ['a@example.com'], 'edit');
  await openManage(panel);
  await openSave(panel);

  const view = saveView(panel);
  await view.getByRole('radio', { name: 'Add to an existing list' }).check();
  await expect(view.getByLabel('List', { exact: true }).locator('option')).toHaveText(['Team (1 address)']);

  await otherWindow(other, 'Team', { emails: ['a@example.com', 'x@example.com', 'y@example.com'] });
  await expect(view.getByLabel('List', { exact: true }).locator('option')).toHaveText(['Team (3 addresses)']);

  await view.getByRole('button', { name: 'Add 3 people to Team' }).click();
  await expect(share(panel).getByText('Added 3 people to Team.')).toBeVisible();

  await share(panel).getByRole('button', { name: 'Open list' }).click();
  const team = panel
    .getByRole('tabpanel', { name: 'Lists' })
    .locator('details.list-card')
    .filter({ hasText: 'Team' });
  const emails = (await team.locator('textarea').inputValue()).split(/\s+/).filter(Boolean);
  expect(emails.slice(0, 3)).toEqual(['a@example.com', 'x@example.com', 'y@example.com']);
  expect(emails.slice(3).toSorted()).toEqual([
    'commenter@example.com',
    'locked@example.com',
    'viewer@example.com',
  ]);
  await expect(team.getByLabel('Permission')).toHaveValue('edit');
});

test('a change that lands in the background before the window hears of it is still merged', async ({
  context,
  extensionId,
}) => {
  const { panel, other } = await panelOver(context, extensionId, SHARED);
  await saveList(panel, 'Team', ['a@example.com'], 'edit');
  await openManage(panel);
  await openSave(panel);

  const view = saveView(panel);
  await view.getByRole('radio', { name: 'Add to an existing list' }).check();
  // The other window's change is made while this window's copy of the list is still the old one:
  // the add goes by list id and is applied to what is stored, so nothing of it is lost.
  await panel.evaluate(() => {
    const original = chrome.runtime.sendMessage.bind(chrome.runtime) as (msg: unknown) => Promise<unknown>;
    (chrome.runtime as unknown as { sendMessage: unknown }).sendMessage = async (msg: {
      type?: string;
      change?: { type: string };
    }) => {
      // Let the other window's write finish first, whatever order the events arrive in.
      if (msg?.type === 'config-change') await new Promise((resolve) => setTimeout(resolve, 800));

      return original(msg);
    };
  });
  await view.getByRole('button', { name: 'Add 3 people to Team' }).click();
  await otherWindow(other, 'Team', { emails: ['a@example.com', 'z@example.com'] });
  await expect(share(panel).getByText('Added 3 people to Team.')).toBeVisible();

  await share(panel).getByRole('button', { name: 'Open list' }).click();
  const team = panel
    .getByRole('tabpanel', { name: 'Lists' })
    .locator('details.list-card')
    .filter({ hasText: 'Team' });
  const emails = (await team.locator('textarea').inputValue()).split(/\s+/).filter(Boolean);
  expect(emails).toContain('z@example.com');
  expect(emails).toContain('viewer@example.com');
  expect(emails).toHaveLength(5);
});

test('when saving the lists fails the reason shows, nothing changes and saving again retries', async ({
  context,
  extensionId,
}) => {
  const { panel } = await panelOver(context, extensionId, SHARED);
  await openManage(panel);
  await openSave(panel);
  await interceptSaves(panel, 'fail');

  const view = saveView(panel);
  await view.getByRole('checkbox', { name: /locked@example.com/ }).uncheck();
  await view.getByLabel('Name').fill('Reviewers');
  await view.getByRole('button', { name: 'Save 2 people' }).click();

  await expect(view.getByText('Storage is full')).toBeVisible();
  expect(await saves(panel)).toBe(1);
  await expect(panel.getByRole('tab', { name: /Lists/ })).not.toContainText('1');
  // Still in Save to a list with everything chosen, and the button is usable again.
  await expect(view.getByText('2 of 3 selected')).toBeVisible();
  await expect(view.getByLabel('Name')).toHaveValue('Reviewers');
  await expect(view.getByRole('button', { name: 'Save 2 people' })).toBeEnabled();

  // Trying again asks again, and this time it works.
  await stopFailing(panel);
  await view.getByRole('button', { name: 'Save 2 people' }).click();
  await expect(share(panel).getByText('Saved 2 people to Reviewers.')).toBeVisible();
  expect(await saves(panel)).toBe(2);
  await expect(panel.getByRole('tab', { name: /Lists/ })).toContainText('1');
});

test('adding to a list that fails to save shows the reason and retries too', async ({
  context,
  extensionId,
}) => {
  const { panel } = await panelOver(context, extensionId, SHARED);
  await saveList(panel, 'Team', ['a@example.com'], 'edit');
  await openManage(panel);
  await openSave(panel);
  await interceptSaves(panel, 'fail');

  const view = saveView(panel);
  await view.getByRole('radio', { name: 'Add to an existing list' }).check();
  await view.getByRole('button', { name: 'Add 3 people to Team' }).click();
  await expect(view.getByText('Storage is full')).toBeVisible();
  await expect(view.getByRole('button', { name: 'Add 3 people to Team' })).toBeEnabled();

  await stopFailing(panel);
  await view.getByRole('button', { name: 'Add 3 people to Team' }).click();
  await expect(share(panel).getByText('Added 3 people to Team.')).toBeVisible();
});

test('while saving the button reads Saving… and is disabled, so a double click saves once', async ({
  context,
  extensionId,
}) => {
  const { panel } = await panelOver(context, extensionId, SHARED);
  await openManage(panel);
  await openSave(panel);
  await interceptSaves(panel, 'slow');

  const view = saveView(panel);
  await view.getByLabel('Name').fill('Once');
  await view.getByRole('button', { name: 'Save 3 people' }).dblclick();

  const busy = view.getByRole('button', { name: 'Saving…' });
  await expect(busy).toBeDisabled();
  await expect(share(panel).getByText('Saved 3 people to Once.')).toBeVisible();
  expect(await saves(panel)).toBe(1);

  // Back on People with access: the list exists once.
  await expect(panel.getByRole('tab', { name: /Lists/ })).toContainText('1');
  await share(panel).getByRole('button', { name: 'Open list' }).click();
  await expect(
    panel.getByRole('tabpanel', { name: 'Lists' }).locator('details.list-card').filter({ hasText: 'Once' }),
  ).toHaveCount(1);
});

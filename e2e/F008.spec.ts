import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';

// F008: Save to a list can instead add the people to one of my existing lists.
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
// The Share form stays mounted (hidden) under Manage access and has fields of its own.
const saveView = (panel: Page) =>
  share(panel)
    .locator('section.card')
    .filter({ has: panel.getByRole('heading', { name: 'Save to a list' }) });
const openManage = (panel: Page) => panel.getByRole('button', { name: 'Manage access' }).click();
const openSave = (panel: Page) => share(panel).getByRole('button', { name: 'Save to a list' }).click();

/** Team (Can edit) and Design (Can view), as in the feature's first step. */
async function twoLists(panel: Page) {
  await saveList(panel, 'Team', ['a@example.com'], 'edit');
  await saveList(panel, 'Design', ['b@example.com'], 'view');
}

test('Add to an existing list swaps the new-list fields for a List drop-down', async ({
  context,
  extensionId,
}) => {
  const { panel } = await panelOver(context, extensionId, SHARED);
  await twoLists(panel);
  await openManage(panel);
  await openSave(panel);

  const view = saveView(panel);
  await expect(view.getByRole('radio', { name: 'New list' })).toBeChecked();
  await expect(view.getByRole('radio', { name: 'Add to an existing list' })).not.toBeChecked();
  await expect(view.getByLabel('Name')).toBeVisible();

  await view.getByRole('radio', { name: 'Add to an existing list' }).check();
  const list = view.getByLabel('List', { exact: true });
  await expect(list).toBeVisible();
  // The Lists tab's order (by name), each with its address count.
  await expect(list.locator('option')).toHaveText(['Design (1 address)', 'Team (1 address)']);
  await expect(view.getByLabel('Name')).toHaveCount(0);
  await expect(view.getByLabel('Permission')).toHaveCount(0);

  await list.selectOption({ label: 'Team (1 address)' });
  await expect(
    view.getByText(
      "They'll get Team's permission (Can edit) when you share with Team. Their access to this artifact doesn't change.",
    ),
  ).toBeVisible();
  await expect(view.getByRole('button', { name: 'Add 3 people to Team' })).toBeEnabled();

  // Back to a new list brings the fields back.
  await view.getByRole('radio', { name: 'New list' }).check();
  await expect(view.getByLabel('Name')).toBeVisible();
  await expect(view.getByLabel('Permission')).toBeVisible();
  await expect(view.getByRole('button', { name: 'Save 3 people' })).toBeVisible();
});

test('Add appends the people to the list, keeps its permission and creates nothing', async ({
  context,
  extensionId,
}) => {
  const { panel } = await panelOver(context, extensionId, SHARED);
  await twoLists(panel);
  await openManage(panel);
  await expect(panel.getByRole('tab', { name: /Lists/ })).toContainText('2');
  await openSave(panel);

  const view = saveView(panel);
  await view.getByRole('radio', { name: 'Add to an existing list' }).check();
  await view.getByLabel('List', { exact: true }).selectOption({ label: 'Team (1 address)' });
  await view.getByRole('button', { name: 'Add 3 people to Team' }).click();

  const people = share(panel);
  await expect(people.getByRole('heading', { name: 'People with access' })).toBeVisible();
  await expect(people.getByText('Added 3 people to Team.')).toBeVisible();
  for (const email of ['viewer@example.com', 'commenter@example.com', 'locked@example.com']) {
    await expect(
      people
        .locator('ul.people > li')
        .filter({ hasText: email })
        .locator('.hint')
        .filter({ hasText: 'In Team' }),
    ).toHaveCount(1);
  }
  await expect(people.getByText(/in any of your lists/)).toHaveCount(0);
  await expect(panel.getByRole('tab', { name: /Lists/ })).toContainText('2');

  await people.getByRole('button', { name: 'Open list' }).click();
  const lists = panel.getByRole('tabpanel', { name: 'Lists' });
  const team = lists.locator('details.list-card').filter({ hasText: 'Team' });
  await expect(team).toHaveAttribute('open', '');
  // The old address first, then the three new ones; still Can edit.
  const emails = (await team.locator('textarea').inputValue()).split(/\s+/).filter(Boolean);
  expect(emails[0]).toBe('a@example.com');
  expect(emails.slice(1).toSorted()).toEqual([
    'commenter@example.com',
    'locked@example.com',
    'viewer@example.com',
  ]);
  await expect(team.getByLabel('Permission')).toHaveValue('edit');

  // Design is unchanged.
  const design = lists.locator('details.list-card').filter({ hasText: 'Design' });
  await design.locator('summary').click();
  expect((await design.locator('textarea').inputValue()).trim()).toBe('b@example.com');
  await expect(design.getByLabel('Permission')).toHaveValue('view');
});

test('with no saved lists, Add to an existing list is not offered', async ({ context, extensionId }) => {
  const { panel } = await panelOver(context, extensionId, SHARED);
  await openManage(panel);
  await openSave(panel);

  const view = saveView(panel);
  await expect(view.getByLabel('Name')).toBeVisible();
  await expect(view.getByRole('radio')).toHaveCount(0);
  await expect(view.getByText('Add to an existing list')).toHaveCount(0);
});

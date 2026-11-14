import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';

// F007: Save to a list puts the people who aren't in any list into a new list in a couple of clicks.
// Driven in the side panel page: a popup page is itself the front tab, so it can't see an artifact.

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
const PLACEHOLDER = 'commenter@example.com & locked@example.com +1 email';

test('Save to a list replaces People with access, lists everyone ticked with their permission', async ({
  context,
  extensionId,
}) => {
  const { panel } = await panelOver(context, extensionId, SHARED);
  await openManage(panel);
  await openSave(panel);

  const view = saveView(panel);
  await expect(view.getByRole('heading', { name: 'Save to a list' })).toBeFocused();
  await expect(share(panel).getByRole('heading', { name: 'People with access' })).toHaveCount(0);
  // Back stays at the top.
  await expect(share(panel).getByRole('button', { name: 'Back' })).toBeVisible();

  // Labelled with the address and what they can do on this artifact; the UI says "Commenter".
  for (const label of [
    'commenter@example.com · Commenter',
    'locked@example.com · Can view',
    'viewer@example.com · Can view',
  ]) {
    await expect(view.getByRole('checkbox', { name: label })).toBeChecked();
  }
  await expect(view.getByRole('checkbox', { name: 'Select all' })).toBeChecked();
  await expect(view.getByText('3 of 3 selected')).toBeVisible();

  // No saved lists: only the new-list fields, with the Lists tab's name for an unnamed list.
  await expect(view.getByLabel('Name')).toHaveAttribute('placeholder', PLACEHOLDER);
  // They don't all have the same permission, so Can view.
  await expect(view.getByLabel('Permission')).toHaveValue('view');
  await expect(view.getByRole('button', { name: 'Save 3 people' })).toBeEnabled();
});

test('saving goes back to People with access, says what was saved and opens the list', async ({
  context,
  extensionId,
}) => {
  const { panel } = await panelOver(context, extensionId, SHARED);
  await openManage(panel);
  await expect(panel.getByRole('tab', { name: /Lists/ })).toContainText('0');
  await openSave(panel);
  await saveView(panel).getByLabel('Name').fill('Shared reviewers');
  await saveView(panel).getByRole('button', { name: 'Save 3 people' }).click();

  const view = share(panel);
  await expect(view.getByRole('heading', { name: 'People with access' })).toBeVisible();
  await expect(view.getByText('Saved 3 people to Shared reviewers.')).toBeVisible();
  await expect(view.getByRole('button', { name: 'Open list' })).toBeVisible();
  for (const email of ['viewer@example.com', 'commenter@example.com', 'locked@example.com']) {
    await expect(
      view
        .locator('ul.people > li')
        .filter({ hasText: email })
        .locator('.hint')
        .filter({ hasText: 'In Shared reviewers' }),
    ).toHaveCount(1);
  }
  await expect(view.getByText(/in any of your lists/)).toHaveCount(0);
  await expect(view.getByRole('button', { name: 'Save to a list' })).toHaveCount(0);
  await expect(panel.getByRole('tab', { name: /Lists/ })).toContainText('1');

  await view.getByRole('button', { name: 'Open list' }).click();
  const lists = panel.getByRole('tabpanel', { name: 'Lists' });
  await expect(lists).toBeVisible();
  const card = lists.locator('details.list-card').filter({ hasText: 'Shared reviewers' });
  await expect(card).toHaveAttribute('open', '');
  const emails = await card.locator('textarea').inputValue();
  expect(emails.split(/\s+/).filter(Boolean).toSorted()).toEqual([
    'commenter@example.com',
    'locked@example.com',
    'viewer@example.com',
  ]);
  await expect(card.getByLabel('Permission')).toHaveValue('view');
});

test('the permission is preset to the one everybody has', async ({ context, extensionId }) => {
  // Every odd Crowded person is pending Can view and every even one Commenter, so tick just evens.
  const { panel } = await panelOver(context, extensionId, 'ExampleCrowdedArtifact1');
  await openManage(panel);
  await openSave(panel);
  const view = saveView(panel);
  await expect(view.getByLabel('Permission')).toHaveValue('view');
  await view.getByRole('checkbox', { name: 'Select all' }).uncheck();
  await view.getByRole('checkbox', { name: 'crowd02@example.com · Commenter' }).check();
  await view.getByRole('checkbox', { name: 'crowd04@example.com · Commenter' }).check();
  await expect(view.getByLabel('Permission')).toHaveValue('comment');
});

test('an empty name gets the placeholder, made unique when a list already has it', async ({
  context,
  extensionId,
}) => {
  const { panel } = await panelOver(context, extensionId, SHARED);
  await saveList(panel, PLACEHOLDER, ['other@example.com']);
  await openManage(panel);
  await openSave(panel);
  await share(panel).getByRole('button', { name: 'Save 3 people' }).click();

  await expect(share(panel).getByText(`Saved 3 people to ${PLACEHOLDER} (2).`)).toBeVisible();
});

test('Cancel goes back to People with access and saves nothing', async ({ context, extensionId }) => {
  const { panel } = await panelOver(context, extensionId, SHARED);
  await openManage(panel);
  await openSave(panel);
  await share(panel).getByRole('button', { name: 'Cancel' }).click();

  await expect(share(panel).getByRole('heading', { name: 'People with access' })).toBeVisible();
  await expect(share(panel).getByRole('button', { name: 'Save to a list' })).toBeFocused();
  await expect(panel.getByRole('tab', { name: /Lists/ })).toContainText('0');
});

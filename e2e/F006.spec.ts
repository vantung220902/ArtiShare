import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';

// F006: when some people with access aren't in any list, People with access says how many and
// offers a Save to a list button. A quiet line, not a warning.

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

/** A side panel page following a tab on the given artifact. */
async function panelOver(context: BrowserContext, extensionId: string, id: string) {
  const tab = await context.newPage();
  await tab.goto(`https://claude.ai/artifact/${id}`);
  // The side panel page follows the tab in front, so it is opened first, then the tab is raised.
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.getByRole('heading', { name: 'ArtiShare' })).toBeVisible();
  await tab.bringToFront();

  return panel;
}

const SHARED = 'ExampleSharedArtifact1';
const tabpanel = (panel: Page) => panel.getByRole('tabpanel', { name: 'Share' });
const openManage = (panel: Page) => panel.getByRole('button', { name: 'Manage access' }).click();
const saveButton = (panel: Page) => tabpanel(panel).getByRole('button', { name: 'Save to a list' });

test('the note counts people in no list, singular for one, and goes when everyone is in a list', async ({
  context,
  extensionId,
}) => {
  const panel = await panelOver(context, extensionId, SHARED);
  await openManage(panel);
  await expect(tabpanel(panel).locator('ul.people > li')).toHaveCount(4);
  await expect(tabpanel(panel).getByText("3 people aren't in any of your lists.")).toBeVisible();
  await expect(saveButton(panel)).toBeVisible();

  // Saved in another window, and the open view follows without a Refresh.
  await saveList(panel, 'Two', ['viewer@example.com', 'commenter@example.com']);
  await expect(tabpanel(panel).getByText("1 person isn't in any of your lists.")).toBeVisible();
  await expect(saveButton(panel)).toBeVisible();

  await saveList(panel, 'Three', ['locked@example.com']);
  await expect(tabpanel(panel).getByText(/in any of your lists/)).toHaveCount(0);
  await expect(saveButton(panel)).toHaveCount(0);
});

test('the note reads the same when reopened over saved lists', async ({ context, extensionId }) => {
  const panel = await panelOver(context, extensionId, SHARED);
  await saveList(panel, 'Two', ['viewer@example.com', 'commenter@example.com']);
  await openManage(panel);

  await expect(tabpanel(panel).getByText("1 person isn't in any of your lists.")).toBeVisible();
});

test('nobody invited: Only you have access, and no Save to a list', async ({ context, extensionId }) => {
  const panel = await panelOver(context, extensionId, 'ExampleEmptyArtifact1');
  await openManage(panel);

  await expect(tabpanel(panel).getByText('Only you have access.')).toBeVisible();
  await expect(tabpanel(panel).getByText(/in any of your lists/)).toHaveCount(0);
  await expect(saveButton(panel)).toHaveCount(0);
});

test('a read that fails shows the error and Retry, and no Save to a list', async ({
  context,
  extensionId,
}) => {
  const panel = await panelOver(context, extensionId, 'ExampleMissingArtifact1');
  await openManage(panel);

  await expect(tabpanel(panel).getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(tabpanel(panel).locator('.alert')).toBeVisible();
  await expect(saveButton(panel)).toHaveCount(0);
  await expect(tabpanel(panel).getByText(/in any of your lists/)).toHaveCount(0);
});

test('the note is a quiet line: no alert role and not red', async ({ context, extensionId }) => {
  const panel = await panelOver(context, extensionId, SHARED);
  await openManage(panel);
  const note = tabpanel(panel).getByText("3 people aren't in any of your lists.");
  await expect(note).toBeVisible();

  await expect(tabpanel(panel).getByRole('alert')).toHaveCount(0);
  await expect(note).not.toHaveClass(/alert/);
  // The same colour as the other hints, which are not warnings.
  const colour = (el: ReturnType<Page['locator']>) => el.evaluate((n) => getComputedStyle(n).color);
  const rowHint = tabpanel(panel).locator('ul.people .hint').first();
  expect(await colour(note)).toBe(await colour(rowHint));
});

import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';

// F005: People with access says, for each person invited, which saved lists they're in, or
// 'Not in a list'. Lists are saved through the same `config-change` message the Lists tab uses.

const SHARED = 'https://claude.ai/artifact/ExampleSharedArtifact1';

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

/** Opens Manage access in a side panel page over the Shared artifact, and returns the people rows. */
async function manageAccess(context: BrowserContext, extensionId: string) {
  const tab = await context.newPage();
  await tab.goto(SHARED);
  // The side panel page follows the tab in front, so it is opened first, then the tab is raised.
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.setViewportSize({ width: 400, height: 900 });
  await expect(panel.getByRole('heading', { name: 'ArtiShare' })).toBeVisible();
  await tab.bringToFront();

  return panel;
}

const open = async (panel: Page) => {
  await panel.getByRole('button', { name: 'Manage access' }).click();
  const rows = panel.getByRole('tabpanel', { name: 'Share' }).locator('ul.people > li');
  await expect(rows).toHaveCount(4);

  return rows;
};

const hint = (rows: ReturnType<Page['locator']>, email: string) =>
  rows.filter({ hasText: email }).locator('.hint');

test('each person says which lists they are in, or Not in a list; the owner says neither', async ({
  context,
  extensionId,
}) => {
  const panel = await manageAccess(context, extensionId);
  await saveList(panel, 'Team', ['viewer@example.com']);
  const rows = await open(panel);

  await expect(hint(rows, 'viewer@example.com')).toHaveText('Accepted · In Team');
  await expect(hint(rows, 'commenter@example.com')).toHaveText('Pending · Not in a list');
  await expect(hint(rows, 'locked@example.com')).toHaveText('Accepted · Not in a list');
  await expect(rows.first()).toContainText('You (owner)');
  await expect(rows.first().locator('.hint')).toHaveCount(0);
  await expect(rows.first()).not.toContainText('list');
});

test('two lists are named in the order of the Lists tab; more become +N with every name in a tooltip', async ({
  context,
  extensionId,
}) => {
  const panel = await manageAccess(context, extensionId);
  await saveList(panel, 'Team', ['viewer@example.com']);
  await saveList(panel, 'Reviewers', ['viewer@example.com']);
  const rows = await open(panel);

  // The Lists tab sorts by name, not by when a list was saved, and so does this note.
  await expect(hint(rows, 'viewer@example.com')).toHaveText('Accepted · In Reviewers, Team');

  await saveList(panel, 'Ops', ['viewer@example.com']);
  const note = hint(rows, 'viewer@example.com');
  await expect(note).toHaveText('Accepted · In Ops, Reviewers +1');
  await expect(note.locator('[title]')).toHaveAttribute('title', 'Ops, Reviewers, Team');
});

test('addresses match the way lists match them: any case, and a Gmail +tag alias', async ({
  context,
  extensionId,
}) => {
  const panel = await manageAccess(context, extensionId);
  await saveList(panel, 'Mixed case', ['Viewer@Example.com']);
  await saveList(panel, 'Gmail', ['commenter@gmail.com', 'locked+work@example.com']);
  const rows = await open(panel);

  await expect(hint(rows, 'viewer@example.com')).toHaveText('Accepted · In Mixed case');
  // Only Gmail ignores +tags: the same local part at another domain is somebody else.
  await expect(hint(rows, 'commenter@example.com')).toHaveText('Pending · Not in a list');
  await expect(hint(rows, 'locked@example.com')).toHaveText('Accepted · Not in a list');
});

test('a list saved from another window changes the open row within a second, with no Refresh', async ({
  context,
  extensionId,
}) => {
  const panel = await manageAccess(context, extensionId);
  const rows = await open(panel);
  await expect(hint(rows, 'commenter@example.com')).toHaveText('Pending · Not in a list');

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await saveList(popup, 'Late list', ['commenter@example.com']);

  await expect(hint(rows, 'commenter@example.com')).toHaveText('Pending · In Late list', {
    timeout: 1000,
  });
});

import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from '../fixtures';

// F007: a draft restored when the popup reopens is reconciled with what changed while it was
// closed. Closing is simulated by sending the popup page to about:blank (so it can't write
// anything), and "another window" is a second popup page that changes the saved lists.

const ONE = 'https://claude.ai/artifact/ReconcileArtifact0001';

const share = (panel: Page) => panel.getByRole('tabpanel', { name: 'Share' });
const lists = (panel: Page) => panel.getByRole('tabpanel', { name: /Lists/ });

/** Saves a list from the Lists tab. */
async function saveList(panel: Page, name: string, emails: string) {
  await panel.getByRole('tab', { name: /Lists/ }).click();
  await lists(panel).getByRole('button', { name: 'New list' }).click();
  await lists(panel).getByLabel('List name').filter({ visible: true }).fill(name);
  await lists(panel).getByLabel('Email addresses').filter({ visible: true }).fill(emails);
  await lists(panel).getByRole('button', { name: 'Save list' }).click();
  await expect(lists(panel).locator('summary', { hasText: name })).toBeVisible();
}

const storedPopup = (panel: Page) =>
  panel.evaluate(
    async () =>
      (await chrome.storage.session.get('popupState')).popupState as
        { lists: { edits: Record<string, { text: string }>; open: string[] } } | undefined,
  );

/** Closes the popup: nothing of the page is left running, only what it stored. */
async function close(panel: Page) {
  await panel.goto('about:blank');
}

/** Reopens the popup page the way a click on the toolbar button would. */
async function reopen(panel: Page, url: string) {
  await panel.goto(url);
}

type Change = { kind: 'delete'; name: string } | { kind: 'emails'; name: string; emails: string[] };

/**
 * Changes a saved list from a second popup page, as another window would, then closes it. The
 * change goes through the same messages Save and Delete use, so it is stored exactly as theirs.
 */
async function inOtherWindow(context: BrowserContext, url: string, change: Change) {
  const other = await context.newPage();
  await other.goto(url);
  await other.evaluate(async (c) => {
    type List = { id: string; name: string; emails: string[]; access: string };
    const send = async (req: Record<string, unknown>) => {
      const reply = (await chrome.runtime.sendMessage(req)) as {
        ok: boolean;
        data: { lists: List[] };
        error?: string;
      };
      if (!reply.ok) throw new Error(reply.error);

      return reply.data;
    };
    const list = (await send({ type: 'config-get' })).lists.find((l) => l.name === c.name);
    if (!list) throw new Error(`No list called ${c.name}`);
    await send({
      type: 'config-change',
      change:
        c.kind === 'delete'
          ? { type: 'delete-list', id: list.id, expected: list }
          : { type: 'save-list', list: { ...list, emails: c.emails }, expected: list },
    });
  }, change);
  await other.close();
}

test('a list deleted while the popup was closed is gone from the reopened form, with no error', async ({
  context,
  panel,
}) => {
  const url = panel.url();
  await saveList(panel, 'Alpha team', 'ana@example.com');
  await saveList(panel, 'Beta team', 'bo@example.com');
  await panel.getByRole('tab', { name: 'Share' }).click();
  const alpha = share(panel).locator('label.pick', { hasText: 'Alpha team' }).getByRole('checkbox');
  const beta = share(panel).locator('label.pick', { hasText: 'Beta team' }).getByRole('checkbox');
  await share(panel)
    .getByLabel(/Artifacts/)
    .fill(ONE);
  await alpha.check();
  await beta.check();
  await expect
    .poll(() =>
      panel.evaluate(
        async () =>
          ((await chrome.storage.session.get('shareDraft')).shareDraft as { selected: string[] }).selected
            .length,
      ),
    )
    .toBe(2);

  await close(panel);
  await inOtherWindow(context, url, { kind: 'delete', name: 'Beta team' });
  await reopen(panel, url);

  await expect(share(panel).getByLabel(/Artifacts/)).toHaveValue(ONE);
  await expect(alpha).toBeChecked();
  await expect(beta).toHaveCount(0);
  await expect(panel.locator('.alert')).toHaveCount(0);
});

test('an unsaved edit or open form for a list deleted meanwhile leaves nothing behind', async ({
  context,
  panel,
}) => {
  const url = panel.url();
  await saveList(panel, 'Alpha team', 'ana@example.com');
  await saveList(panel, 'Beta team', 'bo@example.com');
  const row = (name: string) => lists(panel).locator('details', { hasText: name });
  await row('Beta team').locator('summary').click();
  await row('Beta team').getByLabel('Email addresses').fill('bo@example.com\nextra@example.com');
  await row('Alpha team').locator('summary').click();
  await expect.poll(async () => Object.keys((await storedPopup(panel))?.lists.edits ?? {}).length).toBe(1);
  await expect.poll(async () => (await storedPopup(panel))?.lists.open.length).toBe(2);

  await close(panel);
  await inOtherWindow(context, url, { kind: 'delete', name: 'Beta team' });
  await reopen(panel, url);

  await expect(panel.getByRole('tab', { name: /Lists/ })).toHaveAttribute('aria-selected', 'true');
  await expect(lists(panel).locator('summary', { hasText: 'Beta team' })).toHaveCount(0);
  // Alpha was open and untouched: it is still open, and Beta's draft didn't end up on it.
  await expect(row('Alpha team')).toHaveAttribute('open', '');
  await expect(row('Alpha team').getByLabel('Email addresses')).toHaveValue('ana@example.com');
  await expect(row('Alpha team').getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await expect(lists(panel).getByLabel('Email addresses').filter({ visible: true })).toHaveCount(1);
  await expect(panel.locator('.alert')).toHaveCount(0);
});

test("an unsaved edit of a list that changed meanwhile is kept, with the 'changed in another window' warning", async ({
  context,
  panel,
}) => {
  const url = panel.url();
  await saveList(panel, 'Alpha team', 'ana@example.com');
  const row = lists(panel).locator('details', { hasText: 'Alpha team' });
  await row.locator('summary').click();
  await row.getByLabel('Email addresses').fill('ana@example.com\nmine@example.com');
  await expect.poll(async () => Object.keys((await storedPopup(panel))?.lists.edits ?? {}).length).toBe(1);

  await close(panel);
  await inOtherWindow(context, url, {
    kind: 'emails',
    name: 'Alpha team',
    emails: ['ana@example.com', 'theirs@example.com'],
  });
  await reopen(panel, url);

  await expect(row).toHaveAttribute('open', '');
  // The draft is kept as typed...
  await expect(row.getByLabel('Email addresses')).toHaveValue('ana@example.com\nmine@example.com');
  // ...next to the existing warning and Reload saved; Save is off until the conflict is resolved.
  await expect(row.getByText('This list changed in another window.')).toBeVisible();
  await expect(row.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await expect(row.getByRole('button', { name: 'Delete' })).toBeDisabled();

  await row.getByRole('button', { name: 'Reload saved' }).click();
  await expect(row.getByLabel('Email addresses')).toHaveValue('ana@example.com\ntheirs@example.com');
  await expect(row.getByText('This list changed in another window.')).toHaveCount(0);
  await expect(row.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await expect.poll(async () => Object.keys((await storedPopup(panel))?.lists.edits ?? {}).length).toBe(0);
});

test('an edit of a list that did not change meanwhile is restored without any warning', async ({ panel }) => {
  const url = panel.url();
  await saveList(panel, 'Alpha team', 'ana@example.com');
  const row = lists(panel).locator('details', { hasText: 'Alpha team' });
  await row.locator('summary').click();
  await row.getByLabel('Email addresses').fill('ana@example.com\nmine@example.com');
  await expect.poll(async () => Object.keys((await storedPopup(panel))?.lists.edits ?? {}).length).toBe(1);

  await close(panel);
  await reopen(panel, url);

  await expect(row.getByLabel('Email addresses')).toHaveValue('ana@example.com\nmine@example.com');
  await expect(row.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  await expect(row.getByText('This list changed in another window.')).toHaveCount(0);
  await expect(panel.locator('.alert')).toHaveCount(0);
});

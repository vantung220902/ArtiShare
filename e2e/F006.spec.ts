import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// F006: closing the popup doesn't lose a list being typed or edited, or the tab that was open.
// Closing is simulated by reloading the popup page, which throws away all of its state just as
// a real close does.

/** The Lists tab's state as last written to session storage. */
const storedLists = (panel: Page) =>
  panel.evaluate(
    async () =>
      (
        (await chrome.storage.session.get('popupState')).popupState as
          | {
              lists: {
                adding: boolean;
                newList: { text: string } | null;
                open: string[];
                edits: Record<string, unknown>;
              };
            }
          | undefined
      )?.lists,
  );

const storedShare = (panel: Page) =>
  panel.evaluate(
    async () =>
      (await chrome.storage.session.get('shareDraft')).shareDraft as
        { creating?: boolean; newList?: { text: string } } | undefined,
  );

const storedTab = (panel: Page) =>
  panel.evaluate(
    async () =>
      ((await chrome.storage.session.get('popupState')).popupState as { tab: string } | undefined)?.tab,
  );

const lists = (panel: Page) => panel.getByRole('tabpanel', { name: /Lists/ });
const share = (panel: Page) => panel.getByRole('tabpanel', { name: 'Share' });

/** Saves a list from the Lists tab, then closes and reopens the popup. */
async function saveList(panel: Page, name: string, emails: string, access?: string) {
  await panel.getByRole('tab', { name: /Lists/ }).click();
  await lists(panel).getByRole('button', { name: 'New list' }).click();
  await lists(panel).getByLabel('List name').filter({ visible: true }).fill(name);
  await lists(panel).getByLabel('Email addresses').filter({ visible: true }).fill(emails);
  if (access) await lists(panel).getByLabel('Permission').filter({ visible: true }).selectOption(access);
  await lists(panel).getByRole('button', { name: 'Save list' }).click();
  await expect(lists(panel).locator('summary', { hasText: name })).toBeVisible();
}

test('a new list being typed in the Lists tab comes back with the tab, and goes when saved or cancelled', async ({
  panel,
}) => {
  await panel.getByRole('tab', { name: /Lists/ }).click();
  await lists(panel).getByRole('button', { name: 'New list' }).click();
  await lists(panel).getByLabel('List name').fill('Acme clients');
  await lists(panel).getByLabel('Email addresses').fill('ana@example.com\nbo@example.com');
  await lists(panel).getByLabel('Permission').selectOption('Can edit');
  await expect.poll(async () => (await storedLists(panel))?.newList?.text).toContain('bo@example.com');
  await expect.poll(() => storedTab(panel)).toBe('lists');

  await panel.reload();

  await expect(panel.getByRole('tab', { name: /Lists/ })).toHaveAttribute('aria-selected', 'true');
  await expect(lists(panel).getByLabel('List name')).toHaveValue('Acme clients');
  await expect(lists(panel).getByLabel('Email addresses')).toHaveValue('ana@example.com\nbo@example.com');
  await expect(lists(panel).getByLabel('Permission')).toHaveValue('edit');

  // Cancel: it is a decision to throw the draft away.
  await lists(panel).getByRole('button', { name: 'Cancel' }).click();
  await expect.poll(async () => (await storedLists(panel))?.adding).toBe(false);
  await panel.reload();
  await expect(lists(panel).getByRole('button', { name: 'New list' })).toBeVisible();
  await expect(lists(panel).getByLabel('List name')).toHaveCount(0);

  // Save list: the draft becomes a list and is not a draft any more.
  await lists(panel).getByRole('button', { name: 'New list' }).click();
  await lists(panel).getByLabel('List name').fill('Saved one');
  await lists(panel).getByLabel('Email addresses').fill('cy@example.com');
  await expect.poll(async () => (await storedLists(panel))?.newList?.text).toBe('cy@example.com');
  await lists(panel).getByRole('button', { name: 'Save list' }).click();
  await expect(lists(panel).locator('summary', { hasText: 'Saved one' })).toBeVisible();
  await expect.poll(async () => (await storedLists(panel))?.adding).toBe(false);
  await expect.poll(async () => (await storedLists(panel))?.newList).toBeNull();
  await panel.reload();
  await expect(lists(panel).getByRole('button', { name: 'New list' })).toBeVisible();
  // The saved list's own form is in the DOM, collapsed; only the new-list form would be visible.
  await expect(lists(panel).getByLabel('List name').filter({ visible: true })).toHaveCount(0);
});

test('an open New list form with nothing typed in it is still open when the popup reopens', async ({
  panel,
}) => {
  await panel.getByRole('tab', { name: /Lists/ }).click();
  await lists(panel).getByRole('button', { name: 'New list' }).click();
  await expect.poll(async () => (await storedLists(panel))?.adding).toBe(true);

  await panel.reload();
  await expect(lists(panel).getByLabel('List name')).toBeVisible();
  await expect(lists(panel).getByLabel('List name')).toHaveValue('');
});

test('an unsaved edit of a saved list comes back expanded, with Save and Revert enabled', async ({
  panel,
}) => {
  await saveList(panel, 'Alpha team', 'ana@example.com');
  await panel.reload();
  const row = lists(panel).locator('details', { hasText: 'Alpha team' });
  // Untouched, nothing is expanded or kept.
  await expect(row).not.toHaveAttribute('open', '');
  await row.locator('summary').click();
  await expect(row.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await row.getByLabel('Permission').selectOption('Can edit');
  await expect(row.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  await expect.poll(async () => Object.keys((await storedLists(panel))?.edits ?? {}).length).toBe(1);

  await panel.reload();

  await expect(panel.getByRole('tab', { name: /Lists/ })).toHaveAttribute('aria-selected', 'true');
  await expect(row).toHaveAttribute('open', '');
  await expect(row.getByLabel('Permission')).toHaveValue('edit');
  await expect(row.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  await expect(row.getByRole('button', { name: 'Revert' })).toBeEnabled();
  // The list itself is unchanged until it is saved.
  await expect(row.locator('summary')).toContainText('Can view');

  // Revert drops the draft; the list stays expanded as the user left it.
  await row.getByRole('button', { name: 'Revert' }).click();
  await expect.poll(async () => Object.keys((await storedLists(panel))?.edits ?? {}).length).toBe(0);
  await panel.reload();
  await expect(row).toHaveAttribute('open', '');
  await expect(row.getByLabel('Permission')).toHaveValue('view');
  await expect(row.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

  // Saving an edit leaves nothing to restore either.
  await row.getByLabel('Permission').selectOption('Commenter');
  await expect.poll(async () => Object.keys((await storedLists(panel))?.edits ?? {}).length).toBe(1);
  await row.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(row.locator('summary')).toContainText('Commenter');
  await expect.poll(async () => Object.keys((await storedLists(panel))?.edits ?? {}).length).toBe(0);
  await panel.reload();
  await expect(row.getByLabel('Permission')).toHaveValue('comment');
  await expect(row.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
});

test('a list collapsed again is not reopened, and the Share tab is the tab that comes back when it was open', async ({
  panel,
}) => {
  await saveList(panel, 'Alpha team', 'ana@example.com');
  const row = lists(panel).locator('details', { hasText: 'Alpha team' });
  await row.locator('summary').click();
  await expect.poll(async () => (await storedLists(panel))?.open.length).toBe(1);
  await row.locator('summary').click();
  await expect.poll(async () => (await storedLists(panel))?.open.length).toBe(0);

  await panel.getByRole('tab', { name: 'Share' }).click();
  await expect.poll(() => storedTab(panel)).toBe('share');
  await panel.reload();
  await expect(panel.getByRole('tab', { name: 'Share' })).toHaveAttribute('aria-selected', 'true');
  await expect(share(panel)).toBeVisible();
  // The Lists tab is hidden now, so look the row up without going through its role.
  await expect(panel.locator('details', { hasText: 'Alpha team' })).not.toHaveAttribute('open', '');
});

test('the inline New list form in Share comes back with what was typed, and goes when cancelled or saved', async ({
  panel,
}) => {
  await saveList(panel, 'Alpha team', 'ana@example.com');
  await panel.getByRole('tab', { name: 'Share' }).click();
  await share(panel).getByRole('button', { name: 'New list' }).click();
  await share(panel).getByLabel('Email addresses').fill('new@example.com');
  await expect.poll(async () => (await storedShare(panel))?.newList?.text).toBe('new@example.com');

  await panel.reload();
  await expect(panel.getByRole('tab', { name: 'Share' })).toHaveAttribute('aria-selected', 'true');
  await expect(share(panel).getByLabel('Email addresses')).toHaveValue('new@example.com');

  await share(panel).getByRole('button', { name: 'Cancel' }).click();
  await expect.poll(async () => (await storedShare(panel))?.creating).toBeUndefined();
  await panel.reload();
  await expect(share(panel).getByRole('button', { name: 'New list' })).toBeVisible();
  await expect(share(panel).getByLabel('Email addresses')).toHaveCount(0);

  // An open form with only a permission picked is a draft too.
  await share(panel).getByRole('button', { name: 'New list' }).click();
  await share(panel).getByLabel('Permission').selectOption('Can edit');
  await expect.poll(async () => (await storedShare(panel))?.newList).toBeDefined();
  await panel.reload();
  await expect(share(panel).getByLabel('Permission')).toHaveValue('edit');

  // Save list in the inline form: the list exists and the form is gone, also after a reopen.
  await share(panel).getByLabel('Email addresses').fill('saved@example.com');
  await share(panel).getByRole('button', { name: 'Save list' }).click();
  await expect(share(panel).getByRole('button', { name: 'New list' })).toBeVisible();
  await expect.poll(async () => (await storedShare(panel))?.creating).toBeUndefined();
  await expect.poll(async () => (await storedShare(panel))?.newList).toBeUndefined();
  await panel.reload();
  await expect(share(panel).getByRole('button', { name: 'New list' })).toBeVisible();
  await expect(share(panel).getByLabel('Email addresses')).toHaveCount(0);
});

test('with no saved lists the inline form is there and keeps what was typed in it', async ({ panel }) => {
  await expect(share(panel).getByLabel('Email addresses')).toBeVisible();
  await share(panel).getByLabel('Email addresses').fill('first@example.com');
  await expect.poll(async () => (await storedShare(panel))?.newList?.text).toBe('first@example.com');
  await panel.reload();
  await expect(share(panel).getByLabel('Email addresses')).toHaveValue('first@example.com');
});

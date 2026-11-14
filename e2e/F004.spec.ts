import type { BrowserContext } from '@playwright/test';
import { expect, test } from './fixtures';

// F004: the fake claude.ai has a "Crowded" artifact with 45 people already invited, so saving many
// people to a list can be tried. Here only what Manage access lists is checked; the rule itself is
// in tests/fakeShareClient.test.ts.

const CROWDED = 'https://claude.ai/artifact/ExampleCrowdedArtifact1';
const SHARED = 'https://claude.ai/artifact/ExampleSharedArtifact01';
const PLAIN = 'https://claude.ai/artifact/ExampleArtifactOne01';

test.beforeEach(async ({ context }) => {
  // Serve the pages ourselves: nothing may reach claude.ai.
  await context.route(/^https:\/\/claude\.ai\//, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>page</title>' }),
  );
});

async function manageAccessOver(context: BrowserContext, extensionId: string, url: string) {
  const tab = await context.newPage();
  await tab.goto(url);
  // The side panel page follows the tab in front (a popup page, being a tab itself, would not), so
  // it is opened first and the artifact tab is brought to the front afterwards.
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.setViewportSize({ width: 400, height: 900 });
  await expect(panel.getByRole('heading', { name: 'ArtiShare' })).toBeVisible();
  await tab.bringToFront();
  await panel.getByRole('button', { name: 'Manage access' }).click();

  return panel.getByRole('tabpanel', { name: 'Share' });
}

test('Manage access over a Crowded artifact lists You, then the 45 people in order', async ({
  context,
  extensionId,
}) => {
  const share = await manageAccessOver(context, extensionId, CROWDED);
  const people = share.locator('ul.people > li');

  await expect(share.getByRole('heading', { name: 'People with access' })).toBeVisible();
  await expect(people).toHaveCount(46);
  await expect(people.first()).toContainText('You (owner)');

  const emails = await people.locator('.email').allTextContents();
  expect(emails).toEqual([
    'You (owner)',
    ...Array.from({ length: 45 }, (_, i) => `crowd${String(i + 1).padStart(2, '0')}@example.com`),
  ]);

  // Odd numbers Pending with Can view, even numbers Accepted with Can comment.
  const hints = await people.locator('.hint').allTextContents();
  expect(hints.map((h) => h.trim())).toEqual(
    Array.from({ length: 45 }, (_, i) => ((i + 1) % 2 === 1 ? 'Pending' : 'Accepted')),
  );
  const access = await people
    .locator('select')
    .evaluateAll((selects) => selects.map((s) => (s as HTMLSelectElement).selectedOptions[0]!.text));
  // The app's name for the comment level is "Commenter" (as in claude.ai's Share menu).
  expect(access).toEqual(
    Array.from({ length: 45 }, (_, i) => ((i + 1) % 2 === 1 ? 'Can view' : 'Commenter')),
  );
});

test('a Shared artifact still has its three people, and a plain one only you', async ({
  context,
  extensionId,
}) => {
  const shared = await manageAccessOver(context, extensionId, SHARED);
  await expect(shared.locator('ul.people > li .email')).toHaveText([
    'You (owner)',
    'viewer@example.com',
    'commenter@example.com',
    'locked@example.com',
  ]);

  const plain = await manageAccessOver(context, extensionId, PLAIN);
  await expect(plain.getByText('Only you have access.')).toBeVisible();
  await expect(plain.locator('ul.people > li')).toHaveCount(1); // only the You (owner) row
});

import { answer, expect, test } from '../fixtures';

// F007: the Manage access icon only appears on an artifact tab, works from the keyboard, and fits
// the header at the popup's 380 px width.

const SHARED = 'https://claude.ai/artifact/ExampleSharedArtifact01';
const EMPTY = 'https://claude.ai/artifact/EmptyArtifactForTests01';

test.beforeEach(async ({ context }) => {
  // Serve the pages ourselves: nothing may reach claude.ai or anywhere else.
  await context.route(/^https:\/\/(claude\.ai|example\.com)\//, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>page</title>' }),
  );
});

test('no icon and no gap on a non-artifact page or on claude.ai without an artifact', async ({
  context,
  panel,
}) => {
  const icon = panel.getByRole('button', { name: 'Manage access' });
  const pill = panel.locator('header .account');

  for (const url of ['https://example.com/', 'https://claude.ai/']) {
    const tab = await context.newPage();
    await tab.goto(url);
    await tab.bringToFront();
    await panel.reload();
    await expect(pill).toContainText('owner@example.com');
    await expect(icon).toHaveCount(0);
    // The pill is the last thing in the header: it ends at the header's padding edge, so nothing
    // is reserved for an icon.
    const gap = await panel.locator('header').evaluate((header) => {
      const last = header.lastElementChild!.getBoundingClientRect();

      return header.getBoundingClientRect().right - last.right;
    });
    expect(gap).toBeLessThan(1);
    await tab.close();
  }
});

test('keyboard: Tab reaches the icon with a focus ring, Enter focuses Back, Back returns focus', async ({
  context,
  panel,
}) => {
  const tab = await context.newPage();
  await tab.goto(SHARED);
  await tab.bringToFront();
  await panel.reload();

  const icon = panel.getByRole('button', { name: 'Manage access' });
  await expect(icon).toBeVisible();

  // Tab from the top of the page: the icon is the first control.
  await panel.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await panel.keyboard.press('Tab');
  await expect(icon).toBeFocused();
  const ring = await icon.evaluate((el) => {
    const style = getComputedStyle(el);

    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(ring.style).not.toBe('none');
  expect(ring.width).toBeGreaterThan(0);

  await panel.keyboard.press('Enter');
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  await expect(share.getByRole('heading', { name: 'People with access' })).toBeVisible();
  await expect(share.getByRole('button', { name: 'Back' })).toBeFocused();

  // Enter on Back.
  await panel.keyboard.press('Enter');
  await expect(share.getByRole('heading', { name: 'People with access' })).toHaveCount(0);
  await expect(share.getByRole('button', { name: /^Preview/ })).toBeVisible();
  await expect(icon).toBeFocused();

  // Open again and click Back with the mouse: focus still returns to the icon.
  await panel.keyboard.press('Enter');
  await share.getByRole('button', { name: 'Back' }).click();
  await expect(icon).toBeFocused();
});

test('the header fits at 380 px: the long account pill truncates, the icon is never cut off', async ({
  context,
  panel,
}) => {
  const tab = await context.newPage();
  await tab.goto(SHARED);
  await tab.bringToFront();
  await panel.setViewportSize({ width: 380, height: 700 });
  await panel.reload();

  const icon = panel.getByRole('button', { name: 'Manage access' });
  await expect(icon).toBeVisible();
  // A very long address, so the pill has to give way.
  await panel
    .locator('header .account .truncate')
    .evaluate((el) => (el.textContent = `${'a-very-long-local-part.'.repeat(6)}@example.com`));

  const boxes = await panel.locator('header').evaluate((header) => {
    const rect = (el: Element) => {
      const { left, right, top, bottom } = el.getBoundingClientRect();

      return { left, right, top, bottom };
    };
    const pillText = header.querySelector('.account .truncate')!;

    return {
      header: rect(header),
      logo: rect(header.querySelector('.logo')!),
      wordmark: rect(header.querySelector('.wordmark')!),
      pill: rect(header.querySelector('.account')!),
      icon: rect(header.querySelector('button[aria-label="Manage access"]')!),
      truncated: pillText.scrollWidth > pillText.clientWidth,
    };
  });

  // One line: every part overlaps the logo's vertical span.
  for (const part of [boxes.wordmark, boxes.pill, boxes.icon]) {
    expect(part.top).toBeLessThan(boxes.logo.bottom);
    expect(part.bottom).toBeGreaterThan(boxes.logo.top);
  }
  // Left to right, with nothing overlapping or past the header.
  expect(boxes.logo.right).toBeLessThanOrEqual(boxes.wordmark.left + 1);
  expect(boxes.wordmark.right).toBeLessThanOrEqual(boxes.pill.left + 1);
  expect(boxes.pill.right).toBeLessThanOrEqual(boxes.icon.left + 1);
  expect(boxes.icon.right).toBeLessThanOrEqual(boxes.header.right + 1);
  expect(boxes.truncated).toBe(true);
});

test('Manage access during a run that sends to this artifact shows the in-progress note', async ({
  context,
  panel,
}) => {
  const tab = await context.newPage();
  await tab.goto(EMPTY);
  await tab.bringToFront();
  await panel.reload();

  const share = panel.getByRole('tabpanel', { name: 'Share' });
  await share.getByLabel('List name').fill('Running team');
  await share.getByLabel('Email addresses').fill('ana@example.com\nbo@example.com\ncy@example.com');
  await share.getByRole('button', { name: /^Preview/ }).click();
  await share.getByRole('button', { name: 'Send 3 invitations' }).click();
  await answer(share, 'Send');
  await expect(share.getByText('Running', { exact: true })).toBeVisible();

  await panel.getByRole('button', { name: 'Manage access' }).click();
  await expect(share.getByRole('heading', { name: 'People with access' })).toBeVisible();
  await expect(
    share.getByRole('status').filter({ hasText: 'A share is in progress for this artifact.' }),
  ).toContainText('Refresh shows the latest.');
});

test('the icon has a tooltip and is as visible as the other header controls in dark mode', async ({
  context,
  panel,
}) => {
  const tab = await context.newPage();
  await tab.goto(SHARED);
  await tab.bringToFront();
  await panel.emulateMedia({ colorScheme: 'dark' });
  await panel.reload();

  const icon = panel.getByRole('button', { name: 'Manage access' });
  await expect(icon).toHaveAttribute('title', 'Manage access to this artifact');
  await icon.hover();

  // Its colour is the muted text colour the account pill uses, which is readable on the dark
  // background, and it is neither transparent nor the background itself.
  const colours = await panel.evaluate(() => {
    const color = (el: Element) => getComputedStyle(el).color;

    return {
      icon: color(document.querySelector('button[aria-label="Manage access"]')!),
      pill: color(document.querySelector('header .account')!),
      bg: getComputedStyle(document.body).backgroundColor,
    };
  });
  const parse = (c: string) => c.match(/[\d.]+/g)!.map(Number);
  const luminance = ([r = 0, g = 0, b = 0]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  expect(luminance(parse(colours.icon))).toBeGreaterThan(luminance(parse(colours.bg)) + 60);
  expect(Math.abs(luminance(parse(colours.icon)) - luminance(parse(colours.pill)))).toBeLessThan(60);
});

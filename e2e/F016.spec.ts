import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// F016: the side panel uses the width and height it is given, and nothing scrolls sideways.

const share = (page: Page) => page.getByRole('tabpanel', { name: 'Share' });
const lists = (page: Page) => page.getByRole('tabpanel', { name: /Lists/ });

/** True when the page or the scrolling body can be scrolled sideways. */
const scrollsSideways = (page: Page) =>
  page.evaluate(() => {
    const body = document.querySelector('.popup-body')!;

    return (
      document.documentElement.scrollWidth > document.documentElement.clientWidth ||
      body.scrollWidth > body.clientWidth
    );
  });

const artifact = (n: number) => `https://claude.ai/artifact/PanelArtifact${String(n).padStart(4, '0')}`;

for (const width of [320, 400, 600]) {
  test(`at ${width} px wide the content fills the width, nothing scrolls sideways and the header stays on one line`, async ({
    sidePanel,
  }) => {
    await sidePanel.setViewportSize({ width, height: 900 });
    await expect(sidePanel.getByRole('heading', { name: 'ArtiShare' })).toBeVisible();

    const widths = await sidePanel.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      popup: document.querySelector('.popup')!.getBoundingClientRect().width,
      body: document.body.getBoundingClientRect().width,
    }));
    expect(widths.popup).toBe(widths.viewport);
    expect(widths.body).toBe(widths.viewport);
    expect(await scrollsSideways(sidePanel)).toBe(false);

    // Logo, name, account pill and the icon buttons share one row.
    const header = sidePanel.locator('.header');
    const top = async (selector: string) =>
      (await header.locator(selector).first().boundingBox())!.y +
      (await header.locator(selector).first().boundingBox())!.height / 2;
    const logo = await top('.logo');
    for (const selector of ['.account', 'button.icon-btn']) {
      expect(Math.abs((await top(selector)) - logo)).toBeLessThan(4);
    }
    const box = (await header.boundingBox())!;
    expect(box.height).toBeLessThan(50);
    const right = await header.evaluate((el) =>
      Math.max(...[...el.querySelectorAll('button, .account')].map((c) => c.getBoundingClientRect().right)),
    );
    expect(right).toBeLessThanOrEqual(width);
  });
}

async function openNewList(page: Page) {
  await page.getByRole('tab', { name: /Lists/ }).click();
  await lists(page).getByRole('button', { name: 'New list' }).click();

  return lists(page).getByLabel('Email addresses').filter({ visible: true });
}

test('a 200-address list shows more lines in the side panel than in the popup, and Save is reachable', async ({
  panel,
  sidePanel,
}) => {
  const emails = Array.from({ length: 200 }, (_, i) => `person${i}@example.com`).join('\n');

  // Saved in the popup, then opened in the side panel.
  await openNewList(panel).then((box) => box.fill(emails));
  await lists(panel).getByLabel('List name').filter({ visible: true }).fill('Long list');
  await lists(panel).getByRole('button', { name: 'Save list' }).click();
  await expect(lists(panel).locator('summary', { hasText: 'Long list' })).toBeVisible();

  const heightIn = async (page: Page) => {
    await page.getByRole('tab', { name: /Lists/ }).click();
    await lists(page).locator('summary', { hasText: 'Long list' }).click();
    const box = lists(page).getByLabel('Email addresses').filter({ visible: true });
    await expect(box).toBeVisible();

    return (await box.boundingBox())!.height;
  };
  const popupHeight = await heightIn(panel);

  await sidePanel.setViewportSize({ width: 400, height: 900 });
  const panelHeight = await heightIn(sidePanel);
  expect(panelHeight).toBeGreaterThan(popupHeight * 2);
  // Taller than the popup's box but not past the window.
  expect(panelHeight).toBeLessThan(900);

  // An opened saved list's button reads "Save"; "Save list" is the new-list form's.
  const save = lists(sidePanel).getByRole('button', { name: 'Save', exact: true }).filter({ visible: true });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport();
  expect(await scrollsSideways(sidePanel)).toBe(false);
});

test('30 artifacts scroll with the page, each × stays clickable and long links are cut off with …', async ({
  sidePanel,
}) => {
  await sidePanel.setViewportSize({ width: 320, height: 700 });
  const box = share(sidePanel).getByRole('textbox', { name: /Artifacts/ });
  await box.fill(Array.from({ length: 30 }, (_, i) => artifact(i)).join('\n'));
  await box.press('Enter');
  const items = share(sidePanel).locator('.artifact-item');
  await expect(items).toHaveCount(30);

  // The rows are taller than the window, so the body scrolls, not the sides.
  const scroll = await sidePanel.evaluate(() => {
    const body = document.querySelector('.popup-body')!;

    return {
      scrollable: body.scrollHeight > body.clientHeight,
      sideways: body.scrollWidth > body.clientWidth,
    };
  });
  expect(scroll).toEqual({ scrollable: true, sideways: false });

  // The last row's × is reachable by scrolling and inside the panel's width.
  const last = items.last();
  await last.scrollIntoViewIfNeeded();
  const remove = last.getByRole('button', { name: `Remove ${artifact(29)}` });
  await expect(remove).toBeInViewport();
  const right = (await remove.boundingBox())!.x + (await remove.boundingBox())!.width;
  expect(right).toBeLessThanOrEqual(320);

  // At 320 px the link doesn't fit: it is cut off with an ellipsis rather than widening the row.
  const cut = await last.locator('.truncate').evaluate((el) => {
    const style = getComputedStyle(el);

    return {
      ellipsis: style.textOverflow === 'ellipsis' && style.overflow === 'hidden',
      clipped: el.scrollWidth > el.clientWidth,
    };
  });
  expect(cut).toEqual({ ellipsis: true, clipped: true });

  await remove.click();
  await expect(items).toHaveCount(29);
  expect(await scrollsSideways(sidePanel)).toBe(false);
});

test('a 120-character address does not widen the panel', async ({ sidePanel }) => {
  await sidePanel.setViewportSize({ width: 320, height: 700 });
  const long = `${'a'.repeat(100)}@example.com`;
  expect(long.length).toBeGreaterThanOrEqual(112);
  await sidePanel.getByRole('tab', { name: /Lists/ }).click();
  await lists(sidePanel).getByRole('button', { name: 'New list' }).click();
  const emails = lists(sidePanel).getByLabel('Email addresses').filter({ visible: true });
  await emails.fill(`${long}\nnot-an-address-${'b'.repeat(100)}`);
  await expect(lists(sidePanel).getByText('1 valid')).toBeVisible();
  expect(await scrollsSideways(sidePanel)).toBe(false);

  // The same in the Share tab: a long pasted text that isn't a link stays inside the panel.
  await sidePanel.getByRole('tab', { name: 'Share' }).click();
  await share(sidePanel)
    .getByRole('textbox', { name: /Artifacts/ })
    .fill('c'.repeat(120));
  expect(await scrollsSideways(sidePanel)).toBe(false);
  const inside = await sidePanel.evaluate(() =>
    [...document.querySelectorAll('.popup-body *')].every(
      (el) => el.getBoundingClientRect().right <= document.documentElement.clientWidth + 0.5,
    ),
  );
  expect(inside).toBe(true);
});

test('the popup is unchanged: 380 px wide and no taller than 600 px', async ({ panel }) => {
  await panel.setViewportSize({ width: 380, height: 900 });
  const size = await panel.evaluate(() => ({
    width: document.body.getBoundingClientRect().width,
    popup: document.querySelector('.popup')!.getBoundingClientRect().height,
    cap: getComputedStyle(document.querySelector('.popup')!).maxHeight,
  }));
  expect(size.width).toBe(380);
  expect(size.popup).toBeLessThanOrEqual(600);
  expect(size.cap).toBe('600px');

  // Many artifacts fill the popup to its cap and no further.
  const box = share(panel).getByRole('textbox', { name: /Artifacts/ });
  await box.fill(Array.from({ length: 30 }, (_, i) => artifact(i)).join('\n'));
  await box.press('Enter');
  await expect(share(panel).locator('.artifact-item')).toHaveCount(30);
  expect(await panel.locator('.popup').evaluate((el) => el.getBoundingClientRect().height)).toBe(600);
  expect(await scrollsSideways(panel)).toBe(false);
});

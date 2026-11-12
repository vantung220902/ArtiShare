import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// F002: the popup is 380 px wide and at most 600 px tall; the header and tabs stay at the top, only
// the content scrolls, the footer stays at the bottom, and there is no close button.

async function addList(panel: Page, name: string, emails: string[]) {
  await panel.getByRole('tab', { name: /Lists/ }).click();
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });
  await lists.getByRole('button', { name: 'New list' }).click();
  // Saved lists carry their own (closed) forms, so the new one is the last.
  await lists.getByLabel('List name').last().fill(name);
  await lists.getByLabel('Email addresses').last().fill(emails.join('\n'));
  await lists.getByRole('button', { name: 'Save list' }).click();
  await expect(lists.locator('details.list-card', { hasText: name })).toHaveCount(1);
}

const box = async (panel: Page, selector: string) => {
  const found = await panel.locator(selector).boundingBox();
  if (!found) throw new Error(`${selector} is not visible`);
  return found;
};

test('the popup is 380 px wide, at most 600 px tall, with a fixed header, tabs and footer around scrolling content', async ({
  panel,
}) => {
  for (const name of ['Alpha team', 'Beta team', 'Gamma team']) {
    const emails = Array.from(
      { length: 8 },
      (_, i) => `${name.split(' ')[0]!.toLowerCase()}${i}@example.com`,
    );
    await addList(panel, name, emails);
  }
  // Every list expanded.
  await panel
    .locator('details.list-card')
    .evaluateAll((all) => all.forEach((d) => d.setAttribute('open', '')));
  await expect(panel.locator('details.list-card[open]')).toHaveCount(3);

  const popup = await box(panel, '.popup');
  expect(popup.width).toBe(380);
  expect(popup.height).toBeLessThanOrEqual(600);
  // Content taller than the popup scrolls inside it instead of growing it.
  const body = panel.locator('.popup-body');
  const metrics = await body.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
  expect(metrics.scroll).toBeGreaterThan(metrics.client);
  expect(popup.height).toBe(600);

  const before = {
    header: await box(panel, 'header.header'),
    tabs: await box(panel, '[role=tablist]'),
    footer: await box(panel, '.footer'),
  };
  await body.evaluate((el) => (el.scrollTop = el.scrollHeight));
  expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  // Scrolling moved the content only: header, tabs and footer are where they were.
  expect(await box(panel, 'header.header')).toEqual(before.header);
  expect(await box(panel, '[role=tablist]')).toEqual(before.tabs);
  expect(await box(panel, '.footer')).toEqual(before.footer);

  // The header sits at the top, the footer at the bottom, both in view, with the version.
  expect(before.header.y).toBeLessThan(before.tabs.y);
  expect(before.footer.y + before.footer.height).toBeCloseTo(popup.y + popup.height, 0);
  await expect(panel.locator('.footer')).toBeInViewport();
  await expect(panel.locator('.footer')).toContainText(/^Version \d+\.\d+\.\d+/);
  await expect(panel.locator('header.header')).toBeInViewport();
  await expect(panel.getByRole('tab', { name: 'Share' })).toBeInViewport();
});

test('a short popup is only as tall as its content, with the footer right under it', async ({ panel }) => {
  // The Lists tab with no lists is short; the Share form alone is already taller than 600 px.
  await panel.getByRole('tab', { name: /Lists/ }).click();
  const popup = await box(panel, '.popup');
  expect(popup.width).toBe(380);
  expect(popup.height).toBeLessThan(600);
  const footer = await box(panel, '.footer');
  expect(footer.y + footer.height).toBeCloseTo(popup.y + popup.height, 0);
});

test('a long email address and a long artifact link wrap or truncate with no horizontal scroll', async ({
  panel,
}) => {
  const longEmail = `${'a'.repeat(110)}@example.com`;
  expect(longEmail.length).toBe(122);
  const longId = 'L'.repeat(110);
  const longLink = `https://claude.ai/artifact/${longId}`;

  const share = panel.getByRole('tabpanel', { name: 'Share' });
  await share.getByLabel('List name').fill('Long team');
  await share.getByLabel('Email addresses').fill(`${longEmail}\nana@example.com`);
  await share.getByLabel(/Artifacts/).fill(`${longLink}\nhttps://claude.ai/artifact/ShortArtifact00001`);
  await share.getByRole('button', { name: /^Preview/ }).click();
  await expect(share.getByText(longEmail).first()).toBeVisible();

  const overflow = () =>
    panel.evaluate(() => {
      const body = document.querySelector('.popup-body')!;
      return {
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        body: body.scrollWidth - body.clientWidth,
        popup: document.querySelector('.popup')!.getBoundingClientRect().width,
      };
    });
  expect(await overflow()).toEqual({ page: 0, body: 0, popup: 380 });

  // The same in the Lists tab, where the address sits in a saved list.
  await panel.getByRole('tab', { name: /Lists/ }).click();
  const lists = panel.getByRole('tabpanel', { name: /Lists/ });
  await lists.getByRole('button', { name: 'New list' }).click();
  await lists.getByLabel('List name').last().fill('N'.repeat(110));
  await lists.getByLabel('Email addresses').last().fill(longEmail);
  await lists.getByRole('button', { name: 'Save list' }).click();
  await lists
    .locator('details.list-card')
    .first()
    .evaluate((d) => d.setAttribute('open', ''));
  expect(await overflow()).toEqual({ page: 0, body: 0, popup: 380 });
});

test('there is no close button, and focus starts on nothing, then moves header, tabs, form', async ({
  panel,
}) => {
  await expect(panel.getByRole('button', { name: /close/i })).toHaveCount(0);
  await expect(panel.getByRole('heading', { name: 'ArtiShare' })).toBeVisible();

  // Not trapped in a text field when the popup opens.
  const active = () => panel.evaluate(() => document.activeElement?.tagName.toLowerCase());
  expect(await active()).toBe('body');

  // Tab goes to the tabs first (the header has nothing to focus), then into the form.
  await panel.keyboard.press('Tab');
  await expect(panel.getByRole('tab', { name: 'Share' })).toBeFocused();
  await panel.keyboard.press('Tab');
  const next = await panel.evaluate(() => {
    const el = document.activeElement!;
    return { inBody: !!el.closest('.popup-body'), id: el.id };
  });
  expect(next.inBody).toBe(true);
});

// The tab-based tests above can't see Chrome's own popup sizing, so measure the real action popup
// through the browser's CDP target list.
test('the real action popup is 380 px wide, at most 600 px tall, with no horizontal scroll', async ({
  context,
  panel,
}) => {
  const browser = context.browser();
  expect(browser, 'a browser handle is needed to reach the popup target').not.toBeNull();

  // Saved lists make the content tall enough to scroll.
  for (const name of ['Alpha team', 'Beta team', 'Gamma team']) {
    const emails = Array.from({ length: 8 }, (_, i) => `${name[0]!.toLowerCase()}${i}@example.com`);
    await addList(panel, name, emails);
  }
  const worker = context.serviceWorkers()[0]!;
  // The panel tab is popup.html too; move it off so the only popup.html target is the real popup.
  await panel.goto('about:blank');
  await panel.bringToFront();
  await worker.evaluate(() => chrome.action.openPopup());

  const cdp = await browser!.newBrowserCDPSession();
  let targetId = '';
  await expect
    .poll(async () => {
      const { targetInfos } = await cdp.send('Target.getTargets');
      targetId = targetInfos.find((t) => t.url.endsWith('/popup.html') && t.type === 'page')?.targetId ?? '';
      return targetId;
    })
    .not.toBe('');

  // Playwright's CDPSession has no per-target sessions, so talk to the popup through the browser.
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: false });
  let nextId = 0;
  const pending = new Map<number, (value: unknown) => void>();
  cdp.on('Target.receivedMessageFromTarget', (event) => {
    const message = JSON.parse(event.message) as { id?: number; result?: unknown };
    if (message.id !== undefined) pending.get(message.id)?.(message.result);
  });
  const evaluate = (expression: string) =>
    new Promise<unknown>((resolve) => {
      const id = ++nextId;
      pending.set(id, (result) => resolve((result as { result: { value: unknown } }).result.value));
      void cdp.send('Target.sendMessageToTarget', {
        sessionId,
        message: JSON.stringify({
          id,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true },
        }),
      });
    });

  await expect.poll(() => evaluate(`!!document.querySelector('.footer')`)).toBe(true);
  const size = await evaluate(`(() => {
    const root = document.documentElement;
    const rect = (s) => document.querySelector(s).getBoundingClientRect();
    return {
      innerWidth,
      innerHeight,
      overflowX: root.scrollWidth - root.clientWidth,
      popupWidth: rect('.popup').width,
      popupHeight: rect('.popup').height,
      headerTop: rect('.popup-top').top,
      footerBottom: rect('.footer').bottom,
    };
  })()`);
  expect(size).toMatchObject({ overflowX: 0, popupWidth: 380, headerTop: 0 });
  const measured = size as {
    innerWidth: number;
    innerHeight: number;
    popupHeight: number;
    footerBottom: number;
  };
  expect(measured.popupHeight).toBeLessThanOrEqual(600);
  // Chrome reserves a scrollbar's width (15 px) when the screen gives the popup less than the 600 px
  // of content, as in this headless window, so the window may be up to 15 px wider than the page.
  expect(measured.innerWidth).toBeGreaterThanOrEqual(380);
  expect(measured.innerWidth).toBeLessThanOrEqual(395);
  // Even in a window shorter than 600 px, the footer stays in view.
  expect(measured.footerBottom).toBeLessThanOrEqual(measured.innerHeight);
});

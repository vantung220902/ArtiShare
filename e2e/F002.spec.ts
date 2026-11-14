import { expect, test } from './fixtures';

// F002: removing an artifact is one click, can be undone for a few seconds, and works from the keyboard.

const ONE = 'https://claude.ai/artifact/ExampleArtifactOne01';
const TWO = 'https://claude.ai/artifact/ExampleArtifactTwo02';
const THREE = 'https://claude.ai/artifact/ExampleArtifactThree3';

test('removing is one click with an Undo, and works from the keyboard', async ({ context, panel }) => {
  // Nothing may reach claude.ai.
  await context.route(/^https:\/\/claude\.ai\//, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>page</title>' }),
  );

  await panel.getByRole('tab', { name: 'Share' }).click();
  const share = panel.getByRole('tabpanel', { name: 'Share' });
  const box = share.getByRole('textbox', { name: /Artifacts/ });
  const rows = share.locator('.artifact-item');
  const count = share.locator('label[for="artifacts"] .count');
  const undoBar = share.locator('.undo-bar');
  const remove = (url: string) => share.getByRole('button', { name: `Remove ${url}`, exact: true });
  const focusedLabel = () => panel.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null);

  const addAll = async () => {
    await box.fill(`${ONE}\n${TWO}\n${THREE}\n`);
    await expect(rows).toHaveText([ONE, TWO, THREE]);
  };
  await addAll();
  await expect(count).toHaveText('3');
  await expect(undoBar).toHaveCount(0);

  // 1. One click takes the second row out at once, with a message to undo it.
  await remove(TWO).click();
  await expect(rows).toHaveText([ONE, THREE]);
  await expect(count).toHaveText('2');
  await expect(undoBar).toContainText(`Removed ${TWO}`);
  await expect(undoBar).toContainText('Undo');

  // 2. Undo puts it back in its old place.
  await undoBar.getByRole('button', { name: 'Undo' }).click();
  await expect(rows).toHaveText([ONE, TWO, THREE]);
  await expect(count).toHaveText('3');
  await expect(undoBar).toHaveCount(0);

  // Without Undo the message goes away by itself after about 5 seconds, and not much before.
  await remove(THREE).click();
  await expect(undoBar).toBeVisible();
  const shownAt = Date.now();
  await panel.waitForTimeout(3000);
  await expect(undoBar).toBeVisible();
  await expect(undoBar).toHaveCount(0, { timeout: 5000 });
  const shownFor = Date.now() - shownAt;
  expect(shownFor).toBeGreaterThanOrEqual(4500);
  expect(shownFor).toBeLessThan(6500);
  await expect(rows).toHaveText([ONE, TWO]);

  // Undoing the very first row puts it back first; removing another replaces the message.
  await box.fill(THREE);
  await box.press('Enter');
  await expect(rows).toHaveText([ONE, TWO, THREE]);
  await remove(ONE).click();
  await remove(TWO).click();
  await expect(undoBar).toContainText(`Removed ${TWO}`);
  await expect(undoBar).not.toContainText(ONE);
  await undoBar.getByRole('button', { name: 'Undo' }).click();
  await expect(rows).toHaveText([TWO, THREE]);
  await box.fill(`${ONE}\n`);
  await expect(rows).toHaveText([TWO, THREE, ONE]);

  // 3. From the keyboard: Tab reaches each × in order, with a visible focus ring.
  await share.getByRole('button', { name: 'Current tab' }).focus();
  await panel.keyboard.press('Tab');
  expect(await focusedLabel()).toBe(`Remove ${TWO}`);
  const ring = await panel.evaluate(() => {
    const style = getComputedStyle(document.activeElement!);
    return {
      matches: document.activeElement!.matches(':focus-visible'),
      style: style.outlineStyle,
      width: style.outlineWidth,
    };
  });
  expect(ring).toEqual({ matches: true, style: 'solid', width: '2px' });
  await panel.keyboard.press('Tab');
  expect(await focusedLabel()).toBe(`Remove ${THREE}`);
  await panel.keyboard.press('Tab');
  expect(await focusedLabel()).toBe(`Remove ${ONE}`);
  // Back to the first, and Enter takes it out: focus moves to the × of the row that is now there.
  await panel.keyboard.press('Shift+Tab');
  await panel.keyboard.press('Shift+Tab');
  expect(await focusedLabel()).toBe(`Remove ${TWO}`);
  await panel.keyboard.press('Enter');
  await expect(rows).toHaveText([THREE, ONE]);
  expect(await focusedLabel()).toBe(`Remove ${THREE}`);

  // Removing the last row of the list moves focus to the one before it, not to the page.
  await panel.keyboard.press('Tab');
  expect(await focusedLabel()).toBe(`Remove ${ONE}`);
  await panel.keyboard.press('Enter');
  await expect(rows).toHaveText([THREE]);
  expect(await focusedLabel()).toBe(`Remove ${THREE}`);

  // Undo from the keyboard puts the row back and focuses its ×.
  await panel.keyboard.press('Tab');
  await expect(box).toBeFocused();
  await panel.keyboard.press('Tab');
  await expect(undoBar.getByRole('button', { name: 'Undo' })).toBeFocused();
  await panel.keyboard.press('Enter');
  await expect(rows).toHaveText([THREE, ONE]);
  expect(await focusedLabel()).toBe(`Remove ${ONE}`);

  // 4. Removing the last row with the keyboard moves focus to the box and shows the empty state.
  await remove(THREE).focus();
  await panel.keyboard.press('Enter');
  await panel.keyboard.press('Enter');
  await expect(rows).toHaveCount(0);
  await expect(box).toBeFocused();
  await expect(
    share.getByText('No artifacts yet. Open one and click + Current tab, or paste links below.'),
  ).toBeVisible();
  await expect(count).toHaveCount(0);

  // A click with the mouse doesn't take focus to the box.
  await undoBar.getByRole('button', { name: 'Undo' }).click();
  await expect(rows).toHaveText([ONE]);
  await remove(ONE).click();
  await expect(rows).toHaveCount(0);
  await expect(box).not.toBeFocused();

  // 5. A removal is saved with the rest of the draft: closing and reopening keeps it gone.
  await undoBar.getByRole('button', { name: 'Undo' }).click();
  await box.fill(`${TWO}\n${THREE}\n`);
  await expect(rows).toHaveText([ONE, TWO, THREE]);
  await remove(TWO).click();
  await expect(rows).toHaveText([ONE, THREE]);
  await panel.reload();
  await panel.getByRole('tab', { name: 'Share' }).click();
  await expect(rows).toHaveText([ONE, THREE]);
  await expect(count).toHaveText('2');
  // The message belongs to the closed popup: it isn't there to undo any more.
  await expect(undoBar).toHaveCount(0);
});

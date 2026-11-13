import { expect, type BrowserContext } from '@playwright/test';

/**
 * Opens the real action popup (not a tab) over whichever tab is active, and returns a function that
 * evaluates an expression inside it. The popup is only reachable through the browser's CDP target
 * list, and Playwright's CDPSession has no per-target sessions, so it is driven with
 * `Target.sendMessageToTarget`. Callers must make sure no other tab has the popup.html URL.
 */
export async function openRealPopup(
  context: BrowserContext,
): Promise<(expression: string) => Promise<unknown>> {
  const browser = context.browser();
  expect(browser, 'a browser handle is needed to reach the popup target').not.toBeNull();
  const worker = context.serviceWorkers()[0]!;
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

  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: false });
  let nextId = 0;
  const pending = new Map<number, (value: unknown) => void>();
  cdp.on('Target.receivedMessageFromTarget', (event) => {
    const message = JSON.parse(event.message) as { id?: number; result?: unknown };
    if (message.id !== undefined) pending.get(message.id)?.(message.result);
  });

  return (expression) =>
    new Promise<unknown>((resolve) => {
      const id = ++nextId;
      pending.set(id, (result) => resolve((result as { result: { value: unknown } }).result.value));
      void cdp.send('Target.sendMessageToTarget', {
        sessionId,
        message: JSON.stringify({
          id,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true, awaitPromise: true },
        }),
      });
    });
}

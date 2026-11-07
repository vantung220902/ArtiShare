import { applyConfigChange, type Config, type ConfigChange } from '../core/config';

/** Serializes config actions from every side panel through the background worker. */
export function createConfigController(load: () => Promise<Config>, save: (config: Config) => Promise<void>) {
  let current: Config | undefined;
  let queue: Promise<void> = Promise.resolve();

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = queue.then(work);
    queue = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  }

  return {
    get: () =>
      enqueue(async () => {
        current ??= await load();

        return current;
      }),
    change: (change: ConfigChange) =>
      enqueue(async () => {
        const base = current ?? (await load());
        const next = applyConfigChange(base, change);
        await save(next);
        current = next;

        return next;
      }),
  };
}

import { applyConfigChange, type Config, type ConfigChange } from '../core/config';

/** Serializes config actions from every open popup through the background worker. */
export function createConfigController(load: () => Promise<Config>, save: (config: Config) => Promise<void>) {
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
    get: () => enqueue(load),
    change: (change: ConfigChange) =>
      enqueue(async () => {
        const base = await load();
        const next = applyConfigChange(base, change);
        await save(next);

        return next;
      }),
  };
}

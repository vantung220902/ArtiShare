import { useCallback, useEffect, useState } from 'react';
import { loadStoredConfig, type Config, type ConfigChange } from '../core/config';
import { send } from '../lib/messages';
import { loadRun, type RunState, watchConfig, watchRun } from '../lib/storage';

export function useConfig(): [Config | null, (change: ConfigChange) => Promise<Config>, string] {
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    let updates = 0;
    const unwatch = watchConfig((value) => {
      updates++;
      if (!mounted) return;
      try {
        setConfig(loadStoredConfig(value));
        setError('');
      } catch (err) {
        setConfig(null);
        setError(err instanceof Error ? err.message : String(err));
      }
    });
    const initial = updates;
    void send('config-get', {}).then(
      (value) => {
        if (mounted && updates === initial) setConfig(value);
      },
      (err: Error) => {
        if (mounted) setError(err.message);
      },
    );

    return () => {
      mounted = false;
      unwatch();
    };
  }, []);
  const update = useCallback(async (change: ConfigChange) => {
    const next = await send('config-change', { change });
    setError('');

    return next;
  }, []);

  return [config, update, error];
}

export function useRun(): [RunState | null | undefined, string] {
  const [run, setRun] = useState<RunState | null | undefined>(undefined);
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    let updates = 0;
    const unwatch = watchRun((value) => {
      updates++;
      if (mounted) {
        setRun(value);
        setError('');
      }
    });
    const initial = updates;
    void loadRun().then(
      (value) => {
        if (mounted && updates === initial) setRun(value);
      },
      (err: Error) => {
        if (mounted && updates === initial) setError(err.message);
      },
    );

    return () => {
      mounted = false;
      unwatch();
    };
  }, []);

  return [run, error];
}

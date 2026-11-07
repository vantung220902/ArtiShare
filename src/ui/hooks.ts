import { useCallback, useEffect, useState } from 'react';
import type { Config } from '../core/config';
import { loadConfig, loadRun, type RunState, saveConfig, watchConfig, watchRun } from '../lib/storage';

export function useConfig(): [Config | null, (next: Config) => Promise<void>] {
  const [config, setConfig] = useState<Config | null>(null);
  useEffect(() => {
    void loadConfig().then(setConfig);
    return watchConfig(() => void loadConfig().then(setConfig));
  }, []);
  const update = useCallback(async (next: Config) => {
    await saveConfig(next);
    setConfig(next);
  }, []);
  return [config, update];
}

export function useRun(): RunState | null | undefined {
  const [run, setRun] = useState<RunState | null | undefined>(undefined);
  useEffect(() => {
    void loadRun().then(setRun);
    return watchRun(setRun);
  }, []);
  return run;
}

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

export function readFile(file: File): Promise<string> {
  return file.text();
}

export function download(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** Opens a file picker and resolves with the chosen file's text, or null if cancelled. */
export function pickFile(accept: string): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? { name: file.name, text: await readFile(file) } : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

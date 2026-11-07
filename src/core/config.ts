import { dump, load } from 'js-yaml';
import { z } from 'zod';
import { parseArtifactList } from './artifactUrl';
import { isValidEmail, mergeEmails, normalizeEmail } from './emails';
import type { AccessLevel, ArtifactRef } from './types';

const AccessSchema = z.enum(['view', 'comment', 'edit']);

const JobSchema = z.object({
  name: z.string().trim().min(1, 'job name is required'),
  artifacts: z.array(z.string()).min(1, 'a job needs at least one artifact'),
  lists: z.array(z.string()).default([]),
  emails: z.array(z.string()).default([]),
  access: AccessSchema.optional(),
});

const DefaultsSchema = z.object({
  access: AccessSchema.default('view'),
  /** Pause between invite requests, in milliseconds. */
  delayMs: z.number().int().min(0).max(60_000).default(800),
  /** Email domains that belong to your claude.ai organization (internal invites don't count toward the 50 cap). */
  orgDomains: z.array(z.string()).default([]),
});

export const ConfigSchema = z.object({
  version: z.literal(1),
  defaults: DefaultsSchema.default({ access: 'view', delayMs: 800, orgDomains: [] }),
  lists: z.record(z.string().trim().min(1), z.array(z.string())).default({}),
  jobs: z.array(JobSchema).default([]),
});

export type Config = z.infer<typeof ConfigSchema>;
export type Job = z.infer<typeof JobSchema>;

export const EMPTY_CONFIG: Config = {
  version: 1,
  defaults: { access: 'view', delayMs: 800, orgDomains: [] },
  lists: {},
  jobs: [],
};

export type ParseConfigResult = { ok: true; config: Config; warnings: string[] } | { ok: false; errors: string[] };

/** Parses a YAML or JSON config (JSON is valid YAML), validates it and normalizes every address. */
export function parseConfig(text: string): ParseConfigResult {
  let data: unknown;
  try {
    data = load(text);
  } catch (err) {
    return { ok: false, errors: [`Not valid YAML/JSON: ${(err as Error).message.split('\n')[0]}`] };
  }
  if (data === null || data === undefined) return { ok: false, errors: ['The file is empty.'] };

  const result = ConfigSchema.safeParse(data);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((i) => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`),
    };
  }

  const config = result.data;
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [name, emails] of Object.entries(config.lists)) {
    const bad = emails.filter((e) => !isValidEmail(normalizeEmail(e)));
    if (bad.length) errors.push(`lists.${name}: invalid email(s): ${bad.join(', ')}`);
    config.lists[name] = mergeEmails(emails);
  }

  config.jobs.forEach((job, i) => {
    const where = `jobs[${i}] "${job.name}"`;
    for (const list of job.lists) {
      if (!(list in config.lists)) errors.push(`${where}: unknown list "${list}"`);
    }
    const bad = job.emails.filter((e) => !isValidEmail(normalizeEmail(e)));
    if (bad.length) errors.push(`${where}: invalid email(s): ${bad.join(', ')}`);
    job.emails = mergeEmails(job.emails);
    const { invalid } = parseArtifactList(job.artifacts);
    if (invalid.length) errors.push(`${where}: not a claude.ai artifact link: ${invalid.join(', ')}`);
    if (!job.lists.length && !job.emails.length) warnings.push(`${where}: has no lists or emails`);
  });

  const names = config.jobs.map((j) => j.name);
  const dupNames = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupNames.length) errors.push(`duplicate job name(s): ${[...new Set(dupNames)].join(', ')}`);

  config.defaults.orgDomains = [...new Set(config.defaults.orgDomains.map((d) => d.trim().toLowerCase().replace(/^@/, '')))].filter(Boolean);

  return errors.length ? { ok: false, errors } : { ok: true, config, warnings };
}

export function serializeConfig(config: Config, format: 'yaml' | 'json'): string {
  return format === 'json' ? `${JSON.stringify(config, null, 2)}\n` : dump(config, { lineWidth: 120 });
}

export interface ResolvedJob {
  name: string;
  artifacts: ArtifactRef[];
  emails: string[];
  access: AccessLevel;
}

/** Expands a job's lists into one de-duplicated address list and parses its artifact links. */
export function resolveJob(config: Config, job: Job): ResolvedJob {
  const fromLists = job.lists.map((name) => config.lists[name] ?? []);
  return {
    name: job.name,
    artifacts: parseArtifactList(job.artifacts).refs,
    emails: mergeEmails(...fromLists, job.emails),
    access: job.access ?? config.defaults.access,
  };
}

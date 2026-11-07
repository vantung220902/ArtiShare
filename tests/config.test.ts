import { describe, expect, it } from 'vitest';
import { EMPTY_CONFIG, parseConfig, resolveJob, serializeConfig } from '../src/core/config';

const A = 'https://claude.ai/artifact/SxyBbcL8qbzwA8FD63WrkK';
const B = 'https://claude.ai/artifact/8yG35MD9DnNsBsgu5yATZC';

const YAML = `
version: 1
defaults:
  access: view
  delayMs: 500
  orgDomains: ["@NimbleHQ.co"]
lists:
  acme: [Alice@acme.com, bob@acme.com, alice@acme.com]
  qa: [qa1@nimblehq.co]
jobs:
  - name: Acme review
    artifacts: [${A}, ${B}]
    lists: [acme, qa]
    emails: [carol@acme.com, BOB@acme.com]
    access: comment
`;

describe('parseConfig', () => {
  it('parses YAML, normalizes addresses and domains', () => {
    const r = parseConfig(YAML);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.lists.acme).toEqual(['alice@acme.com', 'bob@acme.com']);
    expect(r.config.defaults).toEqual({ access: 'view', delayMs: 500, orgDomains: ['nimblehq.co'] });
  });

  it('parses JSON and fills defaults', () => {
    const r = parseConfig(JSON.stringify({ version: 1, lists: { x: ['a@x.io'] } }));
    expect(r.ok && r.config).toEqual({ ...EMPTY_CONFIG, lists: { x: ['a@x.io'] } });
  });

  it('reports schema errors with their path', () => {
    const r = parseConfig('version: 2\ndefaults: { access: owner }');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.startsWith('version'))).toBe(true);
    expect(r.errors.some((e) => e.startsWith('defaults.access'))).toBe(true);
  });

  it('reports unknown lists, bad emails, bad links and duplicate job names', () => {
    const r = parseConfig(`
version: 1
lists: { a: [ok@x.io, nope] }
jobs:
  - { name: J, artifacts: ["https://example.com/x"], lists: [missing], emails: ["bad@"] }
  - { name: J, artifacts: ["${A}"], emails: [x@y.io] }
`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual(
      expect.arrayContaining([
        'lists.a: invalid email(s): nope',
        'jobs[0] "J": unknown list "missing"',
        'jobs[0] "J": invalid email(s): bad@',
        'jobs[0] "J": not a claude.ai artifact link: https://example.com/x',
        'duplicate job name(s): J',
      ]),
    );
  });

  it('treats names inherited from Object.prototype as unknown lists', () => {
    const r = parseConfig(`
version: 1
lists: { a: [ok@x.io] }
jobs:
  - { name: J, artifacts: ["${A}"], lists: [a, toString, constructor, __proto__] }
`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual([
      'jobs[0] "J": unknown list "toString"',
      'jobs[0] "J": unknown list "constructor"',
      'jobs[0] "J": unknown list "__proto__"',
    ]);
  });

  it('drops a list named __proto__ without touching any prototype', () => {
    const r = parseConfig('version: 1\nlists:\n  __proto__: [a@x.io]\n  b: [b@x.io]\n');
    if (!r.ok) throw new Error('fixture invalid');
    expect(Object.keys(r.config.lists)).toEqual(['b']);
    expect(Object.getPrototypeOf(r.config.lists)).toBe(Object.prototype);
    expect(Object.prototype).not.toHaveProperty('a@x.io');
  });

  it('rejects empty and malformed files', () => {
    expect(parseConfig('').ok).toBe(false);
    expect(parseConfig('version: [1').ok).toBe(false);
  });

  it('round-trips through YAML and JSON', () => {
    const r = parseConfig(YAML);
    if (!r.ok) throw new Error('fixture invalid');
    for (const format of ['yaml', 'json'] as const) {
      const again = parseConfig(serializeConfig(r.config, format));
      expect(again.ok && again.config).toEqual(r.config);
    }
  });
});

describe('resolveJob', () => {
  it('expands lists, merges extra emails and applies the job access level', () => {
    const r = parseConfig(YAML);
    if (!r.ok) throw new Error('fixture invalid');
    const job = resolveJob(r.config, r.config.jobs[0]!);
    expect(job.artifacts.map((a) => a.url)).toEqual([A, B]);
    expect(job.emails).toEqual(['alice@acme.com', 'bob@acme.com', 'qa1@nimblehq.co', 'carol@acme.com']);
    expect(job.access).toBe('comment');
  });

  it('ignores list names that are not the config’s own lists', () => {
    const r = parseConfig(`version: 1\nlists: { a: [a@x.io] }\njobs: [{ name: J, artifacts: ["${A}"], lists: [a] }]`);
    if (!r.ok) throw new Error('fixture invalid');
    const job = { ...r.config.jobs[0]!, lists: ['a', 'toString', 'constructor'] };
    expect(resolveJob(r.config, job).emails).toEqual(['a@x.io']);
  });

  it('falls back to the default access level', () => {
    const r = parseConfig(`version: 1\ndefaults: { access: edit }\njobs: [{ name: J, artifacts: ["${A}"], emails: [a@x.io] }]`);
    if (!r.ok) throw new Error('fixture invalid');
    expect(resolveJob(r.config, r.config.jobs[0]!).access).toBe('edit');
  });
});

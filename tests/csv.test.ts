import { describe, expect, it } from 'vitest';
import { parseArtifactRef } from '../src/core/artifactUrl';
import { runReportCsv, toCsv } from '../src/core/csv';

describe('toCsv', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(toCsv([['a,b', 'say "hi"', 'x\ny']])).toBe('"a,b","say ""hi""","x\ny"\n');
  });

  it('neutralizes spreadsheet formulas', () => {
    expect(toCsv([['=HYPERLINK("x")', '+1', '@cmd']])).toBe(`"'=HYPERLINK(""x"")",'+1,'@cmd\n`);
  });
});

describe('runReportCsv', () => {
  it('writes one row per item with a header', () => {
    const artifact = parseArtifactRef('https://claude.ai/artifact/SxyBbcL8qbzwA8FD63WrkK')!;
    const csv = runReportCsv([
      { artifact, email: 'a@x.io', access: 'comment', status: 'invited', attempts: 1, finishedAt: Date.UTC(2026, 10, 7) },
      { artifact, email: 'b@x.io', access: 'view', status: 'failed', error: 'rejected, sorry', attempts: 1 },
    ]);
    expect(csv.split('\n')).toEqual([
      'artifact,email,access,status,error,attempts,finished_at',
      `${artifact.url},a@x.io,Commenter,invited,,1,2026-11-07T00:00:00.000Z`,
      `${artifact.url},b@x.io,Can view,failed,"rejected, sorry",1,`,
      '',
    ]);
  });
});

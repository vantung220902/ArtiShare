import { describe, expect, it } from 'vitest';
import type { EmailList } from '../src/core/config';
import { byName } from '../src/core/lists';

const list = (name: string): EmailList => ({ id: name, name, emails: [], access: 'view' });

describe('byName', () => {
  it('sorts the way the Lists tab does, without touching the input', () => {
    const input = [list('Team'), list('design'), list('Archive')];

    expect(byName(input).map((l) => l.name)).toEqual(['Archive', 'design', 'Team']);
    expect(input.map((l) => l.name)).toEqual(['Team', 'design', 'Archive']);
  });
});

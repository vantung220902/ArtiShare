import { describe, expect, it } from 'vitest';
import type { EmailList } from '../src/core/config';
import { inboxKey } from '../src/core/emails';
import { listNamesByInbox, membershipNote } from '../src/core/membership';

const list = (name: string, emails: string[]): EmailList => ({
  id: name,
  name,
  emails,
  access: 'view',
});

describe('listNamesByInbox', () => {
  it('names every list holding an inbox, in the order of the lists', () => {
    const names = listNamesByInbox([
      list('Team', ['a@example.com', 'b@example.com']),
      list('Reviewers', ['b@example.com']),
    ]);

    expect(names.get('a@example.com')).toEqual(['Team']);
    expect(names.get('b@example.com')).toEqual(['Team', 'Reviewers']);
    expect(names.get('c@example.com')).toBeUndefined();
  });

  it('ignores case, and matches a Gmail +tag alias to the same inbox but not a dotted one', () => {
    const names = listNamesByInbox([
      list('Team', ['Viewer@Example.com']),
      list('Friends', ['janedoe@gmail.com']),
    ]);

    expect(names.get(inboxKey('viewer@example.com'))).toEqual(['Team']);
    expect(names.get(inboxKey('janedoe+work@gmail.com'))).toEqual(['Friends']);
    // claude.ai keeps separate invitations for dotted Gmail addresses (see inboxKey).
    expect(names.get(inboxKey('jane.doe@gmail.com'))).toBeUndefined();
  });

  it('names a list once when it holds the same inbox twice', () => {
    const names = listNamesByInbox([list('Team', ['a@gmail.com', 'a+x@gmail.com'])]);

    expect(names.get('a@gmail.com')).toEqual(['Team']);
  });
});

describe('membershipNote', () => {
  it('says Not in a list, or names up to two lists, then counts the rest', () => {
    expect(membershipNote([])).toBe('Not in a list');
    expect(membershipNote(['Team'])).toBe('In Team');
    expect(membershipNote(['Team', 'Reviewers'])).toBe('In Team, Reviewers');
    expect(membershipNote(['Team', 'Reviewers', 'Ops'])).toBe('In Team, Reviewers +1');
    expect(membershipNote(['A', 'B', 'C', 'D'])).toBe('In A, B +2');
  });
});

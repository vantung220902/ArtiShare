import { useState } from 'react';
import {
  fieldEntries,
  fieldHolds,
  isPicked,
  overLimit,
  togglePick,
  unfinishedEntries,
} from '../../core/inviteField';
import { inboxKey } from '../../core/emails';
import { byName } from '../../core/lists';
import { capResults, searchLists, type CappedResult } from '../../core/search';
import { fillInviteField, readInviteField, useFieldText } from './inviteField';
import { CopyFallback, FILL_FAILED } from './CopyFallback';
import { useLists } from './lists';

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;
const EMPTY_LIST_TIP = 'This list has no addresses.';
const addresses = (n: number) => `${n} ${n === 1 ? 'address' : 'addresses'}`;

// ArtiShare's own run skips the people over the limit, but claude.ai's Invite has no such step, so
// the person is told while they can still take some out of the field.
const OVER_LIMIT_NOTE =
  'claude.ai lets at most 50 people outside your organization have access to an artifact, pending invitations included. Some of these may not be invited.';

const TAKE_OUT_FAILED = "Couldn't take the addresses out of claude.ai's field. Remove them there yourself.";

/** `Team's`, `Team's and Design's`, `A's, B's and C's`: whose permission claude.ai's Invite doesn't carry over. */
const possessive = (names: readonly string[]) => {
  const own = names.map((name) => `${name}'s`);

  return own.length > 1 ? `${own.slice(0, -1).join(', ')} and ${own.at(-1)}` : own[0];
};

/** Why claude.ai shows no Invite option, naming what to fix. */
const unfinishedNote = (entries: readonly string[]) =>
  `claude.ai offers Invite only when every entry is a full address. Finish or remove ${entries
    .map((entry) => `"${entry}"`)
    .join(', ')}.`;

/** What the live region says after a click. claude.ai's own option names what it will invite. */
function changedMessage(verb: 'added' | 'removed', changed: number, text: string) {
  const entries = fieldEntries(text);
  const done = `${addresses(changed)} ${verb}.`;
  const unfinished = unfinishedEntries(text);
  if (unfinished.length > 0) return `${done} ${unfinishedNote(unfinished)}`;
  if (entries.length === 0) return done;
  const what = entries.length === 1 ? entries[0] : `${entries.length} people`;

  return `${done} Choose Invite ${what} to invite them.`;
}

interface SearchResultsProps {
  found: CappedResult;
  query: string;
  fieldText: string;
  onList: (id: string) => void;
  onPerson: (email: string) => void;
}

/** What the search found, each row picked or not the way a chip is: by what the field holds. */
function SearchResults({ found, query, fieldText, onList, onPerson }: SearchResultsProps) {
  if (found.lists.length === 0 && found.people.length === 0) {
    return <p className="note">No lists or people match &quot;{query}&quot;.</p>;
  }

  return (
    <div className="results">
      {found.lists.map((list) => (
        <button
          key={list.id}
          type="button"
          className="result"
          aria-pressed={isPicked(list.emails, fieldText)}
          aria-disabled={list.emails.length === 0 || undefined}
          title={list.emails.length === 0 ? EMPTY_LIST_TIP : undefined}
          onClick={() => list.emails.length > 0 && onList(list.id)}
        >
          <span className="result-name">{list.name}</span> · <span>{people(list.emails.length)}</span>
        </button>
      ))}
      {found.people.map((person) => (
        <button
          key={inboxKey(person.email)}
          type="button"
          className="result"
          aria-pressed={isPicked([person.email], fieldText)}
          onClick={() => onPerson(person.email)}
        >
          <span className="result-name">{person.email}</span>
          <span className="result-lists">In {person.inLists.join(', ')}</span>
        </button>
      ))}
      {found.more > 0 && <p className="note more">and {found.more} more. Keep typing to narrow it down.</p>}
    </div>
  );
}

/** The ArtiShare lists box drawn under claude.ai's invite field. `entry` is claude.ai's `[data-share-entry]`. */
export function ShareListsBox({ entry }: { entry: Element }) {
  const { state, retry, checkAlive } = useLists();
  const [fieldText, refresh] = useFieldText(entry);
  const [announcement, setAnnouncement] = useState('');
  // The note about an unfinished entry belongs to a click of ours, so it isn't shown while the
  // person is just typing their first address.
  const [clicked, setClicked] = useState(false);
  const [query, setQuery] = useState('');
  // What claude.ai's field wouldn't take, kept until the field holds it (the person pasted it in).
  const [failure, setFailure] = useState<{ text: string; added: boolean } | null>(null);
  // Until the lists are read the box stays empty: claude.ai's own dialog is what the person came
  // for, and a box that says nothing is better than one that says something wrong.
  if (state.status === 'loading') return null;
  if (state.status === 'problem') {
    return (
      <fieldset className="box" aria-label="ArtiShare lists">
        <h3 className="heading">ArtiShare lists</h3>
        <p className="note warning" role="alert">
          {state.message}
        </p>
        {/* After an update only a reload of the page helps, so there is nothing to retry. */}
        {state.problem !== 'updated' && (
          <button type="button" className="retry" onClick={retry}>
            Retry
          </button>
        )}
      </fieldset>
    );
  }
  const { config } = state;
  const lists = byName(config.lists);
  // With no lists there is no search field to clear, so drop the text now: otherwise a list made
  // later in ArtiShare would come back behind a search for something that is gone.
  if (lists.length === 0 && query !== '') setQuery('');
  const unfinished = clicked ? unfinishedEntries(fieldText) : [];
  // Which list is picked follows the field, so the note goes the moment the field no longer holds it.
  const editLists = lists.filter((l) => l.access === 'edit' && isPicked(l.emails, fieldText));

  /** Adds `emails` to the field, or takes them out if they are all in it, as a click on a chip does. */
  function apply(emails: readonly string[], others: readonly (readonly string[])[]) {
    // The lists in the box are from before the update: say so rather than act as if all were well.
    if (!checkAlive()) return;
    // Read the field itself: it may have changed since the last event we saw.
    const result = togglePick(readInviteField(entry), emails, others);
    if (!fillInviteField(entry, result.text)) {
      // The live region would only repeat the alert, and its old line (3 addresses added) is no longer true.
      setAnnouncement('');
      setFailure({ text: result.text, added: result.added });

      return;
    }
    // The box only fills the field: choosing claude.ai's own Invite option stays with the person.
    setFailure(null);
    setClicked(true);
    setAnnouncement(changedMessage(result.added ? 'added' : 'removed', result.changed, result.text));
  }

  function pick(id: string) {
    const list = lists.find((l) => l.id === id);
    if (!list) return;
    const current = readInviteField(entry);
    const others = lists.filter((l) => l.id !== id && isPicked(l.emails, current)).map((l) => l.emails);
    apply(list.emails, others);
  }

  // A person is taken out on their own, even if a picked list has them: the click names them.
  const pickPerson = (email: string) => apply([email], []);

  const searching = query.trim() !== '';

  return (
    <fieldset className="box" aria-label="ArtiShare lists" onPointerEnter={() => checkAlive() && refresh()}>
      <h3 className="heading">ArtiShare lists</h3>
      {lists.length === 0 ? (
        <p className="note">No saved lists yet. Make one in ArtiShare&apos;s Lists tab.</p>
      ) : (
        <>
          <div className="search-row">
            <input
              className="search"
              type="search"
              aria-label="Search lists or people"
              placeholder="Search lists or people"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Escape with text clears the search and stays in the dialog, which would otherwise
                // take that same Escape and close. With nothing to clear it goes on and closes it.
                if (e.key === 'Escape' && query !== '') {
                  e.stopPropagation();
                  setQuery('');
                }
              }}
            />
            {query !== '' && (
              <button type="button" className="clear" aria-label="Clear search" onClick={() => setQuery('')}>
                ×
              </button>
            )}
          </div>
          {searching ? (
            <SearchResults
              found={capResults(searchLists(lists, query))}
              query={query.trim()}
              fieldText={fieldText}
              onList={pick}
              onPerson={pickPerson}
            />
          ) : (
            <div className="chips">
              {lists.map((list) => (
                <button
                  key={list.id}
                  type="button"
                  className="chip"
                  aria-pressed={isPicked(list.emails, fieldText)}
                  // aria-disabled rather than disabled: the chip stays reachable by keyboard, so
                  // a screen reader user can find out why it does nothing.
                  aria-disabled={list.emails.length === 0 || undefined}
                  // A long name is cut with …, so the full name is in the tooltip.
                  title={list.emails.length === 0 ? EMPTY_LIST_TIP : list.name}
                  onClick={() => list.emails.length > 0 && pick(list.id)}
                  aria-label={`${list.name}, ${people(list.emails.length)}`}
                >
                  <span className="chip-name">{list.name}</span>
                  {/* A real space, which the flex layout doesn't draw, so copied text reads 'Team 3'. */}{' '}
                  <span className="chip-count">{list.emails.length}</span>
                </button>
              ))}
            </div>
          )}
          {failure && !fieldHolds(fieldText, failure.text) && (
            <div className="failure">
              <p className="note warning" role="alert">
                {failure.added ? FILL_FAILED : TAKE_OUT_FAILED}
              </p>
              {failure.added && (
                <CopyFallback
                  key={failure.text}
                  text={failure.text}
                  label={`Copy ${addresses(fieldEntries(failure.text).length)}`}
                  onCopied={() => setAnnouncement('Copied. Paste them into claude.ai’s field.')}
                />
              )}
            </div>
          )}
          {unfinished.length > 0 && <p className="note warning">{unfinishedNote(unfinished)}</p>}
          {overLimit(fieldText) && <p className="note warning">{OVER_LIMIT_NOTE}</p>}
          {editLists.length > 0 && (
            <p className="note warning">
              Here claude.ai&apos;s Invite sets the permission, not {possessive(editLists.map((l) => l.name))}{' '}
              Can edit. Change it in People with access afterwards, or invite from the ArtiShare popup.
            </p>
          )}
        </>
      )}
      <output className="visually-hidden" aria-live="polite">
        {announcement}
      </output>
    </fieldset>
  );
}

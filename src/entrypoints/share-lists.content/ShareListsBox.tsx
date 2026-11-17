import { useState } from 'react';
import { fieldEntries, isPicked, togglePick, unfinishedEntries } from '../../core/inviteField';
import { byName } from '../../core/lists';
import { useConfig } from '../../ui/hooks';
import { fillInviteField, readInviteField, useFieldText } from './inviteField';

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;
const addresses = (n: number) => `${n} ${n === 1 ? 'address' : 'addresses'}`;

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

/** The Share lists box drawn under claude.ai's invite field. `entry` is claude.ai's `[data-share-entry]`. */
export function ShareListsBox({ entry }: { entry: Element }) {
  const [config] = useConfig();
  const [fieldText, refresh] = useFieldText(entry);
  const [announcement, setAnnouncement] = useState('');
  // The note about an unfinished entry belongs to a click of ours, so it isn't shown while the
  // person is just typing their first address.
  const [clicked, setClicked] = useState(false);
  // Until the lists are read (or if they can't be) the box stays empty: claude.ai's own dialog is
  // what the person came for, and a box that says nothing is better than one that says something wrong.
  if (!config) return null;
  const lists = byName(config.lists);
  const unfinished = clicked ? unfinishedEntries(fieldText) : [];

  function pick(id: string) {
    const list = lists.find((l) => l.id === id);
    if (!list) return;
    // Read the field itself: it may have changed since the last event we saw.
    const current = readInviteField(entry);
    const others = lists.filter((l) => l.id !== id && isPicked(l.emails, current)).map((l) => l.emails);
    const result = togglePick(current, list.emails, others);
    if (!fillInviteField(entry, result.text)) {
      setAnnouncement('Could not find claude.ai’s invite field.');

      return;
    }
    // The box only fills the field: choosing claude.ai's own Invite option stays with the person.
    setClicked(true);
    setAnnouncement(changedMessage(result.added ? 'added' : 'removed', result.changed, result.text));
  }

  return (
    <fieldset className="box" aria-label="Share lists" onPointerEnter={refresh}>
      <h3 className="heading">Share lists</h3>
      {lists.length === 0 ? (
        <p className="note">No saved lists yet. Make one in ArtiShare&apos;s Lists tab.</p>
      ) : (
        <>
          <input
            className="search"
            type="search"
            aria-label="Search lists or people"
            placeholder="Search lists or people"
            autoComplete="off"
          />
          <div className="chips">
            {lists.map((list) => (
              <button
                key={list.id}
                type="button"
                className="chip"
                aria-pressed={isPicked(list.emails, fieldText)}
                onClick={() => pick(list.id)}
                aria-label={`${list.name}, ${people(list.emails.length)}`}
              >
                <span className="chip-name">{list.name}</span>
                {/* A real space, which the flex layout doesn't draw, so copied text reads 'Team 3'. */}{' '}
                <span className="chip-count">{list.emails.length}</span>
              </button>
            ))}
          </div>
          {unfinished.length > 0 && <p className="note warning">{unfinishedNote(unfinished)}</p>}
        </>
      )}
      <output className="visually-hidden" aria-live="polite">
        {announcement}
      </output>
    </fieldset>
  );
}

import { useState } from 'react';
import { inviteText, isPicked } from '../../core/inviteField';
import { byName } from '../../core/lists';
import { useConfig } from '../../ui/hooks';
import { fillInviteField, useFieldText } from './inviteField';

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

/** What the live region says after a fill. claude.ai's own option names what it will invite. */
function addedMessage(emails: readonly string[]) {
  const n = emails.length;
  if (n === 1) return `1 address added. Choose Invite ${emails[0]} to invite them.`;

  return `${n} addresses added. Choose Invite ${n} people to invite them.`;
}

/** The Share lists box drawn under claude.ai's invite field. `entry` is claude.ai's `[data-share-entry]`. */
export function ShareListsBox({ entry }: { entry: Element }) {
  const [config] = useConfig();
  const fieldText = useFieldText(entry);
  const [announcement, setAnnouncement] = useState('');
  // Until the lists are read (or if they can't be) the box stays empty: claude.ai's own dialog is
  // what the person came for, and a box that says nothing is better than one that says something wrong.
  if (!config) return null;
  const lists = byName(config.lists);

  function pick(emails: readonly string[]) {
    const text = inviteText(emails);
    if (!fillInviteField(entry, text)) {
      setAnnouncement('Could not find claude.ai’s invite field.');

      return;
    }
    // The box only fills the field: choosing claude.ai's own Invite option stays with the person.
    setAnnouncement(addedMessage(text.split(', ')));
  }

  return (
    <fieldset className="box" aria-label="Share lists">
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
                onClick={() => pick(list.emails)}
                aria-label={`${list.name}, ${people(list.emails.length)}`}
              >
                <span className="chip-name">{list.name}</span>
                {/* A real space, which the flex layout doesn't draw, so copied text reads 'Team 3'. */}{' '}
                <span className="chip-count">{list.emails.length}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <output className="visually-hidden" aria-live="polite">
        {announcement}
      </output>
    </fieldset>
  );
}

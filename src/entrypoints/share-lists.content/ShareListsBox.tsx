import { byName } from '../../core/lists';
import { useConfig } from '../../ui/hooks';

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

/** The Share lists box drawn under claude.ai's invite field. */
export function ShareListsBox() {
  const [config] = useConfig();
  // Until the lists are read (or if they can't be) the box stays empty: claude.ai's own dialog is
  // what the person came for, and a box that says nothing is better than one that says something wrong.
  if (!config) return null;
  const lists = byName(config.lists);

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
    </fieldset>
  );
}

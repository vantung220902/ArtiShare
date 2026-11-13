import {
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  type AddedText,
  addArtifactText,
  insertPaste,
  removeArtifact,
  sameArtifact,
  updateRemoved,
} from '../../core/artifactRows';
import { artifactKey } from '../../core/artifactUrl';
import type { ArtifactRef } from '../../core/types';
import { CloseIcon, LinkIcon, PlusIcon } from '../../ui/icons';
import { RequiredMark } from '../../ui/RequiredMark';
import { currentTabArtifact } from './viewUtils';

/** The rows and what is typed in the box under them, kept together so the draft saves both at once. */
export interface ArtifactsValue {
  rows: ArtifactRef[];
  text: string;
  /** Keys of artifacts taken out with ×, which the tab's prefill leaves out until they are added again. */
  removed: string[];
}

// Long enough to find the highlighted row, short enough not to linger after you've looked.
const REPEAT_MS = 2000;

// Long enough to notice the message and reach for Undo, short enough not to sit there afterwards.
const UNDO_MS = 5000;

/** The row last taken out and where it was, so Undo can put it back in the same place. */
interface Removed {
  ref: ArtifactRef;
  index: number;
}

const lineBreaks = (text: string) => text.split('\n').length - 1;

interface ArtifactsFieldProps {
  value: ArtifactsValue;
  onChange: (next: ArtifactsValue) => void;
  /** `value.text` added to `value.rows`: what Preview would share, and what in the box isn't a link. */
  pending: AddedText;
  /** The artifact in the tab the popup opened over, if any: its row is marked. */
  thisTab: ArtifactRef | null;
  onError: (message: string) => void;
}

/**
 * Each artifact is a row with a ×. Links pasted, dropped or entered in the box become rows; text
 * typed without Enter stays in the box and still counts, so nothing typed is lost.
 */
export function ArtifactsField({ value, onChange, pending, thisTab, onError }: ArtifactsFieldProps) {
  const { rows, text, removed: heldBack } = value;
  // Rows the last addition named again, highlighted for a moment instead of added twice.
  const [repeated, setRepeated] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const [removed, setRemoved] = useState<Removed | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(undoTimer.current), []);

  // Where keyboard focus goes once the rows have re-rendered: the × at that position, or the box.
  // Set only for keyboard activations, so a mouse click doesn't pull focus around.
  const focusAfter = useRef<number | 'box' | null>(null);
  const list = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => {
    const target = focusAfter.current;
    if (target === null) return;
    focusAfter.current = null;
    if (target === 'box') document.getElementById('artifacts')?.focus();
    else list.current?.querySelectorAll('button')[target]?.focus();
  }, [rows]);

  const remove = (ref: ArtifactRef, event: MouseEvent) => {
    const index = rows.findIndex((row) => artifactKey(row) === artifactKey(ref));
    const next = removeArtifact(rows, ref);
    // A click made with the keyboard reports no pointer position (detail 0).
    if (event.detail === 0) focusAfter.current = next.length ? Math.min(index, next.length - 1) : 'box';
    onChange({ rows: next, text, removed: updateRemoved(heldBack, next, ref) });
    clearTimeout(undoTimer.current);
    setRemoved({ ref, index });
    undoTimer.current = setTimeout(() => setRemoved(null), UNDO_MS);
  };

  const undo = (event: MouseEvent) => {
    if (!removed) return;
    clearTimeout(undoTimer.current);
    setRemoved(null);
    // Added again meanwhile (a paste or + Current tab): nothing to put back.
    if (rows.some((row) => artifactKey(row) === artifactKey(removed.ref))) return;
    const index = Math.min(removed.index, rows.length);
    if (event.detail === 0) focusAfter.current = index;
    const restored = rows.toSpliced(index, 0, removed.ref);
    onChange({ rows: restored, text, removed: updateRemoved(heldBack, restored) });
  };

  const showRepeated = (refs: ArtifactRef[]) => {
    clearTimeout(timer.current);
    setRepeated(refs.map(artifactKey));
    if (refs.length) timer.current = setTimeout(() => setRepeated([]), REPEAT_MS);
  };

  const add = (input: string) => {
    const added = addArtifactText(rows, input);
    onChange({ rows: added.rows, text: added.leftover, removed: updateRemoved(heldBack, added.rows) });
    showRepeated(added.repeated);
  };

  const addCurrentTab = async () => {
    const ref = await currentTabArtifact();
    if (!ref) return onError('The current tab is not a claude.ai artifact.');
    onError('');
    const added = addArtifactText(rows, ref.url);
    onChange({ rows: added.rows, text, removed: updateRemoved(heldBack, added.rows) });
    showRepeated(added.repeated);
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = event.clipboardData.getData('text');
    if (!pasted.trim()) return;
    event.preventDefault();
    const box = event.currentTarget;
    add(insertPaste(text, box.selectionStart, box.selectionEnd, pasted));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (text.trim()) add(text);
  };

  const invalid = pending.leftover ? pending.leftover.split('\n') : [];
  const count = pending.rows.length;

  return (
    <section className="card stack">
      <div className="row spread">
        <label htmlFor="artifacts" className="title">
          Artifacts
          <RequiredMark /> {count > 0 && <span className="count">{count}</span>}
        </label>
        <button className="pill" onClick={addCurrentTab}>
          <PlusIcon size={13} /> Current tab
        </button>
      </div>
      {rows.length ? (
        <ul className="artifact-items" ref={list}>
          {rows.map((ref) => (
            <li
              key={artifactKey(ref)}
              className={repeated.includes(artifactKey(ref)) ? 'artifact-item repeated' : 'artifact-item'}
            >
              <LinkIcon size={14} />
              <span className="grow truncate" title={ref.url}>
                {ref.url}
              </span>
              {thisTab && sameArtifact(ref, thisTab) && <span className="this-tab">This tab</span>}
              <button
                type="button"
                className="ghost icon-btn"
                aria-label={`Remove ${ref.url}`}
                title="Remove"
                onClick={(event) => remove(ref, event)}
              >
                <CloseIcon size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">No artifacts yet. Open one and click + Current tab, or paste links below.</p>
      )}
      <textarea
        id="artifacts"
        className="paste-box"
        aria-required={rows.length === 0}
        rows={1}
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          // Enter adds instead of breaking the line, so a new line break was dropped in: add what's there.
          if (lineBreaks(next) > lineBreaks(text)) add(next);
          else onChange({ ...value, text: next });
        }}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
        placeholder="Paste artifact links (one per line)"
        spellCheck={false}
      />
      {invalid.length > 0 && <span className="hint err">Not artifact links: {invalid.join(', ')}</span>}
      {repeated.length > 0 && <output className="hint">Already in the list</output>}
      {removed && (
        <output className="hint undo-bar">
          {/* The spaces show nothing in a flex row, but give a screen reader and copied text their gaps. */}
          <span>Removed</span>{' '}
          <span className="grow truncate" title={removed.ref.url}>
            {removed.ref.url}
          </span>{' '}
          <span aria-hidden>·</span>{' '}
          <button type="button" className="link" onClick={undo}>
            Undo
          </button>
        </output>
      )}
    </section>
  );
}

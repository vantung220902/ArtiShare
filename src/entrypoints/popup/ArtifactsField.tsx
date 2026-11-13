import { type ClipboardEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { type AddedText, addArtifactText, insertPaste, removeArtifact } from '../../core/artifactRows';
import { artifactKey } from '../../core/artifactUrl';
import type { ArtifactRef } from '../../core/types';
import { CloseIcon, LinkIcon, PlusIcon } from '../../ui/icons';
import { RequiredMark } from '../../ui/RequiredMark';
import { currentTabArtifact } from './viewUtils';

/** The rows and what is typed in the box under them, kept together so the draft saves both at once. */
export interface ArtifactsValue {
  rows: ArtifactRef[];
  text: string;
}

// Long enough to find the highlighted row, short enough not to linger after you've looked.
const REPEAT_MS = 2000;

const lineBreaks = (text: string) => text.split('\n').length - 1;

interface ArtifactsFieldProps {
  value: ArtifactsValue;
  onChange: (next: ArtifactsValue) => void;
  /** `value.text` added to `value.rows`: what Preview would share, and what in the box isn't a link. */
  pending: AddedText;
  onError: (message: string) => void;
}

/**
 * Each artifact is a row with a ×. Links pasted, dropped or entered in the box become rows; text
 * typed without Enter stays in the box and still counts, so nothing typed is lost.
 */
export function ArtifactsField({ value, onChange, pending, onError }: ArtifactsFieldProps) {
  const { rows, text } = value;
  // Rows the last addition named again, highlighted for a moment instead of added twice.
  const [repeated, setRepeated] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const showRepeated = (refs: ArtifactRef[]) => {
    clearTimeout(timer.current);
    setRepeated(refs.map(artifactKey));
    if (refs.length) timer.current = setTimeout(() => setRepeated([]), REPEAT_MS);
  };

  const add = (input: string) => {
    const added = addArtifactText(rows, input);
    onChange({ rows: added.rows, text: added.leftover });
    showRepeated(added.repeated);
  };

  const addCurrentTab = async () => {
    const ref = await currentTabArtifact();
    if (!ref) return onError('The current tab is not a claude.ai artifact.');
    onError('');
    const added = addArtifactText(rows, ref.url);
    onChange({ rows: added.rows, text });
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
        <ul className="artifact-items">
          {rows.map((ref) => (
            <li
              key={artifactKey(ref)}
              className={repeated.includes(artifactKey(ref)) ? 'artifact-item repeated' : 'artifact-item'}
            >
              <LinkIcon size={14} />
              <span className="grow truncate" title={ref.url}>
                {ref.url}
              </span>
              <button
                type="button"
                className="ghost icon-btn"
                aria-label={`Remove ${ref.url}`}
                title="Remove"
                onClick={() => onChange({ rows: removeArtifact(rows, ref), text })}
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
          else onChange({ rows, text: next });
        }}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
        placeholder="Paste artifact links (one per line)"
        spellCheck={false}
      />
      {invalid.length > 0 && <span className="hint err">Not artifact links: {invalid.join(', ')}</span>}
      {repeated.length > 0 && <output className="hint">Already in the list</output>}
    </section>
  );
}

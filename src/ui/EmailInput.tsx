import { parseEmails } from '../core/emails';

interface Props {
  id?: string;
  value: string;
  onChange: (text: string) => void;
  rows?: number;
  placeholder?: string;
}

/** Textarea for addresses with live validation. Accepts any pasted shape, including CSV text. */
export function EmailInput({ id, value, onChange, rows = 5, placeholder }: Props) {
  const parsed = parseEmails(value);

  return (
    <div className="stack">
      <textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder ?? 'One per line, or paste a comma-separated list or a CSV export'}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
      <div className="row chips">
        <span className={parsed.valid.length ? 'chip ok' : 'chip'}>{parsed.valid.length} valid</span>
        {parsed.duplicates.length > 0 && <span className="chip">{parsed.duplicates.length} duplicate</span>}
        {parsed.invalid.length > 0 && (
          <span className="chip err" title={parsed.invalid.join(', ')}>
            <span className="truncate">
              {parsed.invalid.length} invalid: {parsed.invalid.slice(0, 3).join(', ')}
              {parsed.invalid.length > 3 ? '…' : ''}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

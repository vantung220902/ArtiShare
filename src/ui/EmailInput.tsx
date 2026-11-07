import { parseEmails } from '../core/emails';

interface Props {
  value: string;
  onChange: (text: string) => void;
  rows?: number;
  placeholder?: string;
}

/** Textarea for addresses with live validation. Accepts any pasted shape, including CSV text. */
export function EmailInput({ value, onChange, rows = 5, placeholder }: Props) {
  const parsed = parseEmails(value);

  return (
    <div className="stack">
      <textarea
        rows={rows}
        value={value}
        placeholder={placeholder ?? 'One per line, or paste a comma-separated list or a CSV export'}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
      <span className="hint">
        <span className="ok">{parsed.valid.length} valid</span>
        {parsed.duplicates.length > 0 && <> · {parsed.duplicates.length} duplicate</>}
        {parsed.invalid.length > 0 && (
          <>
            {' '}
            · <span className="err">{parsed.invalid.length} invalid: {parsed.invalid.slice(0, 3).join(', ')}
            {parsed.invalid.length > 3 ? '…' : ''}</span>
          </>
        )}
      </span>
    </div>
  );
}

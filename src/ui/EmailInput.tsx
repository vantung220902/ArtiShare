import { parseEmails } from '../core/emails';
import { pickFile } from './hooks';

interface Props {
  value: string;
  onChange: (text: string) => void;
  rows?: number;
  placeholder?: string;
}

/** Textarea for addresses with live validation and "Import CSV/TXT" (appends to what's there). */
export function EmailInput({ value, onChange, rows = 5, placeholder }: Props) {
  const parsed = parseEmails(value);

  const importFile = async () => {
    const file = await pickFile('.csv,.txt,.tsv,text/csv,text/plain');
    if (!file) return;
    const found = parseEmails(file.text).valid;
    onChange([value.trim(), ...found].filter(Boolean).join('\n'));
  };

  return (
    <div className="stack">
      <textarea
        rows={rows}
        value={value}
        placeholder={placeholder ?? 'One per line, or paste a comma-separated list or a CSV export'}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
      <div className="row spread">
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
        <button type="button" className="link" onClick={importFile}>
          Import CSV/TXT
        </button>
      </div>
    </div>
  );
}

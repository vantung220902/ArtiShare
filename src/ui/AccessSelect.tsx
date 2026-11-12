import { ACCESS_LABELS, ACCESS_LEVELS, type AccessLevel } from '../core/types';

interface Props {
  value: AccessLevel;
  onChange: (a: AccessLevel) => void;
  id?: string;
  disabled?: boolean;
  /** For a select with no visible label beside it, e.g. one per row. */
  label?: string;
}

export function AccessSelect({ value, onChange, id, disabled, label }: Props) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(e.target.value as AccessLevel)}
    >
      {ACCESS_LEVELS.map((a) => (
        <option key={a} value={a}>
          {ACCESS_LABELS[a]}
        </option>
      ))}
    </select>
  );
}

import { ACCESS_LABELS, ACCESS_LEVELS, type AccessLevel } from '../core/types';

interface Props {
  value: AccessLevel;
  onChange: (a: AccessLevel) => void;
  id?: string;
}

export function AccessSelect({ value, onChange, id }: Props) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value as AccessLevel)}>
      {ACCESS_LEVELS.map((a) => (
        <option key={a} value={a}>
          {ACCESS_LABELS[a]}
        </option>
      ))}
    </select>
  );
}

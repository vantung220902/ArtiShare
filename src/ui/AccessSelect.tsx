import { ACCESS_LABELS, ACCESS_LEVELS, type AccessLevel } from '../core/types';

export function AccessSelect({ value, onChange }: { value: AccessLevel; onChange: (a: AccessLevel) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as AccessLevel)}>
      {ACCESS_LEVELS.map((a) => (
        <option key={a} value={a}>
          {ACCESS_LABELS[a]}
        </option>
      ))}
    </select>
  );
}

/** A visual * after a label. Hidden from screen readers: the field itself carries aria-required. */
export function RequiredMark() {
  return (
    <span className="required-mark" aria-hidden="true">
      {' *'}
    </span>
  );
}

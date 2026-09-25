/**
 * Required-field marker for form labels. Decorative — requiredness is
 * announced by `aria-required` on the control, not the asterisk.
 */
export function RequiredMark() {
  return (
    <span aria-hidden="true" className="text-destructive">
      *
    </span>
  )
}

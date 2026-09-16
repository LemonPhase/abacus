import type { RecurringFrequency } from '@/types'

// Schedule display helpers. Occurrence arithmetic itself is owned by the
// database (recurring_next_date in 20260919000001_recurring_engine.sql) —
// the previous client-side computeNextDate/getUpcomingDates had no callers
// left after the engine landed and were removed (they diverged from the SQL
// clamp on yearly Feb-29: JS overflows to Mar 1, SQL clamps to Feb 28).

export function formatFrequency(frequency: RecurringFrequency, intervalValue: number): string {
  if (intervalValue === 1) {
    return frequency.charAt(0).toUpperCase() + frequency.slice(1)
  }
  return `Every ${intervalValue} ${frequency === 'daily' ? 'days' : frequency === 'weekly' ? 'weeks' : frequency === 'monthly' ? 'months' : 'years'}`
}

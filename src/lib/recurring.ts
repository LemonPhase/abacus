import type { RecurringFrequency, RecurringTransaction } from '@/types'

export function computeNextDate(
  fromDate: Date,
  frequency: RecurringFrequency,
  intervalValue: number,
  dayOfMonth?: number | null,
): Date {
  let result = new Date(fromDate)

  switch (frequency) {
    case 'daily':
      result.setDate(result.getDate() + intervalValue)
      break
    case 'weekly':
      result.setDate(result.getDate() + 7 * intervalValue)
      break
    case 'monthly': {
      const targetDay = dayOfMonth ?? fromDate.getDate()
      const targetMonth = fromDate.getMonth() + intervalValue
      const targetYear = fromDate.getFullYear() + Math.floor(targetMonth / 12)
      const normalizedMonth = ((targetMonth % 12) + 12) % 12
      const maxDay = new Date(targetYear, normalizedMonth + 1, 0).getDate()
      result = new Date(targetYear, normalizedMonth, Math.min(targetDay, maxDay))
      break
    }
    case 'yearly':
      result.setFullYear(result.getFullYear() + intervalValue)
      break
  }

  return result
}

export function getUpcomingDates(recurring: RecurringTransaction, count: number): Date[] {
  const dates: Date[] = []
  let current = new Date(recurring.nextDate)

  for (let i = 0; i < count; i++) {
    if (recurring.endDate && current > new Date(recurring.endDate)) break
    dates.push(new Date(current))
    current = computeNextDate(
      current,
      recurring.frequency,
      recurring.intervalValue,
      recurring.dayOfMonth,
    )
  }

  return dates
}

export function formatFrequency(frequency: RecurringFrequency, intervalValue: number): string {
  if (intervalValue === 1) {
    return frequency.charAt(0).toUpperCase() + frequency.slice(1)
  }
  return `Every ${intervalValue} ${frequency === 'daily' ? 'days' : frequency === 'weekly' ? 'weeks' : frequency === 'monthly' ? 'months' : 'years'}`
}

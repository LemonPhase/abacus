import { supabase } from '@/supabase/client'

/**
 * Thin wrappers around the DB-side report aggregates
 * (20260918000002_report_aggregates.sql). Aggregation happens in the database
 * across the full matching dataset under RLS; the reporting currency is an
 * explicit parameter and unreliable (stale/unconverted) rows are excluded
 * from sums and surfaced as counts.
 */

export interface ReportSummary {
  income: number
  expense: number
  /** Income/expense rows in range with no reliable reporting-currency amount. */
  unconverted: number
  /** All rows in range (any type) — distinguishes "empty period" from "nothing sumable". */
  total: number
}

export interface MonthlyBucket {
  /** First day of the month, YYYY-MM-DD. */
  month: string
  income: number
  expense: number
  unconverted: number
}

export interface CategoryBreakdownRow {
  categoryId: string | null
  name: string | null
  color: string | null
  icon: string | null
  income: number
  expense: number
}

export interface BudgetSpendingRow {
  id: string
  name: string
  amount: number
  period: 'monthly' | 'yearly'
  /** Reliable reporting-currency expenses in the budget's current period. */
  spent: number
}

export async function fetchReportSummary(
  from: string,
  to: string,
  currency: string,
): Promise<ReportSummary> {
  const { data, error } = await supabase.rpc('report_summary', {
    p_from: from,
    p_to: to,
    p_currency: currency,
  })
  if (error) throw new Error(error.message)
  const row = (data ?? [])[0]
  return {
    income: row?.income ?? 0,
    expense: row?.expense ?? 0,
    unconverted: row?.unconverted ?? 0,
    total: row?.total ?? 0,
  }
}

export async function fetchMonthlySeries(
  from: string,
  to: string,
  currency: string,
): Promise<MonthlyBucket[]> {
  const { data, error } = await supabase.rpc('report_monthly', {
    p_from: from,
    p_to: to,
    p_currency: currency,
  })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    month: row.month_start,
    income: row.income,
    expense: row.expense,
    unconverted: row.unconverted,
  }))
}

export async function fetchCategoryBreakdown(
  from: string,
  to: string,
  currency: string,
): Promise<CategoryBreakdownRow[]> {
  const { data, error } = await supabase.rpc('report_by_category', {
    p_from: from,
    p_to: to,
    p_currency: currency,
  })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    categoryId: row.category_id ?? null,
    name: row.category_name ?? null,
    color: row.category_color ?? null,
    icon: row.category_icon ?? null,
    income: row.income,
    expense: row.expense,
  }))
}

export async function fetchBudgetSpending(
  today: string,
  currency: string,
): Promise<BudgetSpendingRow[]> {
  const { data, error } = await supabase.rpc('budget_spending', {
    p_today: today,
    p_currency: currency,
  })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    id: row.budget_id,
    name: row.budget_name,
    amount: row.budget_amount,
    period: row.budget_period as BudgetSpendingRow['period'],
    spent: row.spent,
  }))
}

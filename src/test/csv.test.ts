import { describe, it, expect } from "vitest"
import { detectColumns, applyMapping, parseAmount, parseDate } from "@/lib/csv"

describe("detectColumns", () => {
  it("detects date column by common names", () => {
    const result = detectColumns(["Transaction Date", "Description", "Amount"])
    expect(result.date).toBe("Transaction Date")
  })

  it("detects description column by common names", () => {
    const result = detectColumns(["Date", "Payee", "Amount"])
    expect(result.description).toBe("Payee")
  })

  it("detects amount column by common names", () => {
    const result = detectColumns(["Date", "Memo", "Value"])
    expect(result.amount).toBe("Value")
  })

  it("detects transaction type column", () => {
    const result = detectColumns(["Date", "Narrative", "Amount", "Transaction Type"])
    expect(result.type).toBe("Transaction Type")
  })

  it("returns empty mapping for unknown columns", () => {
    const result = detectColumns(["Foo", "Bar", "Baz"])
    expect(result.date).toBe("")
    expect(result.description).toBe("")
    expect(result.amount).toBe("")
  })
})

describe("applyMapping", () => {
  it("maps rows using column mapping", () => {
    const rows = [
      { Date: "2026-01-15", Payee: "Grocery Store", Sum: "42.50" },
      { Date: "2026-01-16", Payee: "Gas Station", Sum: "55.00" },
    ]
    const mapping = { date: "Date", description: "Payee", amount: "Sum", type: "" }
    const result = applyMapping(rows, mapping)

    expect(result).toHaveLength(2)
    expect(result[0].date).toBe("2026-01-15")
    expect(result[0].description).toBe("Grocery Store")
    expect(result[0].amount).toBe("42.50")
    expect(result[0].type).toBeUndefined()
  })

  it("handles type detection from column", () => {
    const rows = [
      { Date: "2026-01-15", Desc: "Salary", Amt: "5000", Dir: "credit" },
      { Date: "2026-01-16", Desc: "Rent", Amt: "1200", Dir: "debit" },
    ]
    const mapping = { date: "Date", description: "Desc", amount: "Amt", type: "Dir" }
    const result = applyMapping(rows, mapping)

    expect(result[0].type).toBe("income")
    expect(result[1].type).toBe("expense")
  })

  it("leaves type undefined when value does not match known patterns", () => {
    const rows = [
      { Date: "2026-01-15", Desc: "Transfer", Amt: "100", Dir: "transfer" },
    ]
    const mapping = { date: "Date", description: "Desc", amount: "Amt", type: "Dir" }
    const result = applyMapping(rows, mapping)

    expect(result[0].type).toBeUndefined()
  })
})

describe("parseAmount", () => {
  it("parses plain numbers", () => {
    expect(parseAmount("100")).toBe(100)
    expect(parseAmount("100.50")).toBe(100.5)
  })

  it("handles currency symbols", () => {
    expect(parseAmount("$100")).toBe(100)
    expect(parseAmount("€50.25")).toBe(50.25)
    expect(parseAmount("£1,000")).toBe(1000)
  })

  it("handles negative numbers in parentheses", () => {
    expect(parseAmount("(100)")).toBe(-100)
    expect(parseAmount("(50.25)")).toBe(-50.25)
  })

  it("handles leading minus sign", () => {
    expect(parseAmount("-75")).toBe(-75)
  })

  it("returns 0 for empty or invalid", () => {
    expect(parseAmount("")).toBe(0)
    expect(parseAmount("abc")).toBe(0)
  })

  it("removes commas in numbers", () => {
    expect(parseAmount("1,234.56")).toBe(1234.56)
  })
})

describe("parseDate", () => {
  it("parses valid date strings", () => {
    const result = parseDate("2026-05-15")
    expect(result).toBeInstanceOf(Date)
    expect(result!.getFullYear()).toBe(2026)
  })

  it("returns null for invalid dates", () => {
    expect(parseDate("not a date")).toBeNull()
    expect(parseDate("")).toBeNull()
  })
})

import { describe, it, expect } from "vitest"
import { snakeToCamel, camelToSnake, mapKeysToCamel, mapKeysToSnake } from "@/lib/case"

describe("snakeToCamel", () => {
  it("converts simple snake_case", () => {
    expect(snakeToCamel("hello_world")).toBe("helloWorld")
  })

  it("converts multiple underscores", () => {
    expect(snakeToCamel("base_amount")).toBe("baseAmount")
    expect(snakeToCamel("from_currency")).toBe("fromCurrency")
  })

  it("returns unchanged for camelCase", () => {
    expect(snakeToCamel("helloWorld")).toBe("helloWorld")
  })

  it("returns unchanged for single word", () => {
    expect(snakeToCamel("name")).toBe("name")
  })
})

describe("camelToSnake", () => {
  it("converts simple camelCase", () => {
    expect(camelToSnake("helloWorld")).toBe("hello_world")
  })

  it("converts multiple uppercase letters", () => {
    expect(camelToSnake("baseAmount")).toBe("base_amount")
    expect(camelToSnake("fromCurrency")).toBe("from_currency")
    expect(camelToSnake("myXMLParser")).toBe("my_x_m_l_parser")
  })

  it("returns unchanged for snake_case", () => {
    expect(camelToSnake("hello_world")).toBe("hello_world")
  })

  it("returns unchanged for single lowercase word", () => {
    expect(camelToSnake("name")).toBe("name")
  })
})

describe("mapKeysToCamel", () => {
  it("converts flat object keys", () => {
    const result = mapKeysToCamel({ user_name: "Alice", first_name: "A" })
    expect(result).toEqual({ userName: "Alice", firstName: "A" })
  })

  it("converts nested objects", () => {
    const result = mapKeysToCamel({
      user_data: { full_name: "Bob", phone_number: "555" },
    })
    expect(result).toEqual({ userData: { fullName: "Bob", phoneNumber: "555" } })
  })

  it("converts array of objects", () => {
    const result = mapKeysToCamel([
      { item_id: 1, item_name: "Apple" },
      { item_id: 2, item_name: "Banana" },
    ])
    expect(result).toEqual([
      { itemId: 1, itemName: "Apple" },
      { itemId: 2, itemName: "Banana" },
    ])
  })

  it("leaves non-object values unchanged", () => {
    expect(mapKeysToCamel("hello")).toBe("hello")
    expect(mapKeysToCamel(42)).toBe(42)
    expect(mapKeysToCamel(null)).toBe(null)
  })

  it("converts typical Supabase account response", () => {
    const result = mapKeysToCamel<Record<string, unknown>>({
      id: "abc",
      user_id: "u1",
      account_type: "savings",
      base_currency: "USD",
      created_at: "2026-01-01",
      updated_at: "2026-01-02",
    })
    expect(result).toEqual({
      id: "abc",
      userId: "u1",
      accountType: "savings",
      baseCurrency: "USD",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-02",
    })
  })
})

describe("mapKeysToSnake", () => {
  it("converts flat object keys", () => {
    const result = mapKeysToSnake({ userName: "Alice", firstName: "A" })
    expect(result).toEqual({ user_name: "Alice", first_name: "A" })
  })

  it("converts nested objects", () => {
    const result = mapKeysToSnake({
      userData: { fullName: "Bob", phoneNumber: "555" },
    })
    expect(result).toEqual({ user_data: { full_name: "Bob", phone_number: "555" } })
  })

  it("converts array of objects", () => {
    const result = mapKeysToSnake([
      { itemId: 1, itemName: "Apple" },
      { itemId: 2, itemName: "Banana" },
    ])
    expect(result).toEqual([
      { item_id: 1, item_name: "Apple" },
      { item_id: 2, item_name: "Banana" },
    ])
  })

  it("round-trips with mapKeysToCamel", () => {
    const original = { baseAmount: 100, fromCurrency: "EUR", toCurrency: "USD" }
    const result = mapKeysToCamel(mapKeysToSnake(original))
    expect(result).toEqual(original)
  })
})

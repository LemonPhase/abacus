export function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

export function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())
}

export function mapKeysToCamel<T>(obj: unknown): T {
  if (Array.isArray(obj)) return obj.map((v) => mapKeysToCamel(v)) as unknown as T
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      result[snakeToCamel(key)] = mapKeysToCamel((obj as Record<string, unknown>)[key])
    }
    return result as unknown as T
  }
  return obj as T
}

export function mapKeysToSnake<T>(obj: unknown): T {
  if (Array.isArray(obj)) return obj.map((v) => mapKeysToSnake(v)) as unknown as T
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      result[camelToSnake(key)] = mapKeysToSnake((obj as Record<string, unknown>)[key])
    }
    return result as unknown as T
  }
  return obj as T
}

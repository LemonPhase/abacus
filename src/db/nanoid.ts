let counter = 0

export function nanoid(length = 12): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  counter = (counter + 1) % Number.MAX_SAFE_INTEGER
  let id = ""
  const time = Date.now().toString(36)
  const randomPart = Array.from({ length: length - time.length }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join("")
  id = time + randomPart
  // Ensure uniqueness with counter
  if (counter > 0) {
    id = id.slice(0, -2) + counter.toString(36).padStart(2, "0")
  }
  return id
}

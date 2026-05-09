import { db } from "@/db"

const SYNC_STORAGE_KEY = "abacus-sync-config"
const HANDLE_DB = "abacus-sync-handle"
const HANDLE_KEY = "fileHandle"

export interface SyncConfig {
  enabled: boolean
  passphrase: string
  fileName: string
  lastSyncedAt: string | null
  location: string | null
}

export function loadSyncConfig(): SyncConfig {
  try {
    const raw = localStorage.getItem(SYNC_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { enabled: false, passphrase: "", fileName: "", lastSyncedAt: null, location: null }
}

export function saveSyncConfig(config: SyncConfig) {
  localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(config))
}

async function getStoredHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const req = indexedDB.open(HANDLE_DB, 1)
    return new Promise((resolve, reject) => {
      req.onupgradeneeded = () => {
        req.result.createObjectStore("handles")
      }
      req.onsuccess = () => {
        const store = req.result.transaction("handles", "readonly").objectStore("handles")
        const getReq = store.get(HANDLE_KEY)
        getReq.onsuccess = () => resolve(getReq.result ?? null)
        getReq.onerror = () => reject(getReq.error)
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

async function storeHandle(handle: FileSystemFileHandle) {
  try {
    const req = indexedDB.open(HANDLE_DB, 1)
    return new Promise<void>((resolve, reject) => {
      req.onupgradeneeded = () => {
        req.result.createObjectStore("handles")
      }
      req.onsuccess = () => {
        const store = req.result.transaction("handles", "readwrite").objectStore("handles")
        store.put(handle, HANDLE_KEY)
        req.result.close()
        resolve()
      }
      req.onerror = () => reject(req.error)
    })
  } catch { /* ignore */ }
}

async function clearStoredHandle() {
  try {
    const req = indexedDB.open(HANDLE_DB, 1)
    return new Promise<void>((resolve, reject) => {
      req.onupgradeneeded = () => {
        req.result.createObjectStore("handles")
      }
      req.onsuccess = () => {
        const store = req.result.transaction("handles", "readwrite").objectStore("handles")
        store.delete(HANDLE_KEY)
        req.result.close()
        resolve()
      }
      req.onerror = () => reject(req.error)
    })
  } catch { /* ignore */ }
}

// Web Crypto helpers
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(passphrase),
    { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"]
  )
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false, ["encrypt", "decrypt"]
  )
}

async function encrypt(data: string, passphrase: string): Promise<string> {
  const enc = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    enc.encode(data)
  )
  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength)
  combined.set(salt, 0)
  combined.set(iv, salt.length)
  combined.set(new Uint8Array(encrypted), salt.length + iv.length)
  return btoa(String.fromCharCode(...combined))
}

async function decrypt(encryptedBase64: string, passphrase: string): Promise<string> {
  const combined = Uint8Array.from(atob(encryptedBase64), (c) => c.charCodeAt(0))
  const salt = combined.slice(0, 16)
  const iv = combined.slice(16, 28)
  const ciphertext = combined.slice(28)
  const key = await deriveKey(passphrase, salt)
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ciphertext as BufferSource
  )
  return new TextDecoder().decode(decrypted)
}

export async function buildExportPayload() {
  return JSON.stringify({
    version: 2,
    exportedAt: new Date().toISOString(),
    accounts: await db.accounts.toArray(),
    categories: await db.categories.toArray(),
    transactions: await db.transactions.toArray(),
    budgets: await db.budgets.toArray(),
    exchangeRates: await db.exchangeRates.toArray(),
    investmentPlans: await db.investmentPlans.toArray(),
  })
}

export async function importPayload(json: string) {
  const data = JSON.parse(json)
  if (!data.version) throw new Error("Invalid sync file format")

  await db.accounts.clear()
  await db.categories.clear()
  await db.transactions.clear()
  await db.budgets.clear()
  await db.exchangeRates.clear()
  await db.investmentPlans.clear()

  if (data.accounts?.length) await db.accounts.bulkAdd(data.accounts)
  if (data.categories?.length) await db.categories.bulkAdd(data.categories)
  if (data.transactions?.length) await db.transactions.bulkAdd(data.transactions)
  if (data.budgets?.length) await db.budgets.bulkAdd(data.budgets)
  if (data.exchangeRates?.length) await db.exchangeRates.bulkAdd(data.exchangeRates)
  if (data.investmentPlans?.length) await db.investmentPlans.bulkAdd(data.investmentPlans)

  return data
}

export async function pickSyncLocation(
  onStatus?: (msg: string) => void
): Promise<{ success: boolean; message: string }> {
  if (!("showSaveFilePicker" in window)) {
    return { success: false, message: "Your browser doesn't support file handles. Use 'Sync Now (Download)' instead." }
  }

  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: "abacus-sync.enc",
      types: [{ description: "Abacus Encrypted Sync", accept: { "application/octet-stream": [".enc"] } }],
    })

    await storeHandle(handle)

    const config = loadSyncConfig()
    config.fileName = handle.name
    config.location = "Local file (IndexedDB handle)"
    saveSyncConfig(config)

    onStatus?.(`Sync location set: ${handle.name}`)
    return { success: true, message: `Sync location set: ${handle.name}` }
  } catch (e) {
    if ((e as DOMException).name === "AbortError") return { success: false, message: "Cancelled" }
    return { success: false, message: e instanceof Error ? e.message : "Failed" }
  }
}

export async function writeToSyncHandle(
  passphrase: string,
  onStatus?: (msg: string) => void
): Promise<{ success: boolean; message: string }> {
  const config = loadSyncConfig()
  if (!config.enabled || !passphrase) {
    return { success: false, message: "Enable auto-sync and set a passphrase first" }
  }

  onStatus?.("Building export...")
  const payload = await buildExportPayload()
  const encrypted = await encrypt(payload, passphrase)

  // Try stored handle first (silent write)
  if ("showSaveFilePicker" in window) {
    const handle = await getStoredHandle()
    if (handle) {
      try {
        // Request permission to write
        const opts: FileSystemHandlePermissionDescriptor = { mode: "readwrite" }
        if ((await handle.queryPermission(opts)) !== "granted") {
          await handle.requestPermission(opts)
        }

        const writable = await handle.createWritable()
        await writable.write(encrypted)
        await writable.close()

        config.lastSyncedAt = new Date().toISOString()
        config.fileName = handle.name
        saveSyncConfig(config)

        onStatus?.("Synced silently")
        return { success: true, message: `Auto-synced at ${new Date().toLocaleTimeString()}` }
      } catch {
        // Permission denied or handle invalid — clear and fall through to prompt
        await clearStoredHandle()
      }
    }
  }

  // Fallback: prompt for file location, then remember it
  try {
    return await pickSyncLocation(onStatus)
  } catch {
    return { success: false, message: "Sync cancelled" }
  }
}

export async function syncFromFile(
  passphrase: string,
  onStatus?: (msg: string) => void
): Promise<{ success: boolean; message: string }> {
  try {
    if (!passphrase) return { success: false, message: "Set a passphrase first" }

    let encrypted: string

    if ("showOpenFilePicker" in window) {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: "Abacus Encrypted Sync", accept: { "application/octet-stream": [".enc", ".json"] } }],
      })
      const file = await handle.getFile()
      encrypted = await file.text()
    } else {
      return { success: false, message: "File picker not supported — use Import Data instead" }
    }

    onStatus?.("Decrypting...")
    const payload = await decrypt(encrypted, passphrase)

    onStatus?.("Importing data...")
    await importPayload(payload)

    const config = loadSyncConfig()
    config.lastSyncedAt = new Date().toISOString()
    saveSyncConfig(config)

    onStatus?.("Import complete — reloading...")
    return { success: true, message: "Import successful — reloading" }
  } catch (e) {
    if ((e as DOMException).name === "AbortError") return { success: false, message: "Cancelled" }
    const msg = e instanceof Error ? e.message : "Import failed"
    return { success: false, message: msg.includes("decrypt") ? "Wrong passphrase or corrupted file" : msg }
  }
}

export async function downloadSyncFile(
  passphrase: string,
  onStatus?: (msg: string) => void
): Promise<{ success: boolean; message: string }> {
  try {
    const config = loadSyncConfig()
    if (!passphrase) return { success: false, message: "Set a passphrase first" }

    onStatus?.("Building export...")
    const payload = await buildExportPayload()
    const encrypted = await encrypt(payload, passphrase)

    const blob = new Blob([encrypted], { type: "application/octet-stream" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "abacus-sync.enc"
    a.click()
    URL.revokeObjectURL(url)

    config.lastSyncedAt = new Date().toISOString()
    saveSyncConfig(config)

    return { success: true, message: "File downloaded — put it in your cloud drive folder" }
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Download failed" }
  }
}

// Debounced auto-sync
let syncTimer: ReturnType<typeof setTimeout> | null = null

export function scheduleAutoSync(passphrase: string, delayMs = 2000) {
  const config = loadSyncConfig()
  if (!config.enabled || !passphrase) return

  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    writeToSyncHandle(passphrase)
  }, delayMs)
}

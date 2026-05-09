import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App"
import { db } from "@/db"
import { loadSyncConfig, scheduleAutoSync } from "@/lib/sync"

// Seed default categories on first run
db.on("ready", async () => {
  await db.seedIfEmpty()
})

// Auto-sync trigger — register hooks on all data tables
function registerSyncHooks() {
  const trigger = () => {
    const config = loadSyncConfig()
    if (config.enabled && config.passphrase) {
      scheduleAutoSync(config.passphrase)
    }
  }
  const tables = [db.accounts, db.categories, db.transactions, db.budgets, db.exchangeRates, db.investmentPlans]
  for (const table of tables) {
    table.hook("creating", trigger)
    table.hook("updating", trigger)
    table.hook("deleting", trigger)
  }
}

registerSyncHooks()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

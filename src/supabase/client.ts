import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/supabase/database.types"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY environment variables")
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey)

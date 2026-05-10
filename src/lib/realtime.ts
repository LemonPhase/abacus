import { supabase } from '@/supabase/client'

type ChangeHandler = (payload: {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: Record<string, unknown>
  old: Record<string, unknown>
}) => void

const channels = new Map<string, () => void>()

export function subscribeToTable(table: string, handler: ChangeHandler): () => void {
  const channelName = `realtime:${table}`

  const existing = channels.get(channelName)
  if (existing) {
    existing()
  }

  const ch = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      (
        payload: {
          eventType: string
          new: Record<string, unknown>
          old: Record<string, unknown>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } & any,
      ) => {
        handler({
          eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          new: payload.new ?? {},
          old: payload.old ?? {},
        })
      },
    )
    .subscribe()

  const cleanup = () => {
    supabase.removeChannel(ch)
    channels.delete(channelName)
  }
  channels.set(channelName, cleanup)

  return cleanup
}

export function unsubscribeAll() {
  for (const cleanup of channels.values()) {
    cleanup()
  }
  channels.clear()
}

import { supabase } from '@/supabase/client'

type ChangeHandler = (payload: {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: Record<string, unknown>
  old: Record<string, unknown>
}) => void

/** supabase-js channel status strings. */
export type RealtimeStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED'

type StatusHandler = (status: RealtimeStatus) => void

// One channel per table, fanned out to every subscriber: multiple components
// (stores, Dashboard/Reports aggregate refetching) can watch the same table
// without the last subscriber silently stealing the channel.
const channels = new Map<
  string,
  { handlers: Set<ChangeHandler>; statusHandlers: Set<StatusHandler>; cleanup: () => void }
>()

export function subscribeToTable(
  table: string,
  handler: ChangeHandler,
  onStatus?: StatusHandler,
): () => void {
  const channelName = `realtime:${table}`

  let entry = channels.get(channelName)
  if (!entry) {
    const handlers = new Set<ChangeHandler>()
    const statusHandlers = new Set<StatusHandler>()
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
          for (const handler of handlers) {
            handler({
              eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
              new: payload.new ?? {},
              old: payload.old ?? {},
            })
          }
        },
      )
      .subscribe((status: string) => {
        const s = status as RealtimeStatus
        for (const statusHandler of statusHandlers) statusHandler(s)
      })

    const cleanup = () => {
      supabase.removeChannel(ch)
      channels.delete(channelName)
    }
    entry = { handlers, statusHandlers, cleanup }
    channels.set(channelName, entry)
  }

  entry.handlers.add(handler)
  if (onStatus) entry.statusHandlers.add(onStatus)
  return () => {
    entry.handlers.delete(handler)
    if (onStatus) entry.statusHandlers.delete(onStatus)
    if (entry.handlers.size === 0) entry.cleanup()
  }
}

export function unsubscribeAll() {
  for (const entry of channels.values()) {
    entry.cleanup()
  }
  channels.clear()
}

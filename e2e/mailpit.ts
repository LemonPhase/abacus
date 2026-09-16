/**
 * Local Supabase's mail server (Mailpit, port 54324) captures every email the
 * stack sends; supabase CLI v2 replaced Inbucket, so we use Mailpit's API.
 * GoTrue rate-limits password-reset emails to 2/hour (supabase/config.toml),
 * so don't re-run this test in a tight loop.
 */
export async function fetchRecoveryLink(email: string): Promise<string> {
  const base = 'http://127.0.0.1:54324/api/v1'

  for (let attempt = 0; attempt < 20; attempt++) {
    const res = await fetch(`${base}/search?query=to:${encodeURIComponent(email)}`)
    if (res.ok) {
      const { messages } = (await res.json()) as { messages?: Array<{ ID: string }> }
      const message = messages?.at(-1)
      if (message) {
        const full = await fetch(`${base}/message/${message.ID}`)
        if (full.ok) {
          const content = JSON.stringify(await full.json())
          const link = content
            .match(/https?:\/\/[^"\\\s<>]+/g)
            ?.find((url) => url.includes('/auth/v1/verify'))
          if (link) return link.replaceAll('&amp;', '&')
        }
      }
    }
    await new Promise((done) => setTimeout(done, 500))
  }
  throw new Error(`No recovery email arrived in Mailpit for ${email} after 10s`)
}

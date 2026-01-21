import React, { useEffect, useState } from 'react'

type SessionSummary = {
  sessionId: string
  createdAt?: string
  sourceLanguage?: string
  targetLanguage?: string
  framesCount?: number
  durationSec?: number
}

export function SessionBrowser(props: {
  apiBase: string
  onLoad: (session: any) => void
}) {
  const [items, setItems] = useState<SessionSummary[]>([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string>('')

  async function refresh() {
    setBusy(true)
    setStatus('Loading list...')
    try {
      const res = await fetch(`${props.apiBase}/session/list?limit=30`)
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`${res.status} ${text}`)
      }
      const data = (await res.json()) as { items: SessionSummary[] }
      setItems(data.items ?? [])
      setStatus('')
    } catch (e: any) {
      setStatus(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  async function load(sessionId: string) {
    setBusy(true)
    setStatus('Loading session...')
    try {
      const res = await fetch(`${props.apiBase}/session/get/${encodeURIComponent(sessionId)}`)
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`${res.status} ${text}`)
      }
      const payload = await res.json()
      props.onLoad(payload)
      setStatus('Loaded')
    } catch (e: any) {
      setStatus(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    refresh().catch(() => {})
  }, [])

  return (
    <div className="session-browser">
      <div className="session-header">
        <div className="session-title">Sessions</div>
        <div className="spacer" />
        <button onClick={refresh} disabled={busy}>
          Refresh
        </button>
      </div>

      {status ? <div className="note">{status}</div> : null}

      <div className="session-list">
        {items.length === 0 ? (
          <div className="note">No sessions yet.</div>
        ) : (
          items.map((it) => (
            <button key={it.sessionId} className="session-item" onClick={() => load(it.sessionId)} disabled={busy}>
              <div className="row">
                <div className="mono">{it.sessionId.slice(0, 8)}…</div>
                <div className="chip">
                  {it.sourceLanguage ?? '?'}→{it.targetLanguage ?? '?'}
                </div>
                <div className="chip">{(it.framesCount ?? 0).toString()}f</div>
                <div className="chip">{(it.durationSec ?? 0).toFixed(1)}s</div>
              </div>
              <div className="muted">{it.createdAt ?? ''}</div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

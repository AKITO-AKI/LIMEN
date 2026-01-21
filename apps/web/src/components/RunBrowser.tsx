import React, { useEffect, useMemo, useState } from 'react'
import { apiRunGet, apiRunList } from '../lib/api'

export function RunBrowser(props: {
  apiBase: string
  onLoadRun: (run: any) => void
}) {
  const [items, setItems] = useState<any[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>('')

  const load = async () => {
    setBusy(true)
    setErr('')
    try {
      const x = await apiRunList(props.apiBase, 50, 0)
      setItems(x)
    } catch (e: any) {
      setErr(e?.message || 'load failed')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    load()
  }, [props.apiBase])

  const onClick = async (runId: string) => {
    setBusy(true)
    setErr('')
    try {
      const full = await apiRunGet(props.apiBase, runId)
      props.onLoadRun(full)
    } catch (e: any) {
      setErr(e?.message || 'load failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="session-browser">
      <div className="session-header">
        <div className="session-title">Runs</div>
        <div className="spacer" />
        <button onClick={load} disabled={busy}>↻</button>
      </div>

      {err ? <div className="note">{err}</div> : null}

      <div className="session-list">
        {items.map((it) => (
          <button key={it.runId} className="session-item" onClick={() => onClick(it.runId)} disabled={busy}>
            <div className="row">
              <span className="mono">{String(it.runId).slice(0, 8)}</span>
              <span className="chip">{it.intent || '—'}</span>
              <span className="chip">{Math.round((it.confidence || 0) * 100)}%</span>
            </div>
            <div className="muted">{it.createdAt}</div>
          </button>
        ))}

        {items.length === 0 ? <div className="note">No runs yet.</div> : null}
      </div>
    </div>
  )
}

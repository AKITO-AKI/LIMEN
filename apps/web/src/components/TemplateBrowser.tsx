import React, { useEffect, useState } from 'react'
import type { Language, Skeleton } from '../lib/types'

type TemplateSummary = {
  templateId: string
  createdAt?: string
  language?: string
  intent?: string
  durationSec?: number
  keyframesCount?: number
  sourceSessionId?: string
}

type TemplatePayload = {
  templateId: string
  createdAt: string
  language: Language
  intent: string
  params?: any
  clipStartSec?: number
  clipEndSec?: number
  keyframes?: any[]
  skeletonClip?: Skeleton
  bvhText?: string
}

function downloadText(filename: string, text: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function TemplateBrowser(props: {
  apiBase: string
  onLoad: (tpl: TemplatePayload) => void
  refreshSignal?: number
}) {
  const [items, setItems] = useState<TemplateSummary[]>([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string>('')
  const [lang, setLang] = useState<Language | ''>('')
  const [help, setHelp] = useState(false)

  async function refresh() {
    setBusy(true)
    setStatus('Loading list...')
    try {
      const qs = new URLSearchParams({ limit: '30' })
      if (lang) qs.set('language', lang)
      const res = await fetch(`${props.apiBase}/template/list?${qs.toString()}`)
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`${res.status} ${text}`)
      }
      const data = (await res.json()) as { items: TemplateSummary[] }
      setItems(data.items ?? [])
      setStatus('')
    } catch (e: any) {
      setStatus(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  async function load(templateId: string) {
    setBusy(true)
    setStatus('Loading template...')
    try {
      const res = await fetch(`${props.apiBase}/template/get/${encodeURIComponent(templateId)}`)
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`${res.status} ${text}`)
      }
      const payload = (await res.json()) as TemplatePayload
      props.onLoad(payload)
      setStatus('Loaded')
    } catch (e: any) {
      setStatus(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  async function downloadBVH(templateId: string) {
    setBusy(true)
    setStatus('Downloading BVH...')
    try {
      const res = await fetch(`${props.apiBase}/template/get/${encodeURIComponent(templateId)}`)
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`${res.status} ${text}`)
      }
      const payload = (await res.json()) as TemplatePayload
      const text = payload.bvhText ?? ''
      if (!text) throw new Error('bvhText missing')
      downloadText(`template_${templateId.slice(0, 8)}.bvh`, text, 'text/plain')
      setStatus('Downloaded')
    } catch (e: any) {
      setStatus(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    refresh().catch(() => {})
  }, [lang, props.refreshSignal])

  return (
    <div className="session-browser">
      <div className="session-header">
        <div className="session-title">Templates</div>
        <button className={help ? 'tab active' : 'tab'} onClick={() => setHelp((h) => !h)} disabled={busy} title="Help">
          ?
        </button>
        <div className="spacer" />
        <label className="note">
          LANG&nbsp;
          <select value={lang} onChange={(e) => setLang(e.target.value as any)} disabled={busy}>
            <option value="">ALL</option>
            <option value="JSL">JSL</option>
            <option value="ASL">ASL</option>
            <option value="CSL">CSL</option>
          </select>
        </label>
        <button onClick={refresh} disabled={busy}>
          Refresh
        </button>
      </div>

      {help ? (
        <div className="helper" style={{ marginTop: 8 }}>
          ① Load a session (right above) → ② In the viewer, open <b>Template</b> → ③ mark start/end and Save.
          <br />
          Templates store a BVH (primary) + a skeleton clip (for in-app preview).
        </div>
      ) : null}

      {status ? <div className="note">{status}</div> : null}

      <div className="session-list">
        {items.length === 0 ? (
          <div className="note">No templates yet.</div>
        ) : (
          items.map((it) => (
            <div key={it.templateId} className="session-item" style={{ cursor: 'default' }}>
              <div className="row">
                <div className="mono">{it.templateId.slice(0, 8)}…</div>
                <div className="chip">{it.language ?? '?'}</div>
                <div className="chip">{it.intent ?? '?'}</div>
                <div className="chip">{(it.durationSec ?? 0).toFixed(2)}s</div>
                <div className="chip">k:{it.keyframesCount ?? 0}</div>
                <div className="spacer" />
                <button onClick={() => load(it.templateId)} disabled={busy}>
                  Load
                </button>
                <button onClick={() => downloadBVH(it.templateId)} disabled={busy}>
                  BVH
                </button>
              </div>
              <div className="muted">{it.createdAt ?? ''}</div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

import React from 'react'
import type { Meaning } from '../lib/types'

function Bar({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div className="bar" aria-label={`${pct}%`}>
      <div style={{ width: `${pct}%` }} />
    </div>
  )
}

export function MeaningView(props: { meaning: Meaning | null }) {
  const m = props.meaning
  if (!m) {
    return <div className="note">Meaningはまだありません（Stage0ではダミーまたはAPIスタブ）。</div>
  }

  return (
    <>
      <div className="kv">
        <div className="k">Intent</div>
        <div className="v">{m.intent}</div>
      </div>

      <div className="kv">
        <div className="k">Confidence</div>
        <div className="v">{Math.round(m.confidence * 100)}%</div>
      </div>

      <div className="kv">
        <div className="k">Intensity</div>
        <div className="v">
          <Bar value={m.params.intensity} />
        </div>
      </div>

      <div className="kv">
        <div className="k">Tempo</div>
        <div className="v">
          <Bar value={m.params.tempo} />
        </div>
      </div>

      <div className="kv">
        <div className="k">Politeness</div>
        <div className="v">
          <Bar value={m.params.politeness} />
        </div>
      </div>

      <div className="helper">{m.rationale ?? '—'}</div>
    </>
  )
}

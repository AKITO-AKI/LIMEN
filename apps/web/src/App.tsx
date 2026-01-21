import React, { useMemo, useState } from 'react'
import { Panel } from './components/Panel'
import { SkeletonCanvas } from './components/SkeletonCanvas'
import { MeaningView } from './components/MeaningView'
import { InputCapture } from './components/InputCapture'
import { SessionBrowser } from './components/SessionBrowser'
import { dummyMeaning, dummySkeleton } from './lib/dummy'
import type { Language, Meaning, Skeleton, Session } from './lib/types'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

async function estimateMeaningViaApi(args: {
  sourceLanguage: Language
  targetLanguage: Language
  inputSkeleton: Skeleton
}): Promise<Meaning> {
  const res = await fetch(`${API_BASE}/meaning/estimate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args)
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API error: ${res.status} ${text}`)
  }
  return await res.json()
}

export default function App() {
  const [sourceLanguage, setSourceLanguage] = useState<Language>('JSL')
  const [targetLanguage, setTargetLanguage] = useState<Language>('ASL')
  const [meaning, setMeaning] = useState<Meaning | null>(() => dummyMeaning('JSL', 'ASL'))
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string>('Stage1: camera + pose/hands + session log')
  const [recorded, setRecorded] = useState<Skeleton | null>(null)
  const [loadedSession, setLoadedSession] = useState<Session | null>(null)

  const outputSkeleton = useMemo(() => {
    // Stage0: output is dummy. Stage5: Meaning → re-encode skeleton.
    return dummySkeleton
  }, [])

  const onDummy = () => {
    setMeaning(dummyMeaning(sourceLanguage, targetLanguage))
    setStatus('Stage0: dummy meaning generated')
  }

  const onApi = async () => {
    setBusy(true)
    setStatus('Calling API...')
    try {
      const inputSkeleton = loadedSession?.inputSkeleton ?? recorded ?? dummySkeleton
      const m = await estimateMeaningViaApi({
        sourceLanguage,
        targetLanguage,
        inputSkeleton
      })
      setMeaning(m)
      setStatus('API: meaning updated')
    } catch (e: any) {
      setStatus(`API failed: ${e?.message ?? String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <header>
        <div className="header-left">
          <div className="title">LIMEN</div>
          <div className="subtitle">Stage 1 — Input / Meaning / Output</div>
        </div>

        <div className="toolbar">
          <label className="note">
            Source&nbsp;
            <select value={sourceLanguage} onChange={(e) => setSourceLanguage(e.target.value as Language)}>
              <option value="JSL">JSL</option>
              <option value="ASL">ASL</option>
              <option value="CSL">CSL</option>
            </select>
          </label>

          <label className="note">
            Target&nbsp;
            <select value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value as Language)}>
              <option value="JSL">JSL</option>
              <option value="ASL">ASL</option>
              <option value="CSL">CSL</option>
            </select>
          </label>

          <button onClick={onDummy} className="primary" disabled={busy}>
            Dummy Meaning
          </button>

          <button onClick={onApi} disabled={busy}>
            Estimate Meaning (API)
          </button>
        </div>
      </header>

      <main>
        <div className="note">{status}</div>

        <div className="grid" style={{ marginTop: 10 }}>
          <Panel title="Input" badge="Stage1: camera + MediaPipe">
            <InputCapture
              sourceLanguage={sourceLanguage}
              targetLanguage={targetLanguage}
              apiBase={API_BASE}
              onRecorded={(s) => setRecorded(s)}
            />

            <div className="split" style={{ marginTop: 10 }}>
              <div>
                <div className="helper">Recorded (Start→Stop→Save)</div>
                {recorded ? (
                  <SkeletonCanvas skeleton={recorded} label="recorded skeleton" />
                ) : (
                  <div className="note">No recording yet. Start → Stop to buffer frames.</div>
                )}
              </div>
              <div>
                <SessionBrowser
                  apiBase={API_BASE}
                  onLoad={(session) => {
                    setLoadedSession(session)
                    setStatus(`Loaded session: ${session?.sessionId ?? ''}`)
                  }}
                />
              </div>
            </div>
          </Panel>

          <Panel title="Meaning Layer" badge="Stage4: intent + params">
            <MeaningView meaning={meaning} />
            <div className="footer">
              <div className="note">API Base: {API_BASE}</div>
            </div>
          </Panel>

          <Panel title="Output" badge="Stage5: meaning → re-encode">
            <SkeletonCanvas skeleton={outputSkeleton} label="dummy output skeleton" />
            <div className="helper">
              Stage0では出力もダミー。Stage5でテンプレ選択＋補正で再構成を入れる。
            </div>
          </Panel>
        </div>
      </main>
    </>
  )
}

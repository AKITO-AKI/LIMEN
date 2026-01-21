import React, { useMemo, useState } from 'react'
import { Panel } from './components/Panel'
import { SkeletonCanvas } from './components/SkeletonCanvas'
import { MeaningView } from './components/MeaningView'
import { InputCapture } from './components/InputCapture'
import { SessionBrowser } from './components/SessionBrowser'
import { SessionViewer } from './components/SessionViewer'
import { TemplateBrowser } from './components/TemplateBrowser'
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

type TemplatePayload = {
  templateId: string
  createdAt: string
  language: Language
  intent: string
  skeletonClip?: Skeleton
  bvhText?: string
}

export default function App() {
  const [sourceLanguage, setSourceLanguage] = useState<Language>('JSL')
  const [targetLanguage, setTargetLanguage] = useState<Language>('ASL')
  const [meaning, setMeaning] = useState<Meaning | null>(() => dummyMeaning('JSL', 'ASL'))
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string>('Stage3: template studio (BVH primary) + replay/export')
  const [recorded, setRecorded] = useState<Skeleton | null>(null)
  const [loadedSession, setLoadedSession] = useState<Session | null>(null)
  const [loadedTemplate, setLoadedTemplate] = useState<TemplatePayload | null>(null)
  const [viewSource, setViewSource] = useState<'recorded' | 'loaded' | 'template'>('recorded')
  const [templateRefresh, setTemplateRefresh] = useState(0)

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
      const inputSkeleton =
        viewSource === 'loaded'
          ? loadedSession?.inputSkeleton ?? recorded ?? dummySkeleton
          : viewSource === 'template'
            ? loadedTemplate?.skeletonClip ?? recorded ?? dummySkeleton
            : recorded ?? dummySkeleton

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

  const activeSkeleton =
    viewSource === 'loaded'
      ? loadedSession?.inputSkeleton ?? null
      : viewSource === 'template'
        ? loadedTemplate?.skeletonClip ?? null
        : recorded

  const activeId =
    viewSource === 'loaded'
      ? loadedSession?.sessionId
      : viewSource === 'template'
        ? loadedTemplate?.templateId
        : undefined

  const filenameStem =
    viewSource === 'loaded'
      ? loadedSession?.sessionId
      : viewSource === 'template'
        ? `template_${loadedTemplate?.templateId?.slice(0, 8) ?? 'x'}`
        : 'recorded'

  return (
    <>
      <header>
        <div className="header-left">
          <div className="title">LIMEN</div>
          <div className="subtitle">Stage 3 — Templates / Replay / Export</div>
        </div>

        <div className="toolbar">
          <label className="note">
            SRC&nbsp;
            <select value={sourceLanguage} onChange={(e) => setSourceLanguage(e.target.value as Language)}>
              <option value="JSL">JSL</option>
              <option value="ASL">ASL</option>
              <option value="CSL">CSL</option>
            </select>
          </label>

          <label className="note">
            TGT&nbsp;
            <select value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value as Language)}>
              <option value="JSL">JSL</option>
              <option value="ASL">ASL</option>
              <option value="CSL">CSL</option>
            </select>
          </label>

          <button onClick={onDummy} className="primary" disabled={busy}>
            Dummy
          </button>

          <button onClick={onApi} disabled={busy}>
            API
          </button>
        </div>
      </header>

      <main>
        <div className="note">{status}</div>

        <div className="grid" style={{ marginTop: 10 }}>
          <Panel title="Input" badge="Stage1: capture / Stage2: replay / Stage3: templates">
            <InputCapture
              sourceLanguage={sourceLanguage}
              targetLanguage={targetLanguage}
              apiBase={API_BASE}
              onRecorded={(s) => {
                setRecorded(s)
                setViewSource('recorded')
              }}
            />

            <div className="split" style={{ marginTop: 10 }}>
              <div>
                <div className="row" style={{ marginBottom: 8, gap: 8 }}>
                  <div className="helper">Replay / Export</div>
                  <div className="spacer" />
                  <button
                    className={viewSource === 'recorded' ? 'tab active' : 'tab'}
                    onClick={() => setViewSource('recorded')}
                    disabled={!recorded}
                  >
                    REC
                  </button>
                  <button
                    className={viewSource === 'loaded' ? 'tab active' : 'tab'}
                    onClick={() => setViewSource('loaded')}
                    disabled={!loadedSession}
                  >
                    LOAD
                  </button>
                  <button
                    className={viewSource === 'template' ? 'tab active' : 'tab'}
                    onClick={() => setViewSource('template')}
                    disabled={!loadedTemplate}
                  >
                    TPL
                  </button>
                </div>

                <SessionViewer
                  title={
                    viewSource === 'template'
                      ? `TPL: ${loadedTemplate?.intent ?? ''}`
                      : viewSource === 'loaded'
                        ? 'LOAD Session'
                        : 'REC Buffer'
                  }
                  sessionId={activeId}
                  skeleton={activeSkeleton}
                  filenameStem={filenameStem}
                  apiBase={API_BASE}
                  defaultTemplateLanguage={sourceLanguage}
                  templateSourceKind={viewSource}
                  onTemplateSaved={() => {
                    setTemplateRefresh((x) => x + 1)
                    setStatus('TPL saved')
                  }}
                />
              </div>

              <div>
                <SessionBrowser
                  apiBase={API_BASE}
                  onLoad={(session) => {
                    setLoadedSession(session)
                    setViewSource('loaded')
                    setStatus(`LOAD session: ${session?.sessionId ?? ''}`)
                  }}
                />

                <div style={{ marginTop: 10 }}>
                  <TemplateBrowser
                    apiBase={API_BASE}
                    refreshSignal={templateRefresh}
                    onLoad={(tpl) => {
                      setLoadedTemplate(tpl)
                      setViewSource('template')
                      setStatus(`LOAD template: ${tpl.templateId.slice(0, 8)}… (${tpl.language} / ${tpl.intent})`)
                    }}
                  />
                </div>
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
            <div className="helper">Stage0では出力もダミー。Stage5でテンプレ選択＋補正で再構成を入れる。</div>
          </Panel>
        </div>
      </main>
    </>
  )
}

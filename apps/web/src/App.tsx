import React, { useEffect, useMemo, useState } from 'react'
import { InputCapture } from './components/InputCapture'
import { MeaningView } from './components/MeaningView'
import { Panel } from './components/Panel'
import { SessionBrowser } from './components/SessionBrowser'
import { SessionViewer } from './components/SessionViewer'
import { TemplateBrowser } from './components/TemplateBrowser'
import { RunBrowser } from './components/RunBrowser'
import { ConsentModal } from './components/ConsentModal'
import { extractFeatures } from './lib/features'
import { apiMeaningEstimate, apiRunSave, apiTemplateFind, apiTemplateGet } from './lib/api'
import { canProceedMeaning, reconstructFromTemplate } from './lib/reconstruct'
import type { Language, Meaning, Skeleton } from './lib/types'

// Stage4+ MVP: API base (local FastAPI server)
const API_BASE = 'http://localhost:8000'

function nowISO() {
  return new Date().toISOString()
}

type Status = {
  kind: 'idle' | 'busy' | 'ok' | 'error'
  text: string
}

export default function App() {
  const [sourceLanguage, setSourceLanguage] = useState<Language>('JSL')
  const [targetLanguage, setTargetLanguage] = useState<Language>('ASL')

  const [consent, setConsent] = useState<boolean>(() => {
    return localStorage.getItem('limen_consent_v1') === '1'
  })

  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(undefined)
  const [inputSkeleton, setInputSkeleton] = useState<Skeleton | null>(null)
  const [meaning, setMeaning] = useState<Meaning | null>(null)
  const [outputSkeleton, setOutputSkeleton] = useState<Skeleton | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle', text: 'Ready' })

  const features = useMemo(() => {
    if (!inputSkeleton) return null
    try {
      return extractFeatures(inputSkeleton)
    } catch {
      return null
    }
  }, [inputSkeleton])

  const canRun = !!consent && !!features && !!inputSkeleton

  async function runPipeline() {
    if (!features) return
    setStatus({ kind: 'busy', text: 'Meaning…' })
    setMeaning(null)
    setOutputSkeleton(null)
    setSelectedTemplateId(null)

    try {
      const m = await apiMeaningEstimate(API_BASE, {
        sourceLanguage,
        targetLanguage,
        features
      })
      setMeaning(m)

      if (!canProceedMeaning(m)) {
        setStatus({ kind: 'ok', text: `Low confidence (${Math.round(m.confidence * 100)}%). Re-record recommended.` })
        return
      }

      setStatus({ kind: 'busy', text: 'Template…' })
      const templateId = await apiTemplateFind(API_BASE, targetLanguage, m.intent)
      if (!templateId) {
        setStatus({ kind: 'error', text: `No template for ${targetLanguage}/${m.intent}` })
        return
      }
      setSelectedTemplateId(templateId)

      const tpl = await apiTemplateGet(API_BASE, templateId)
      const tplClip = tpl?.skeletonClip as Skeleton | undefined
      if (!tplClip || !tplClip.frames || tplClip.frames.length === 0) {
        setStatus({ kind: 'error', text: 'Template is missing skeletonClip' })
        return
      }

      setStatus({ kind: 'busy', text: 'Reconstruct…' })
      const rec = reconstructFromTemplate(tplClip, m.params)
      setOutputSkeleton(rec.skeleton)

      // Stage6: store run log for transparency.
      setStatus({ kind: 'busy', text: 'Saving run…' })
      try {
        await apiRunSave(API_BASE, {
          schemaVersion: '0.1.0',
          createdAt: nowISO(),
          sourceLanguage,
          targetLanguage,
          sourceSessionId: activeSessionId,
          selectedTemplateId: templateId,
          features,
          meaning: m,
          outputSkeleton: rec.skeleton
        })
      } catch {
        // non-fatal
      }

      setStatus({ kind: 'ok', text: `OK: ${m.intent} (${Math.round(m.confidence * 100)}%)` })
    } catch (e: any) {
      setStatus({ kind: 'error', text: e?.message ?? String(e) })
    }
  }

  function onLoadSession(payload: any) {
    const sk = payload?.inputSkeleton as Skeleton | undefined
    if (sk && sk.frames?.length) {
      setInputSkeleton(sk)
      setActiveSessionId(payload?.sessionId)
      setStatus({ kind: 'ok', text: `Session loaded: ${String(payload?.sessionId).slice(0, 8)}` })
    }
  }

  function onLoadRun(payload: any) {
    const m = payload?.meaning as Meaning | undefined
    const out = payload?.outputSkeleton as Skeleton | undefined
    if (m) setMeaning(m)
    if (out) setOutputSkeleton(out)
    setSelectedTemplateId(payload?.selectedTemplateId ?? null)
    setStatus({ kind: 'ok', text: `Run loaded: ${String(payload?.runId).slice(0, 8)}` })
  }

  function acceptConsent() {
    localStorage.setItem('limen_consent_v1', '1')
    setConsent(true)
  }

  return (
    <>
      <ConsentModal open={!consent} onAccept={acceptConsent} />

      <header>
        <div className="header-left">
          <div className="title">LIMEN</div>
          <div className="subtitle">Stage4–6 MVP: meaning → template → reconstruct</div>
        </div>

        <div className="toolbar">
          <select value={sourceLanguage} onChange={(e) => setSourceLanguage(e.target.value as Language)}>
            <option value="JSL">JSL</option>
            <option value="ASL">ASL</option>
            <option value="CSL">CSL</option>
          </select>
          <span className="badge">→</span>
          <select value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value as Language)}>
            <option value="JSL">JSL</option>
            <option value="ASL">ASL</option>
            <option value="CSL">CSL</option>
          </select>

          <button className="primary" onClick={runPipeline} disabled={!canRun || status.kind === 'busy'}>
            RUN
          </button>

          <span className="badge">{status.text}</span>
        </div>
      </header>

      <main>
        <div className="grid">
          <Panel title="Input" badge={inputSkeleton ? `${inputSkeleton.frames.length}f` : '—'}>
            <InputCapture
              sourceLanguage={sourceLanguage}
              targetLanguage={targetLanguage}
              apiBase={API_BASE}
              onRecorded={(sk) => {
                if (sk) {
                  setInputSkeleton(sk)
                  setActiveSessionId(undefined)
                }
              }}
            />

            <div className="split" style={{ marginTop: 12 }}>
              <SessionBrowser apiBase={API_BASE} onLoad={onLoadSession} />
              <RunBrowser apiBase={API_BASE} onLoadRun={onLoadRun} />
            </div>

            <div style={{ marginTop: 12 }}>
              <SessionViewer
                apiBase={API_BASE}
                skeleton={inputSkeleton}
                defaultTemplateLanguage={targetLanguage}
                title="Active"
              />
            </div>
          </Panel>

          <Panel
            title="Meaning"
            badge={meaning ? `${meaning.intent} · ${Math.round(meaning.confidence * 100)}%` : features ? 'features ok' : '—'}
          >
            <MeaningView meaning={meaning} />

            {features ? (
              <div className="template-panel" style={{ marginTop: 12 }}>
                <div className="kv">
                  <div className="k">dur</div>
                  <div className="v">{features.motion.durationSec.toFixed(2)}s</div>
                </div>
                <div className="kv">
                  <div className="k">speed</div>
                  <div className="v">{features.motion.avgSpeed.toFixed(3)}</div>
                </div>
                <div className="kv">
                  <div className="k">hands</div>
                  <div className="v">{Math.round(features.hands.bothHandsRatio * 100)}% both</div>
                </div>
              </div>
            ) : (
              <div className="note">Record or load a session to compute features.</div>
            )}
          </Panel>

          <Panel title="Output" badge={selectedTemplateId ? `tpl ${String(selectedTemplateId).slice(0, 6)}…` : '—'}>
            <SessionViewer apiBase={API_BASE} skeleton={outputSkeleton} defaultTemplateLanguage={targetLanguage} title="Output" />

            <div style={{ marginTop: 12 }}>
              <TemplateBrowser apiBase={API_BASE} onLoadTemplate={(tpl: any) => {
                const clip = tpl?.skeletonClip as Skeleton | undefined
                if (clip && clip.frames?.length) {
                  setOutputSkeleton(clip)
                  setStatus({ kind: 'ok', text: `Template loaded` })
                }
              }} />
            </div>
          </Panel>
        </div>
      </main>
    </>
  )
}

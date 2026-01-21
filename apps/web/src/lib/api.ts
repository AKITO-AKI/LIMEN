import type { Meaning, Skeleton } from './types'
import type { FeatureSummary } from './features'

export type RunPayload = {
  schemaVersion: string
  runId?: string
  createdAt: string
  sourceLanguage: string
  targetLanguage: string
  sourceSessionId?: string
  selectedTemplateId?: string
  features: FeatureSummary
  meaning: Meaning
  outputSkeleton?: Skeleton
  // Stage6+: transparency for non-success paths too.
  result?: {
    status: 'ok' | 'blocked' | 'error'
    reason?: string
  }
}

async function j(url: string, init?: RequestInit) {
  const res = await fetch(url, init)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status} ${res.statusText}: ${text}`)
  }
  return res.json()
}

export async function apiMeaningEstimate(apiBase: string, payload: { sourceLanguage: string; targetLanguage: string; features: FeatureSummary }): Promise<Meaning> {
  return j(`${apiBase}/meaning/estimate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  })
}

export async function apiTemplateFind(apiBase: string, language: string, intent: string): Promise<string | null> {
  const out = await j(`${apiBase}/template/find?language=${encodeURIComponent(language)}&intent=${encodeURIComponent(intent)}`)
  return out.templateId ?? null
}

export async function apiTemplateGet(apiBase: string, templateId: string): Promise<any> {
  return j(`${apiBase}/template/get/${encodeURIComponent(templateId)}`)
}

export async function apiRunSave(apiBase: string, payload: RunPayload): Promise<string> {
  const out = await j(`${apiBase}/run/save`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return out.runId
}

export async function apiRunList(apiBase: string, limit = 50, offset = 0): Promise<any[]> {
  const out = await j(`${apiBase}/run/list?limit=${limit}&offset=${offset}`)
  return out.items ?? []
}

export async function apiRunGet(apiBase: string, runId: string): Promise<any> {
  return j(`${apiBase}/run/get/${encodeURIComponent(runId)}`)
}

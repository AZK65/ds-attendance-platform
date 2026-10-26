// Models the analytics chat is allowed to call. The server rejects anything else.
// Claude Sonnet 4.6 is the default for an omitted choice, the dropdown's first
// selection, and the catalog fallback. OpenRouter's public model list hides
// entries it no longer serves; this list is the fallback when that request fails.

export const DEFAULT_ANALYTICS_MODEL = 'anthropic/claude-sonnet-4.6'

export const ANALYTICS_MODELS = [
  { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' },
  { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
  { id: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5' },
  { id: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5' },
  { id: 'openai/gpt-4.1', label: 'GPT-4.1' },
  { id: 'openai/gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  { id: 'google/gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
] as const

export type AnalyticsModelId = (typeof ANALYTICS_MODELS)[number]['id']

const ALLOWED = new Set<string>(ANALYTICS_MODELS.map(model => model.id))

export function isAllowedAnalyticsModel(model: unknown): model is AnalyticsModelId {
  return typeof model === 'string' && ALLOWED.has(model)
}

// An omitted model uses Claude Sonnet 4.6. A present value must match the
// allowlist exactly — no trimming, prefixes, or silent substitution.
export function resolveAnalyticsModel(model: unknown): AnalyticsModelId | null {
  if (model == null || model === '') return DEFAULT_ANALYTICS_MODEL
  return isAllowedAnalyticsModel(model) ? model : null
}

// `liveIds` null (or empty) means the models catalog could not be read, so the
// full allowlist is shown. The current default stays selectable even when the
// catalog has dropped it.
export function filterLiveModels(liveIds: readonly string[] | null): { id: AnalyticsModelId; label: string }[] {
  if (!liveIds || liveIds.length === 0) return [...ANALYTICS_MODELS]
  const live = new Set(liveIds)
  const filtered = ANALYTICS_MODELS.filter(model => live.has(model.id) || model.id === DEFAULT_ANALYTICS_MODEL)
  return filtered.length > 0 ? [...filtered] : [...ANALYTICS_MODELS]
}

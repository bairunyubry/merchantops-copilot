export const AI_ACTION_DRAFT_KEY = 'merchantops.ai-action-draft.v1'

export interface AiActionDraft {
  findingId: string
  action: string
  reason: string
  verification: string
}

export function saveAiActionDraft(draft: AiActionDraft) {
  sessionStorage.setItem(AI_ACTION_DRAFT_KEY, JSON.stringify(draft))
}

export function readAiActionDraft(): AiActionDraft | null {
  try {
    const raw = sessionStorage.getItem(AI_ACTION_DRAFT_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as AiActionDraft
    return value.findingId && value.action ? value : null
  } catch {
    return null
  }
}

export function clearAiActionDraft() {
  sessionStorage.removeItem(AI_ACTION_DRAFT_KEY)
}

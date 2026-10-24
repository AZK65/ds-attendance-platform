/**
 * What a theory time change is allowed to do.
 * A suppression skips the group post and leaves the existing reminder
 * text alone. Without one, the poller posts and regenerates the reminder
 * the way it always has.
 */

export const SCHEDULE_SUPPRESSION_TTL_MS = 30 * 60 * 1000

export interface TheoryTimeChangePlan {
  postToGroup: boolean
  regenerateReminder: boolean
  updateTheorySession: boolean
  consumeSuppression: boolean
}

export function theoryPollTimeChangePlan(hasActiveSuppression: boolean): TheoryTimeChangePlan {
  if (hasActiveSuppression) {
    return {
      postToGroup: false,
      regenerateReminder: false,
      updateTheorySession: true,
      consumeSuppression: true,
    }
  }
  return {
    postToGroup: true,
    regenerateReminder: true,
    updateTheorySession: false,
    consumeSuppression: false,
  }
}

/** Staff schedule dialog. The checkbox is off by default. */
export function staffTheorySavePlan(skipNotify: boolean): {
  postToGroup: boolean
  regenerateReminder: boolean
  updateTheorySession: boolean
  armSuppression: boolean
} {
  if (skipNotify) {
    return {
      postToGroup: false,
      regenerateReminder: false,
      updateTheorySession: true,
      armSuppression: true,
    }
  }
  return {
    postToGroup: true,
    regenerateReminder: true,
    updateTheorySession: true,
    armSuppression: false,
  }
}

export function suppressionIsActive(
  row: { consumedAt: Date | string | null; expiresAt: Date | string },
  now: Date,
): boolean {
  if (row.consumedAt != null) return false
  return new Date(row.expiresAt).getTime() > now.getTime()
}

export interface TheoryTimeChangeActions {
  syncReminder: () => Promise<unknown>
  notifyGroup: () => Promise<unknown>
  updateTheorySession: () => Promise<unknown>
  consumeSuppression: () => Promise<unknown>
  log: (message: string) => void
}

export async function applyGroupTheoryTimeChange(
  hasActiveSuppression: boolean,
  actions: TheoryTimeChangeActions,
): Promise<{
  posted: boolean
  reminderRegenerated: boolean
  theoryUpdated: boolean
  suppressionConsumed: boolean
}> {
  const plan = theoryPollTimeChangePlan(hasActiveSuppression)
  if (plan.updateTheorySession) await actions.updateTheorySession()
  if (plan.regenerateReminder) await actions.syncReminder()
  if (plan.postToGroup) await actions.notifyGroup()
  if (plan.consumeSuppression) {
    await actions.consumeSuppression()
    actions.log('Schedule update suppressed; reminder left unchanged')
  }
  return {
    posted: plan.postToGroup,
    reminderRegenerated: plan.regenerateReminder,
    theoryUpdated: plan.updateTheorySession,
    suppressionConsumed: plan.consumeSuppression,
  }
}

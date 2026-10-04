export type CarPhase = {
  number: 1 | 2 | 3 | 4
  startModule: number
  endModule: number
}

const CAR_PHASES: CarPhase[] = [
  { number: 1, startModule: 1, endModule: 5 },
  { number: 2, startModule: 6, endModule: 7 },
  { number: 3, startModule: 8, endModule: 10 },
  { number: 4, startModule: 11, endModule: 12 },
]

export function carPhaseForModule(moduleNumber: number): CarPhase {
  const normalized = Math.max(1, Math.min(12, Math.trunc(moduleNumber || 1)))
  return CAR_PHASES.find(phase => normalized <= phase.endModule) || CAR_PHASES[3]
}

export function remainingCarPhaseModules(moduleNumber: number): number {
  const normalized = Math.max(1, Math.min(12, Math.trunc(moduleNumber || 1)))
  return carPhaseForModule(normalized).endModule - normalized + 1
}

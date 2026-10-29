// Class 1 training addresses printed in section 1.2 of the service contract.
// Staff can override each line on Certificate settings. A blank stored value
// prints the default. These are not translated; both language pages use them.

export const CLASS1_DEFAULT_THEORY_ADDRESS = '786 Rue Jean-Talon O, Montréal, QC H3N 1S2'
export const CLASS1_DEFAULT_ROAD_ADDRESS = '3002 Av Jacques-Bureau, Laval, QC H4P 0H3'
export const CLASS1_DEFAULT_CIRCUIT_ADDRESS = '3002 Av Jacques-Bureau, Laval, QC H4P 0H3'

export interface Class1TrainingLocations {
  theory: string
  road: string
  circuit: string
}

export function resolveClass1TrainingLocations(stored?: {
  truckTheoryAddress?: string | null
  truckRoadAddress?: string | null
  truckCircuitAddress?: string | null
} | null): Class1TrainingLocations {
  return {
    theory: storedOrDefault(stored?.truckTheoryAddress, CLASS1_DEFAULT_THEORY_ADDRESS),
    road: storedOrDefault(stored?.truckRoadAddress, CLASS1_DEFAULT_ROAD_ADDRESS),
    circuit: storedOrDefault(stored?.truckCircuitAddress, CLASS1_DEFAULT_CIRCUIT_ADDRESS),
  }
}

function storedOrDefault(value: string | null | undefined, fallback: string): string {
  const trimmed = (value || '').trim()
  return trimmed || fallback
}

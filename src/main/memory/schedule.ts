import { MEMORY_INTERVAL_MS, type MemoryInterval } from '../../shared/types'

/** Son kontrolden beri secilen sure gectiyse (ya da hic calismadiysa) yeni session aranmali. */
export function memoryDue(lastRunAt: number | undefined, every: MemoryInterval, now: number): boolean {
  return !lastRunAt || now - lastRunAt >= (MEMORY_INTERVAL_MS[every] ?? MEMORY_INTERVAL_MS.hourly)
}

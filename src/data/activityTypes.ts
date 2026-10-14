import { Activity, Bike, Footprints, HeartPulse, PersonStanding, Sparkles, Volleyball, Waves, type LucideIcon } from 'lucide-react'
import type { ActivityType } from '../types'

/** `distance`: o campo de distância já aparece aberto para esse tipo. */
export const ACTIVITY_META: Record<ActivityType, { label: string; short: string; icon: LucideIcon; distance: boolean }> = {
  cardio: { label: 'Cardio geral', short: 'Cardio', icon: HeartPulse, distance: false },
  walk: { label: 'Esteira / Caminhada', short: 'Caminhada', icon: Footprints, distance: true },
  run: { label: 'Corrida', short: 'Corrida', icon: Activity, distance: true },
  cycling: { label: 'Ciclismo', short: 'Ciclismo', icon: Bike, distance: true },
  swim: { label: 'Natação', short: 'Natação', icon: Waves, distance: true },
  sport: { label: 'Esporte', short: 'Esporte', icon: Volleyball, distance: false },
  mobility: { label: 'Mobilidade / Alongamento', short: 'Mobilidade', icon: PersonStanding, distance: false },
  other: { label: 'Outro', short: 'Outro', icon: Sparkles, distance: false },
}

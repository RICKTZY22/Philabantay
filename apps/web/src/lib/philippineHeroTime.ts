export type HeroScene = 'morning' | 'afternoon' | 'evening' | 'midnight'

export function heroSceneForHour(hour: number): HeroScene {
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17) return 'evening'
  return 'midnight'
}

import { describe, expect, it } from 'vitest'
import { heroSceneForHour } from '../src/lib/philippineHeroTime'

describe('Philippine-time landing hero scene', () => {
  it.each([
    [0, 'midnight'],
    [4.99, 'midnight'],
    [5, 'morning'],
    [11.99, 'morning'],
    [12, 'afternoon'],
    [16.99, 'afternoon'],
    [17, 'evening'],
    [23.99, 'evening'],
  ] as const)('maps hour %s to %s', (hour, scene) => {
    expect(heroSceneForHour(hour)).toBe(scene)
  })
})

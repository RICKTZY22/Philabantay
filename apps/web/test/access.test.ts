import { describe, expect, it } from 'vitest'
import type { OnboardingRole, Profile, VerificationStatus } from '@barbershop/shared'
import {
  isProfessionalLocked,
  lockedVerificationStatus,
  professionalRoleOf,
} from '../src/lib/access'

type AccessProfile = Pick<Profile, 'requested_role' | 'verification_status'>

function profile(
  requested_role: OnboardingRole | null,
  verification_status: VerificationStatus,
): AccessProfile {
  return { requested_role, verification_status }
}

// Any status that is not exactly `verified` must keep a professional locked.
const LOCKED_STATUSES: VerificationStatus[] = ['unverified', 'pending', 'rejected', 'suspended', 'not_required']
const PROFESSIONAL_ROLES: OnboardingRole[] = ['barber', 'shop_owner']

describe('isProfessionalLocked', () => {
  it('never locks a customer request', () => {
    expect(isProfessionalLocked(profile('customer', 'not_required'))).toBe(false)
    expect(isProfessionalLocked(profile('customer', 'verified'))).toBe(false)
  })

  it('never locks an account with no requested role', () => {
    expect(isProfessionalLocked(profile(null, 'unverified'))).toBe(false)
    expect(isProfessionalLocked(profile(null, 'not_required'))).toBe(false)
  })

  for (const role of PROFESSIONAL_ROLES) {
    it(`unlocks a verified ${role}`, () => {
      expect(isProfessionalLocked(profile(role, 'verified'))).toBe(false)
    })

    for (const status of LOCKED_STATUSES) {
      it(`locks a ${role} whose status is ${status} (fail-closed)`, () => {
        expect(isProfessionalLocked(profile(role, status))).toBe(true)
      })
    }
  }

  it('locks both requested professional roles, not owners only (LR-003)', () => {
    expect(isProfessionalLocked(profile('barber', 'pending'))).toBe(true)
    expect(isProfessionalLocked(profile('shop_owner', 'pending'))).toBe(true)
  })
})

describe('professionalRoleOf', () => {
  it('returns the requested professional role', () => {
    expect(professionalRoleOf(profile('barber', 'pending'))).toBe('barber')
    expect(professionalRoleOf(profile('shop_owner', 'verified'))).toBe('shop_owner')
  })

  it('returns null for customers and un-onboarded accounts', () => {
    expect(professionalRoleOf(profile('customer', 'not_required'))).toBeNull()
    expect(professionalRoleOf(profile(null, 'unverified'))).toBeNull()
  })
})

describe('lockedVerificationStatus', () => {
  it('passes through the recognised locked states', () => {
    expect(lockedVerificationStatus(profile('barber', 'pending'))).toBe('pending')
    expect(lockedVerificationStatus(profile('barber', 'rejected'))).toBe('rejected')
    expect(lockedVerificationStatus(profile('shop_owner', 'suspended'))).toBe('suspended')
    expect(lockedVerificationStatus(profile('shop_owner', 'unverified'))).toBe('unverified')
  })

  it('falls back to unverified for any other status so copy is never blank', () => {
    expect(lockedVerificationStatus(profile('barber', 'verified'))).toBe('unverified')
    expect(lockedVerificationStatus(profile('barber', 'not_required'))).toBe('unverified')
  })
})

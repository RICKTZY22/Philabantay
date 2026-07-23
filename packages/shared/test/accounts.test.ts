import { describe, expect, it } from 'vitest'
import { isOwnerVerificationLocked, isProfessionalVerificationLocked } from '../src/accounts'
import type { OnboardingRole, VerificationStatus } from '../src/types'

function accessProfile(
  requested_role: OnboardingRole | null,
  verification_status: VerificationStatus,
) {
  return { requested_role, verification_status }
}

describe('professional account access', () => {
  it.each([
    ['barber', 'unverified'],
    ['barber', 'pending'],
    ['barber', 'rejected'],
    ['barber', 'suspended'],
    ['barber', 'not_required'],
    ['shop_owner', 'unverified'],
    ['shop_owner', 'pending'],
    ['shop_owner', 'rejected'],
    ['shop_owner', 'suspended'],
    ['shop_owner', 'not_required'],
  ] satisfies Array<[OnboardingRole, VerificationStatus]>)(
    'locks a %s request in the %s state',
    (requestedRole, status) => {
      expect(isProfessionalVerificationLocked(accessProfile(requestedRole, status))).toBe(true)
    },
  )

  it.each([
    ['barber', 'verified'],
    ['shop_owner', 'verified'],
    ['customer', 'not_required'],
    [null, 'unverified'],
  ] satisfies Array<[OnboardingRole | null, VerificationStatus]>)(
    'allows a %s request in the %s state',
    (requestedRole, status) => {
      expect(isProfessionalVerificationLocked(accessProfile(requestedRole, status))).toBe(false)
    },
  )

  it('keeps the owner-only compatibility helper narrow', () => {
    expect(isOwnerVerificationLocked(accessProfile('shop_owner', 'pending'))).toBe(true)
    expect(isOwnerVerificationLocked(accessProfile('barber', 'pending'))).toBe(false)
  })
})

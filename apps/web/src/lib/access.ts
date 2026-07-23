import { isProfessionalVerificationLocked } from '@barbershop/shared'
import type { Profile } from '@barbershop/shared'

/** Roles that must be verified before any operational access is granted. */
export type ProfessionalRole = 'barber' | 'shop_owner'

/** The verification states that keep a professional account locked. */
export type LockedVerificationStatus = 'unverified' | 'pending' | 'rejected' | 'suspended'

/** The minimal profile shape the access rules need. */
export type AccessProfile = Pick<Profile, 'requested_role' | 'verification_status'>

/**
 * Frontend alias for the shared fail-closed access rule. Route guards are UX
 * only; Express and Supabase RLS independently enforce the same decision.
 */
export function isProfessionalLocked(profile: AccessProfile): boolean {
  return isProfessionalVerificationLocked(profile)
}

/** The professional role the account requested, or null for a customer. */
export function professionalRoleOf(profile: AccessProfile): ProfessionalRole | null {
  return profile.requested_role === 'barber' || profile.requested_role === 'shop_owner'
    ? profile.requested_role
    : null
}

/**
 * Normalize a locked profile status for presentation. Values outside the
 * explicit locked states collapse to `unverified` so copy always fails closed.
 */
export function lockedVerificationStatus(profile: AccessProfile): LockedVerificationStatus {
  switch (profile.verification_status) {
    case 'pending':
    case 'rejected':
    case 'suspended':
      return profile.verification_status
    default:
      return 'unverified'
  }
}

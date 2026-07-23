import type { Profile } from './types'

type VerificationAccessProfile = Pick<Profile, 'requested_role' | 'verification_status'>

/**
 * Professional requests are fail-closed until verification is approved.
 *
 * A professional applicant still has `role: 'customer'` while pending, so the
 * requested role (rather than the granted role) is the authoritative signal
 * for this account-wide lock.
 */
export function isProfessionalVerificationLocked(
  profile: VerificationAccessProfile,
): boolean {
  const requestedProfessionalRole = profile.requested_role === 'barber'
    || profile.requested_role === 'shop_owner'
  return requestedProfessionalRole && profile.verification_status !== 'verified'
}

/**
 * Owner requests stay completely locked until the granted account is verified.
 * @deprecated Use `isProfessionalVerificationLocked` for authorization
 * boundaries. This owner-only helper remains for compatibility while the web
 * guard migrates to the professional-wide predicate.
 */
export function isOwnerVerificationLocked(
  profile: VerificationAccessProfile,
): boolean {
  return profile.requested_role === 'shop_owner' && profile.verification_status !== 'verified'
}

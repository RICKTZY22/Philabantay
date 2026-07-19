import type { Profile } from './types'

/**
 * Owner requests stay completely locked until the granted account is verified.
 * Keep this rule shared so the route guard and Express boundary cannot drift.
 */
export function isOwnerVerificationLocked(
  profile: Pick<Profile, 'requested_role' | 'verification_status'>,
): boolean {
  return profile.requested_role === 'shop_owner' && profile.verification_status !== 'verified'
}

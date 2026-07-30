import type { OnboardingRole, Profile } from '@barbershop/shared'

/** Keep every profile-avatar surface on the same requested/granted role rule. */
export function profileAvatarRole(
  profile: Pick<Profile, 'requested_role' | 'role'> | null | undefined,
): OnboardingRole {
  if (profile?.requested_role) return profile.requested_role
  if (profile?.role === 'barber' || profile?.role === 'shop_owner') return profile.role
  return 'customer'
}

/** Isang label lang para pareho ang menu, settings, at future profile cards. */
export function profileRoleLabel(profile: Profile): string {
  const granted = profile.role === 'shop_owner'
    ? 'Shop owner'
    : profile.role === 'barber'
      ? 'Barber'
      : profile.role === 'admin'
        ? 'Admin'
        : 'Customer'

  if (profile.verification_status !== 'pending') return granted
  if (profile.requested_role === 'shop_owner') return 'Shop owner - pending'
  if (profile.requested_role === 'barber') return 'Barber - pending'
  return granted
}

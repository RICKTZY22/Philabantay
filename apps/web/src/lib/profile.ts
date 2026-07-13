import type { Profile } from '@barbershop/shared'

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

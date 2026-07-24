import type { Profile } from '@barbershop/shared'
import type { DoodleIconName } from '../theme/DoodleDefs'

export type MenuItem = {
  to: string
  icon: DoodleIconName
  label: string
  end?: boolean
}

export type MenuContext = {
  eyebrow: string
  title: string
  description: string
  actionLabel: string
  actionTo: string
  icon: DoodleIconName
}

export const OWNER_DASHBOARD_SECTIONS = ['overview', 'reservations', 'staff', 'barbers'] as const
export type OwnerDashboardSection = typeof OWNER_DASHBOARD_SECTIONS[number]

export function isOwnerDashboardSection(value: string | undefined): value is OwnerDashboardSection {
  return OWNER_DASHBOARD_SECTIONS.some((section) => section === value)
}

const CUSTOMER_MENU_ITEMS: MenuItem[] = [
  { to: '/dashboard', icon: 'home', label: 'Home', end: true },
  { to: '/chat', icon: 'chat', label: 'Chats' },
  { to: '/appointments', icon: 'calendar', label: 'Bookings' },
  { to: '/settings', icon: 'gear', label: 'Settings' },
]

const BARBER_MENU_ITEMS: MenuItem[] = [
  { to: '/dashboard', icon: 'home', label: 'Home', end: true },
  { to: '/chat', icon: 'chat', label: 'Chats' },
  { to: '/schedule', icon: 'calendar', label: 'Schedule' },
  { to: '/settings', icon: 'gear', label: 'Settings' },
]

const BARBER_SEEKER_MENU_ITEMS: MenuItem[] = [
  { to: '/dashboard', icon: 'home', label: 'Hiring map', end: true },
  { to: '/settings', icon: 'gear', label: 'Settings' },
]

const SHOP_OWNER_MENU_ITEMS: MenuItem[] = [
  { to: '/dashboard/owner/overview', icon: 'home', label: 'Overview', end: true },
  { to: '/dashboard/owner/reservations', icon: 'calendar', label: 'Reservations', end: true },
  { to: '/dashboard/owner/staff', icon: 'user', label: 'Staff', end: true },
  { to: '/chat', icon: 'chat', label: 'Messages' },
  { to: '/dashboard/owner/barbers', icon: 'scissors', label: 'Barbers', end: true },
  { to: '/settings', icon: 'gear', label: 'Settings' },
]

const ADMIN_MENU_ITEMS: MenuItem[] = [
  { to: '/admin/verifications', icon: 'search', label: 'Verification queue', end: true },
  { to: '/settings/security', icon: 'gear', label: 'Security' },
]

export function getMainMenuItems(profile: Profile): MenuItem[] {
  if (profile.role === 'admin') return ADMIN_MENU_ITEMS
  if (profile.role === 'shop_owner') return SHOP_OWNER_MENU_ITEMS
  if (profile.role === 'barber') return BARBER_MENU_ITEMS
  if (profile.requested_role === 'barber') return BARBER_SEEKER_MENU_ITEMS
  return CUSTOMER_MENU_ITEMS
}

export function getMenuContext(
  pathname: string,
  isBarber: boolean,
  isBarberSeeker = false,
  isShopOwner = false,
): MenuContext {
  if (pathname.startsWith('/admin/')) {
    return {
      eyebrow: 'TRUST & SAFETY',
      title: 'Admin verification',
      description: 'Review professional evidence through the audited AAL2 boundary.',
      actionLabel: 'Open review queue',
      actionTo: '/admin/verifications',
      icon: 'search',
    }
  }
  if (isShopOwner && pathname.startsWith('/dashboard/owner')) {
    return {
      eyebrow: 'SHOP WORKSPACE',
      title: 'Owner dashboard',
      description: 'Reservations, staff, performance, at live shop reports.',
      actionLabel: 'Open messages',
      actionTo: '/chat',
      icon: 'home',
    }
  }
  if (pathname.startsWith('/schedule') || pathname.startsWith('/dashboard/barber')) {
    return {
      eyebrow: 'YOUR ROSTER',
      title: 'Schedule',
      description: 'I-set ang weekly shifts at mga araw na unavailable ka.',
      actionLabel: 'Back to barber home',
      actionTo: '/dashboard',
      icon: 'chair',
    }
  }
  if (pathname.startsWith('/appointments')) {
    return isBarber
      ? {
          eyebrow: 'YOUR SCHEDULE',
          title: 'Booking calendar',
          description: 'Balikan ang iyong chair controls at daily workload.',
          actionLabel: 'Open chair tools',
          actionTo: '/dashboard/barber',
          icon: 'calendar',
        }
      : {
          eyebrow: 'YOUR SCHEDULE',
          title: 'Booking calendar',
          description: 'Balikan ang lahat ng iyong upcoming at past cuts.',
          actionLabel: 'Back to home',
          actionTo: '/dashboard',
          icon: 'calendar',
        }
  }
  if (pathname.startsWith('/chat')) {
    if (isShopOwner) {
      return {
        eyebrow: 'OWNER DESK',
        title: 'Shop conversations',
        description: 'Messages mula sa customers at sarili mong staff.',
        actionLabel: 'View reservations',
        actionTo: '/dashboard/owner/reservations',
        icon: 'chat',
      }
    }
    return isBarber ? {
      eyebrow: 'SHOP DESK',
      title: 'Customer conversations',
      description: 'Bookings at shop inquiries na naka-assign sa iyo.',
      actionLabel: 'View schedule',
      actionTo: '/schedule',
      icon: 'chat',
    } : {
      eyebrow: 'MESSAGES',
      title: 'Shop conversations',
      description: 'Check the schedule connected to your conversations.',
      actionLabel: 'View bookings',
      actionTo: '/appointments',
      icon: 'chat',
    }
  }
  if (pathname.startsWith('/settings')) {
    return {
      eyebrow: 'YOUR ACCOUNT',
      title: 'Settings',
      description: 'Kapag tapos ka na, balik tayo sa iyong home board.',
      actionLabel: 'Back to dashboard',
      actionTo: '/dashboard',
      icon: 'gear',
    }
  }
  if (isBarberSeeker) {
    return {
      eyebrow: 'OPEN TO WORK',
      title: 'Hiring map',
      description: 'Browse nearby shops hiring barbers or enter a shop code.',
      actionLabel: 'View hiring shops',
      actionTo: '/dashboard',
      icon: 'search',
    }
  }
  return {
    ...(isBarber ? {
      eyebrow: 'YOUR CHAIR',
      title: 'Barber home',
      description: 'Check your next shifts, bookings, and customer messages.',
      actionLabel: 'Manage schedule',
      actionTo: '/schedule',
      icon: 'chair' as const,
    } : {
      eyebrow: 'QUICK ACTION',
      title: 'Your bookings',
      description: 'Tingnan ang upcoming at past cuts mo sa isang board.',
      actionLabel: 'View bookings',
      actionTo: '/appointments',
      icon: 'home' as const,
    }),
  }
}

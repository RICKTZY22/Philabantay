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

const CUSTOMER_MENU_ITEMS: MenuItem[] = [
  { to: '/dashboard', icon: 'home', label: 'Home', end: true },
  { to: '/chat', icon: 'chat', label: 'Chats' },
  { to: '/appointments', icon: 'calendar', label: 'Bookings' },
  { to: '/barbers', icon: 'scissors', label: 'Barbers' },
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

export function getMainMenuItems(profile: Profile): MenuItem[] {
  if (profile.role === 'barber') return BARBER_MENU_ITEMS
  if (profile.requested_role === 'barber') return BARBER_SEEKER_MENU_ITEMS
  return CUSTOMER_MENU_ITEMS
}

export function getMenuContext(pathname: string, isBarber: boolean, isBarberSeeker = false): MenuContext {
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
          description: 'Ready ka na ba para sa susunod mong gupit?',
          actionLabel: 'Book another cut',
          actionTo: '/barbers',
          icon: 'calendar',
        }
  }
  if (pathname.startsWith('/chat')) {
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
  if (pathname.startsWith('/barbers') || pathname.startsWith('/shops')) {
    return {
      eyebrow: 'DISCOVER',
      title: 'Find your next cut',
      description: 'Tingnan ang cuts na na-book mo na bago pumili ulit.',
      actionLabel: 'View bookings',
      actionTo: '/appointments',
      icon: 'scissors',
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
      title: 'Explore nearby shops',
      description: 'Hanapin ang barbershop at service na bagay sa iyo.',
      actionLabel: 'Find a barbershop',
      actionTo: '/barbers',
      icon: 'home' as const,
    }),
  }
}

type Destination = {
  to: string
  label: string
  icon:
    | 'home'
    | 'transactions'
    | 'budgets'
    | 'accounts'
    | 'reports'
    | 'recurring'
    | 'investments'
    | 'categories'
    | 'settings'
  mobile: 'primary' | 'more'
  desktop: 'main' | 'footer'
}

export const NAV_LINKS = [
  { to: '/app/dashboard', label: 'Home', icon: 'home', mobile: 'primary', desktop: 'main' },
  {
    to: '/app/transactions',
    label: 'Transactions',
    icon: 'transactions',
    mobile: 'primary',
    desktop: 'main',
  },
  { to: '/app/budgets', label: 'Budgets', icon: 'budgets', mobile: 'primary', desktop: 'main' },
  { to: '/app/accounts', label: 'Accounts', icon: 'accounts', mobile: 'primary', desktop: 'main' },
  { to: '/app/reports', label: 'Reports', icon: 'reports', mobile: 'more', desktop: 'main' },
  { to: '/app/recurring', label: 'Recurring', icon: 'recurring', mobile: 'more', desktop: 'main' },
  {
    to: '/app/investments',
    label: 'Investments',
    icon: 'investments',
    mobile: 'more',
    desktop: 'main',
  },
  {
    to: '/app/categories',
    label: 'Categories',
    icon: 'categories',
    mobile: 'more',
    desktop: 'main',
  },
  { to: '/app/settings', label: 'Settings', icon: 'settings', mobile: 'more', desktop: 'footer' },
] satisfies Destination[]

export const MORE_LINKS = NAV_LINKS.filter((link) => link.mobile === 'more')
export const MORE_LINK = { to: '/app/more', label: 'More', icon: 'more' } as const
export const MOBILE_NAV_LINKS = [
  ...NAV_LINKS.filter((link) => link.mobile === 'primary'),
  MORE_LINK,
]

export function isMoreDestination(pathname: string) {
  return MORE_LINKS.some((link) => link.to === pathname.replace(/\/+$/, ''))
}

export function isMobileNavActive(to: string, pathname: string) {
  return to === pathname.replace(/\/+$/, '') || (to === MORE_LINK.to && isMoreDestination(pathname))
}

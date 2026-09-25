import { ChevronLeft } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { isMoreDestination, MORE_LINK } from '@/lib/navigation'

export default function MobileMoreLink() {
  const { pathname } = useLocation()
  if (!isMoreDestination(pathname)) return null

  return (
    <Link
      to={MORE_LINK.to}
      className="mb-4 inline-flex min-h-11 items-center gap-1 rounded-lg text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
    >
      <ChevronLeft className="size-4" aria-hidden="true" />
      {MORE_LINK.label}
    </Link>
  )
}

import { Link } from 'react-router-dom'
import { FileQuestion } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <FileQuestion className="size-12 text-muted-foreground" />
      <h2 className="mt-4 text-lg font-semibold tracking-tight">Page not found</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        The page you're looking for doesn't exist.
      </p>
      <Link to="/app/dashboard" className={cn(buttonVariants(), 'mt-6')}>
        Go to dashboard
      </Link>
    </div>
  )
}

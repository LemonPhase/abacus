import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function FAB() {
  const navigate = useNavigate()

  return (
    <button
      onClick={() => navigate('/app/transactions?add=true')}
      className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 md:bottom-8 md:right-8"
      aria-label="Add Transaction"
    >
      <Plus className="size-6" />
    </button>
  )
}

import { Check, Loader2 } from 'lucide-react'

interface ProcessingStepProps {
  stage: 'pdf' | 'ai'
}

const STAGES = [
  { id: 'pdf', label: 'Parse PDF' },
  { id: 'ai', label: 'Extract & categorize' },
] as const

export function ProcessingStep({ stage }: ProcessingStepProps) {
  const activeIndex = STAGES.findIndex((s) => s.id === stage)

  return (
    <div className="flex items-center justify-center py-20">
      <div className="space-y-4 w-full max-w-sm">
        {STAGES.map((s, i) => (
          <div key={s.id} className="flex items-center gap-3">
            {i < activeIndex ? (
              <span className="flex size-5 items-center justify-center rounded-full bg-primary/10">
                <Check className="size-3.5 text-primary" />
              </span>
            ) : i === activeIndex ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <span className="size-5 rounded-full border border-border" />
            )}
            <span
              className={i <= activeIndex ? 'text-sm font-medium' : 'text-sm text-muted-foreground'}
            >
              {s.label}
            </span>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Large statements can take a minute — don't close this tab.
        </p>
      </div>
    </div>
  )
}

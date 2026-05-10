import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

import { Checkbox } from '@/components/ui/checkbox'

describe('Checkbox', () => {
  it('renders with data-slot="checkbox"', () => {
    const { container } = render(<Checkbox />)
    const checkbox = container.querySelector('[data-slot="checkbox"]')
    expect(checkbox).toBeInTheDocument()
  })

  it('renders indicator inside when checked', () => {
    const { container } = render(<Checkbox checked />)
    const indicator = container.querySelector('[data-slot="checkbox-indicator"]')
    expect(indicator).toBeInTheDocument()
  })

  it('accepts custom className', () => {
    const { container } = render(<Checkbox className="my-custom-class" />)
    const checkbox = container.querySelector('[data-slot="checkbox"]')
    expect(checkbox).toHaveClass('my-custom-class')
  })

  it('renders with checked state', () => {
    const { container } = render(<Checkbox checked />)
    const checkbox = container.querySelector('[data-slot="checkbox"]')
    expect(checkbox).toBeInTheDocument()
  })

  it('renders as disabled', () => {
    const { container } = render(<Checkbox disabled />)
    const checkbox = container.querySelector('[data-slot="checkbox"]')
    expect(checkbox).toBeInTheDocument()
  })
})

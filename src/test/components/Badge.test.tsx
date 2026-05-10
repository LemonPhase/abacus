import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { Badge } from '@/components/ui/badge'

describe('Badge', () => {
  it('renders with default variant', () => {
    const { container } = render(<Badge>Default</Badge>)
    const badge = container.querySelector('span')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveAttribute('data-variant', 'default')
  })

  it('renders children text', () => {
    render(<Badge>Hello World</Badge>)
    expect(screen.getByText('Hello World')).toBeInTheDocument()
  })

  it('accepts custom className', () => {
    const { container } = render(<Badge className="my-custom-class">Styled</Badge>)
    const badge = container.querySelector('span')
    expect(badge).toHaveClass('my-custom-class')
  })

  it('renders with variant="secondary"', () => {
    const { container } = render(<Badge variant="secondary">Secondary</Badge>)
    const badge = container.querySelector('span')
    expect(badge).toHaveAttribute('data-variant', 'secondary')
  })

  it('renders with variant="destructive"', () => {
    const { container } = render(<Badge variant="destructive">Destructive</Badge>)
    const badge = container.querySelector('span')
    expect(badge).toHaveAttribute('data-variant', 'destructive')
  })

  it('renders with data-slot="badge" attribute', () => {
    const { container } = render(<Badge>Badge</Badge>)
    const badge = container.querySelector('span')
    expect(badge).toHaveAttribute('data-slot', 'badge')
  })
})

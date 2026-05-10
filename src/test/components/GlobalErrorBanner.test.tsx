import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GlobalErrorBanner from '@/components/GlobalErrorBanner'
import { useAccountsStore } from '@/stores/accountsStore'
import { useCategoriesStore } from '@/stores/categoriesStore'

describe('GlobalErrorBanner', () => {
  beforeEach(() => {
    act(() => {
      useAccountsStore.getState().clearError()
      useCategoriesStore.getState().clearError()
    })
  })

  it('renders nothing when there are no errors', () => {
    const { container } = render(<GlobalErrorBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('renders an error message when a store has an error', () => {
    act(() => {
      useAccountsStore.setState({ error: 'Failed to load accounts' })
    })

    render(<GlobalErrorBanner />)
    expect(screen.getByText('Failed to load accounts')).toBeInTheDocument()
  })

  it('clears the error when the close button is clicked', async () => {
    const user = userEvent.setup()

    act(() => {
      useCategoriesStore.setState({ error: 'Categories error' })
    })

    render(<GlobalErrorBanner />)
    expect(screen.getByText('Categories error')).toBeInTheDocument()

    const closeButton = screen.getByRole('button')
    await user.click(closeButton)

    expect(useCategoriesStore.getState().error).toBeNull()
  })

  it('renders multiple errors if multiple stores fail', () => {
    act(() => {
      useAccountsStore.setState({ error: 'Error 1' })
      useCategoriesStore.setState({ error: 'Error 2' })
    })

    render(<GlobalErrorBanner />)
    expect(screen.getByText('Error 1')).toBeInTheDocument()
    expect(screen.getByText('Error 2')).toBeInTheDocument()
  })
})

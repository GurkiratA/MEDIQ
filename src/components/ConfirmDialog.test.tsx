import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { confirmBus } from '../state/confirmBus'
import { ConfirmDialog } from './ConfirmDialog'

const base = {
  open: true,
  title: 'Save clinician-confirmed visit note',
  target: 'Patient 104',
  source: 'Typed by user',
  exactContent: 'Final note text',
  confirmLabel: 'Confirm & save note',
  onCancel: () => {},
}

describe('ConfirmDialog (human review gate)', () => {
  it('cannot confirm until the reviewer ticks the review checkbox', async () => {
    const onConfirm = vi.fn()
    render(<ConfirmDialog {...base} onConfirm={onConfirm} gestureAllowed />)
    const btn = screen.getByRole('button', { name: 'Confirm & save note' })
    expect(btn).toBeDisabled()
    await userEvent.click(btn)
    expect(onConfirm).not.toHaveBeenCalled()
    // A gesture cannot confirm before review either.
    expect(confirmBus.tryGestureConfirm()).toBe('not-reviewed')
    await userEvent.click(screen.getByRole('checkbox', { name: /I have reviewed/ }))
    await userEvent.click(btn)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('shows the exact content that will be saved, and cancel is always available', async () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog {...base} onCancel={onCancel} onConfirm={() => {}} />)
    expect(screen.getByText('Final note text')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('never lets a gesture confirm profile-management dialogs', async () => {
    const onConfirm = vi.fn()
    render(<ConfirmDialog {...base} confirmLabel="Authorize this doctor" onConfirm={onConfirm} gestureAllowed={false} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /I have reviewed/ }))
    expect(confirmBus.tryGestureConfirm()).toBe('not-allowed')
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('surfaces save failures instead of closing silently', async () => {
    render(<ConfirmDialog {...base} onConfirm={() => Promise.reject(new Error('Disk full'))} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /I have reviewed/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm & save note' }))
    expect(await screen.findByText('Disk full')).toBeInTheDocument()
  })
})

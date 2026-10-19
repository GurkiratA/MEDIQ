import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Modal } from './ui'

function ModalWithInput() {
  const [name, setName] = useState('')
  // In the real bug, an inline function onClose was passed which changed on every render:
  return (
    <Modal open onClose={() => {}} title="Test Modal">
      <input
        aria-label="Display Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
    </Modal>
  )
}

describe('Modal input focus stability', () => {
  it('keeps focus on input while typing words with spaces and does not jump to close button', async () => {
    render(<ModalWithInput />)
    const input = screen.getByLabelText('Display Name')
    await userEvent.click(input)
    expect(input).toHaveFocus()

    // Type full name containing multiple spaces
    await userEvent.type(input, 'Dr. Sarah Connor MD')
    
    // Value must be fully typed without needing to click back into the input
    expect(input).toHaveValue('Dr. Sarah Connor MD')
    // Focus must stay on the input, never stolen by the modal close button
    expect(input).toHaveFocus()
  })
})

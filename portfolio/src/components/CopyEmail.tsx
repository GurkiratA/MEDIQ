'use client'

import { useState } from 'react'

/** Copies the address; falls back to opening the mail client. */
export function CopyEmail({ email }: { email: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      window.location.href = `mailto:${email}`
    }
  }

  return (
    <>
      <button type="button" className="btn btn--line" onClick={copy}>
        {copied ? 'Copied' : 'Copy address'}
      </button>
      <span className="visually-hidden" role="status" aria-live="polite">
        {copied ? 'Email address copied to the clipboard' : ''}
      </span>
    </>
  )
}

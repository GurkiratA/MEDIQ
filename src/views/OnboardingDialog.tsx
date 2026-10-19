import { Crown, FlaskConical, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Button, Modal } from '../components/ui'
import { useData, useSnap } from '../state/DataContext'
import { EnrollmentWizard } from './EnrollmentWizard'

/** First-launch prompt to enroll the owner. Can be skipped; voice commands then stay locked. */
export function OnboardingDialog() {
  const snap = useSnap()
  const { saveSettings } = useData()
  const [wizard, setWizard] = useState(false)
  const needsOwner = !snap.doctors.some((d) => d.role === 'Owner')
  const open = needsOwner && !snap.settings.onboardingDismissed && !wizard
  const dismiss = () => void saveSettings({ ...snap.settings, onboardingDismissed: true })

  return (
    <>
      <Modal
        open={open}
        onClose={dismiss}
        title="Welcome to MEDIQ"
        footer={
          <>
            <Button variant="ghost" onClick={dismiss}>
              Skip for now
            </Button>
            <Button variant="primary" icon={<Crown className="size-4" />} onClick={() => setWizard(true)}>
              Enroll owner voice
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-ink-muted">
          <p>
            MEDIQ is a <span className="font-semibold text-sim">hackathon prototype</span> with <span className="font-semibold text-ink">synthetic patient data only</span>. It is not a medical device and makes no clinical decisions.
          </p>
          <p className="flex gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-cyan" />
            Voice commands run only after on-device speaker verification. Enroll yourself as the owner to unlock them — you will read three short phrases. Raw audio is never stored.
          </p>
          <p className="flex gap-2">
            <FlaskConical className="mt-0.5 size-4 shrink-0 text-sim" />
            No microphone, or a noisy room? Everything else works manually, and the Demo Quick-Sim menu shows the expected verification behaviour (clearly labelled as simulation).
          </p>
        </div>
      </Modal>
      {wizard && (
        <EnrollmentWizard
          mode={{ kind: 'owner' }}
          onClose={() => {
            setWizard(false)
            dismiss()
          }}
        />
      )}
    </>
  )
}

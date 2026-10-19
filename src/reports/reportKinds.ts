export const REPORT_KINDS = ['summary', 'visit', 'medications', 'labs', 'vitals'] as const
export type ReportKind = (typeof REPORT_KINDS)[number]

export const REPORT_TITLE: Record<ReportKind, string> = {
  summary: 'Clinical summary',
  visit: 'Latest visit note',
  medications: 'Medication report',
  labs: 'Laboratory report',
  vitals: 'Vital signs',
}

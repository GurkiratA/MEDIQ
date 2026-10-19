/** The intro plays once per browser-tab session; `?intro` in the URL forces it. */
const SEEN_KEY = 'mediq.introSeen'

export function introAlreadySeen(): boolean {
  try {
    if (new URLSearchParams(window.location.search).has('intro')) return false
    return sessionStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

export function markSeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* storage unavailable: intro may replay on reload */
  }
}

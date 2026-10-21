import { ImageResponse } from 'next/og'
import { profile } from '@/content/site'

export const dynamic = 'force-static'
export const alt = `${profile.name} — ${profile.role}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Light editorial card: ivory paper, ink rule, cobalt accent.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '60px 72px',
          background: '#f6f3ec',
          color: '#15140f',
          fontFamily: 'serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            paddingTop: 14,
            borderTop: '2px solid #15140f',
            fontSize: 22,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: '#6b6860',
          }}
        >
          <span>Portfolio</span>
          <span>
            {profile.field}, {profile.school}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 156, letterSpacing: '-0.04em', lineHeight: 0.95 }}>{profile.name}</div>
          <div style={{ display: 'flex', width: 120, height: 4, background: '#2340b5', marginTop: 36 }} />
          <div style={{ fontSize: 38, marginTop: 28, color: '#45433d', maxWidth: 900, lineHeight: 1.25 }}>
            {profile.headline}
          </div>
        </div>
      </div>
    ),
    size,
  )
}

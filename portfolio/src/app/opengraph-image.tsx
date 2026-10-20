import { ImageResponse } from 'next/og'
import { profile } from '@/content/site'

export const dynamic = 'force-static'
export const alt = `${profile.name} — ${profile.role}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Concentric "contour" rings echoing the hero, drawn as plain SVG.
const rings = Array.from({ length: 9 }, (_, i) => {
  const r = 40 + i * 34
  return `<ellipse cx="930" cy="250" rx="${r * 1.25}" ry="${r}" transform="rotate(-18 930 250)" fill="none" stroke="${
    i === 1 ? '#5fd4f4' : '#ece9e2'
  }" stroke-opacity="${i === 1 ? 0.9 : 0.12 + (i % 3 === 0 ? 0.1 : 0)}" stroke-width="${i % 3 === 0 ? 2 : 1.25}"/>`
}).join('')
const svg = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">${rings}</svg>`,
)}`

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
          padding: '64px 72px',
          background: '#0a0b0d',
          color: '#ece9e2',
          position: 'relative',
        }}
      >
        <img src={svg} width={1200} height={630} alt="" style={{ position: 'absolute', top: 0, left: 0 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 24, color: '#b4b1aa' }}>
          <div style={{ width: 12, height: 12, background: '#5fd4f4' }} />
          {profile.role} · {profile.school}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 150, fontWeight: 700, letterSpacing: '-0.05em', lineHeight: 0.9 }}>{profile.name}</div>
          <div style={{ fontSize: 40, marginTop: 28, color: '#b4b1aa', maxWidth: 820 }}>{profile.headline}</div>
        </div>
      </div>
    ),
    size,
  )
}

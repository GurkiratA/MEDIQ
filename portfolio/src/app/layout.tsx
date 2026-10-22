import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { Footer } from '@/components/Footer'
import { Nav } from '@/components/Nav'
import { Reveal } from '@/components/Reveal'
import { profile, site } from '@/content/site'
import './globals.css'

const serif = localFont({
  src: [
    { path: '../fonts/Newsreader-wght.woff2', weight: '200 800', style: 'normal' },
    { path: '../fonts/Newsreader-wght-italic.woff2', weight: '200 800', style: 'italic' },
  ],
  variable: '--f-serif',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
})

const sans = localFont({
  src: '../fonts/Inter-wght.woff2',
  weight: '100 900',
  variable: '--f-sans',
  display: 'swap',
  adjustFontFallback: 'Arial',
})

const mono = localFont({
  src: '../fonts/JetBrainsMono-wght.woff2',
  weight: '100 800',
  variable: '--f-mono',
  display: 'swap',
  adjustFontFallback: false,
  preload: false,
  fallback: ['ui-monospace', 'Menlo', 'Consolas', 'monospace'],
})

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: site.title, template: `%s — ${profile.name}` },
  description: site.description,
  applicationName: profile.name,
  authors: [{ name: profile.name }],
  creator: profile.name,
  keywords: [
    profile.name,
    'software engineer',
    'computer science',
    'University of Guelph',
    'portfolio',
    'internship',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: profile.name,
    title: site.title,
    description: site.description,
    locale: 'en_CA',
  },
  twitter: {
    card: 'summary_large_image',
    title: site.title,
    description: site.description,
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: '#ece4d3',
  colorScheme: 'light',
}

// Marks the document as JS-capable before first paint, so reveal-on-scroll
// styles only ever hide content when the script that un-hides it can run.
const jsFlag = `document.documentElement.classList.add('js')`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: jsFlag }} />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Nav />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <Footer />
        <Reveal />
      </body>
    </html>
  )
}

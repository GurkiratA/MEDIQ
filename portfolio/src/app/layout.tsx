import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { profile, site } from '@/content/site'
import './globals.css'

const display = localFont({
  src: '../fonts/BricolageGrotesque-wdth.woff2',
  weight: '200 800',
  style: 'normal',
  variable: '--f-display',
  display: 'swap',
  declarations: [{ prop: 'font-stretch', value: '75% 100%' }],
  adjustFontFallback: 'Arial',
})

const body = localFont({
  src: '../fonts/Inter-wght.woff2',
  weight: '100 900',
  variable: '--f-body',
  display: 'swap',
  adjustFontFallback: 'Arial',
})

const mono = localFont({
  src: '../fonts/JetBrainsMono-wght.woff2',
  weight: '100 800',
  variable: '--f-mono',
  display: 'swap',
  adjustFontFallback: false,
  fallback: ['ui-monospace', 'Menlo', 'Consolas', 'monospace'],
})

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: site.title,
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
  themeColor: '#0a0b0d',
  colorScheme: 'dark',
}

// Marks the document as JS-capable before first paint, so reveal-on-scroll
// styles only ever hide content when the script that un-hides it can run.
const jsFlag = `document.documentElement.classList.add('js')`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: jsFlag }} />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  )
}

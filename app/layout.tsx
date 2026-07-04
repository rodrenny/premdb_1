import type { Metadata } from 'next'
import { Anton, IBM_Plex_Mono, Inter } from 'next/font/google'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
})

// Display face for titles only — the marquee poster voice, used sparingly.
const anton = Anton({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
})

// Numerals: every rating, prediction, point value, and rank.
const plexMono = IBM_Plex_Mono({
  weight: ['400', '500', '600'],
  subsets: ['latin'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'PreMDB — Predict unreleased movie ratings',
  description:
    'A game where you predict the eventual IMDb rating of unreleased movies.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${anton.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col bg-background font-sans text-foreground">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  )
}

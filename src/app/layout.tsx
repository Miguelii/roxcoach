import type { Metadata, Viewport } from 'next'
import { Anton, Geist, Geist_Mono } from 'next/font/google'
import '@/styles/globals.css'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { Toaster } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'
import { TrpcContextProvider } from '@/providers/trpc-provider'

const geistSans = Geist({
    variable: '--font-geist-sans',
    subsets: ['latin'],
    display: 'swap',
})

const geistMono = Geist_Mono({
    variable: '--font-geist-mono',
    subsets: ['latin'],
    display: 'swap',
})

const anton = Anton({
    variable: '--font-anton',
    weight: '400',
    subsets: ['latin'],
    display: 'swap',
})

export const viewport: Viewport = {
    colorScheme: 'light',
    width: 'device-width',
    initialScale: 1,
    // Lets the page use the safe areas of a notched phone when it runs as an installed app.
    viewportFit: 'cover',
    themeColor: '#f7f4ee',
}

export const metadata: Metadata = {
    title: { default: 'Roxcoach', template: '%s | Roxcoach' },
    description: 'A personal training assistant for Hyrox and running.',
    robots: { index: false, follow: false },
    icons: { apple: '/apple-touch-icon.png' },
    appleWebApp: { capable: true, title: 'Roxcoach', statusBarStyle: 'default' },
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
    return (
        <html
            lang="en"
            className={cn(
                geistSans.variable,
                geistMono.variable,
                anton.variable,
                'h-full antialiased'
            )}
        >
            <body className="min-h-full bg-background font-sans text-foreground">
                <NuqsAdapter>
                    <TrpcContextProvider>{children}</TrpcContextProvider>
                </NuqsAdapter>
                <Toaster />
            </body>
        </html>
    )
}

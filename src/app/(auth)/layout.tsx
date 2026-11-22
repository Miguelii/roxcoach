import { AuthVideo } from '@/modules/auth/auth-video'

export default function AuthLayout({ children }: LayoutProps<'/'>) {
    return (
        <div className="grid min-h-dvh lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <aside className="hidden bg-paper lg:block">
                <div className="sticky top-0 h-dvh">
                    <AuthVideo />
                </div>
            </aside>
            <main className="flex items-center justify-center bg-paper px-5 py-12 lg:border-l lg:border-hairline lg:bg-card lg:px-12">
                {children}
            </main>
        </div>
    )
}

import Link from 'next/link'
import { connection } from 'next/server'
import { SIGNUP_PAGE_PATH } from '@/_bff/core/constants/auth.constants'
import { ServerEnv } from '@/env/server'

// Sign-up opens when NEXT_SIGNUP_ACCESS_CODE is set, read per request like the sign-up page, so this
// stays out of the static shell of the login page.
export async function SignupLink() {
    await connection()
    if (ServerEnv.NEXT_SIGNUP_ACCESS_CODE === undefined) return null

    return (
        <p className="mt-6 text-center text-sm text-muted-foreground">
            Have an access code?{' '}
            <Link data-testid="signup-link" href={SIGNUP_PAGE_PATH} className="text-ink underline">
                Create an account
            </Link>
        </p>
    )
}

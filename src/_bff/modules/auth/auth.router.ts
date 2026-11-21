import 'server-only'

import { router } from '@/_bff/trpc/server'
import { SB_LOGIN_PUBLIC_CONTROLLER } from '@/_bff/modules/auth/controllers/sb-login.controller'
import { SB_LOGOUT_PUBLIC_CONTROLLER } from '@/_bff/modules/auth/controllers/sb-logout.controller'
import { SB_SIGN_UP_PUBLIC_CONTROLLER } from '@/_bff/modules/auth/controllers/sb-sign-up.controller'

export const AUTH_ROUTER = router({
    login: SB_LOGIN_PUBLIC_CONTROLLER,
    logout: SB_LOGOUT_PUBLIC_CONTROLLER,
    signUp: SB_SIGN_UP_PUBLIC_CONTROLLER,
})

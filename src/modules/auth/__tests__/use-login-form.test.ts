import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useLoginForm } from '@/modules/auth/use-login-form'

const setup = (email: string, password: string) => {
    const { result } = renderHook(() => useLoginForm())
    act(() => {
        result.current.setValue('email', email)
        result.current.setValue('password', password)
    })
    return result
}

describe('useLoginForm', () => {
    it('rejects an invalid email with a message', async () => {
        const result = setup('not-an-email', 'secret')
        await act(async () => {
            await result.current.trigger()
        })
        expect(result.current.getFieldState('email').error?.message).toBeTruthy()
        expect(result.current.getFieldState('password').error).toBeUndefined()
    })

    it('rejects an empty password with a message', async () => {
        const result = setup('coach@example.com', '')
        await act(async () => {
            await result.current.trigger()
        })
        expect(result.current.getFieldState('password').error?.message).toBeTruthy()
        expect(result.current.getFieldState('email').error).toBeUndefined()
    })

    it('accepts valid values', async () => {
        const result = setup('coach@example.com', 'secret')
        let valid = false
        await act(async () => {
            valid = await result.current.trigger()
        })
        expect(valid).toBe(true)
        expect(result.current.getFieldState('email').error).toBeUndefined()
        expect(result.current.getFieldState('password').error).toBeUndefined()
    })
})

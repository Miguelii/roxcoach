export type TrpcKeyed = {
    queryKey?: ReadonlyArray<object>
    mutationKey?: ReadonlyArray<object>
}

type Routes = Partial<Record<string, () => object>>

// Dotted procedure path ('athlete.getProfile') of the options or filter a component hands to
// TanStack Query.
function trpcPath({ queryKey, mutationKey }: TrpcKeyed): string {
    const path = (queryKey ?? mutationKey)?.[0]
    return Array.isArray(path) ? path.join('.') : ''
}

// Calls the fake registered for the procedure behind `keyed`. Has no imports, so
// `vi.mock('@tanstack/react-query', ...)` factories can load it.
export function routeTrpc(routes: Routes, keyed: TrpcKeyed): object | undefined {
    return routes[trpcPath(keyed)]?.()
}

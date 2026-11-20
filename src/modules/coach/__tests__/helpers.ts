const encoder = new TextEncoder()

export type Controlled = {
    response: Response
    push: (chunk: string) => void
    pushBytes: (chunk: Uint8Array) => void
    close: () => void
}

// A 200 NDJSON response whose chunks the test pushes by hand.
export const controlledStream = (): Controlled => {
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({
        start(c) {
            controller = c
        },
    })
    return {
        response: new Response(body, { status: 200 }),
        push: (chunk) => controller.enqueue(encoder.encode(chunk)),
        pushBytes: (chunk) => controller.enqueue(chunk),
        close: () => controller.close(),
    }
}

export const ndjson = (...events: object[]) => events.map((e) => `${JSON.stringify(e)}\n`).join('')

// A complete 200 response made of the given byte chunks.
export const streamOfBytes = (...chunks: Uint8Array[]) => {
    const stream = controlledStream()
    chunks.forEach((chunk) => stream.pushBytes(chunk))
    stream.close()
    return stream.response
}

// A complete 200 response made of the given text chunks.
export const streamOf = (...chunks: string[]) =>
    streamOfBytes(...chunks.map((chunk) => encoder.encode(chunk)))

export const jsonStatus = (status: number) => Response.json({ error: 'x' }, { status })

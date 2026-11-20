import type { CoachTool } from '@/_bff/modules/coach/types'

export type CoachMessage = { role: 'user' | 'assistant'; content: string }

export type CoachStreamEvent =
    | { type: 'text'; delta: string }
    | {
          type: 'done'
          usage: { promptTokens: number | null; completionTokens: number | null }
      }
    | { type: 'model'; modelId: string; switchedFrom: string | null }
    | { type: 'error'; kind: 'rate_limited' | 'unavailable' | 'blocked' }

export type CoachModelRequest = {
    system: string
    messages: CoachMessage[]
    tools: CoachTool[]
    maxSteps: number
    signal: AbortSignal
}

export interface CoachModel {
    readonly modelId: string
    stream(request: CoachModelRequest): AsyncIterable<CoachStreamEvent>
}

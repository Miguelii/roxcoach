import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { ZeppJson } from '@/_bff/modules/zepp/types'

export const readMock = (name: string): ZeppJson =>
    JSON.parse(readFileSync(path.resolve(process.cwd(), 'mocks', name), 'utf8'))

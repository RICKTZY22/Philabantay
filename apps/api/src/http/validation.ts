import type { Request } from 'express'
import type { ZodType } from 'zod'

export function parseBody<T>(request: Request, schema: ZodType<T>): T {
  return schema.parse(request.body)
}

export function parseParams<T>(request: Request, schema: ZodType<T>): T {
  return schema.parse(request.params)
}

export function parseQuery<T>(request: Request, schema: ZodType<T>): T {
  return schema.parse(request.query)
}

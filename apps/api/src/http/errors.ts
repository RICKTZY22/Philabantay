import type { ErrorRequestHandler, RequestHandler } from 'express'
import type { PostgrestError } from '@supabase/supabase-js'
import { ZodError } from 'zod'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function fromDatabaseError(error: PostgrestError): ApiError {
  if (error.code === 'PGRST116') return new ApiError(404, 'not_found', 'Resource not found.')
  if (error.code === 'P0002') return new ApiError(404, 'not_found', error.message)
  if (error.code === 'P4090') return new ApiError(409, 'stale_appointment', error.message)
  if (error.code === '23505') return new ApiError(409, 'conflict', 'That record already exists.')
  if (error.code === '23P01') return new ApiError(409, 'slot_taken', 'That appointment slot is already taken.')
  if (error.code === '23503' || error.code === '23514' || error.code === '22P02' || error.code === '22023') {
    return new ApiError(400, 'validation', error.message)
  }
  if (error.code === '42501') return new ApiError(403, 'forbidden', 'You are not allowed to perform this action.')
  return new ApiError(500, 'database_error', 'The database request failed.')
}

export function requireData<T>(data: T | null, error: PostgrestError | null): T {
  if (error) throw fromDatabaseError(error)
  if (data === null) throw new ApiError(404, 'not_found', 'Resource not found.')
  return data
}

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(new ApiError(404, 'route_not_found', `No route for ${request.method} ${request.originalUrl}.`))
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (typeof error === 'object' && error !== null
    && 'type' in error && error.type === 'entity.parse.failed') {
    response.status(400).json({
      error: { code: 'invalid_json', message: 'Request body contains invalid JSON.' },
    })
    return
  }

  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: 'validation',
        message: 'Request validation failed.',
        details: error.issues,
      },
    })
    return
  }

  if (error instanceof ApiError) {
    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    })
    return
  }

  const message = error instanceof Error ? error.message : 'Unknown error'
  if (process.env.NODE_ENV !== 'test') console.error(error)
  response.status(500).json({
    error: {
      code: 'internal_error',
      message: 'An unexpected server error occurred.',
      ...(process.env.NODE_ENV === 'development' ? { details: message } : {}),
    },
  })
}

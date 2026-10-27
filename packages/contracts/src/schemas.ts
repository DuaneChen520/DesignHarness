/**
 * Runtime guards for the payloads the components consume.
 *
 * These zod schemas are written by hand on purpose: zod is the guard the app
 * runs, OpenAPI is the contract the origin publishes, and the two only stay
 * honest because `test/contract-drift.test.ts` compares every property name and
 * every `required` entry against the authored `components.schemas`. That test is
 * the anti-drift gate: change a contract without changing the guard and the
 * suite fails, which is exactly the failure mode a hand-kept `handlers.ts`
 * would have hidden.
 */
import { z } from 'zod';

/** Status codes the `Error` envelope may carry, from the contract's `code` pattern. */
export const POSITION_STATUSES = ['open', 'closed', 'pending'] as const;
export const ACCOUNT_TYPES = ['prime', 'hedge', 'retail'] as const;
export const SORT_ORDERS = ['asc', 'desc'] as const;
export const EXPORT_FORMATS = ['csv', 'xlsx'] as const;
export const EXPORT_JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed'] as const;

/** A single DataTable row, exactly as `components.schemas.Position` describes it. */
export const positionSchema = z
  .object({
    id: z.uuid(),
    symbol: z.string().regex(/^[A-Z][A-Z.-]{1,9}$/),
    name: z.string().min(1),
    quantity: z.number(),
    markPrice: z.number().gt(0),
    marketValue: z.number(),
    unrealizedPnl: z.number(),
    weight: z.number().min(0).max(100),
    status: z.enum(POSITION_STATUSES),
    tradedAt: z.iso.datetime(),
    accountType: z.enum(ACCOUNT_TYPES),
  })
  .strict();

/** The pagination envelope the pager navigation region renders from. */
export const paginationMetaSchema = z
  .object({
    page: z.coerce.number().int().min(1),
    pageSize: z.coerce.number().int().min(1).max(100),
    total: z.coerce.number().int().min(0),
    totalPages: z.coerce.number().int().min(0),
    sortBy: z.string(),
    sortOrder: z.enum(SORT_ORDERS),
  })
  .strict();

/** `GET /api/v1/positions` response. */
export const positionListResponseSchema = z
  .object({
    data: z.array(positionSchema),
    meta: paginationMetaSchema,
  })
  .strict();

/** The shared problem envelope every non-2xx response uses. */
export const errorSchema = z
  .object({
    code: z.string().regex(/^[a-z][a-z0-9_]*$/),
    message: z.string().min(1),
    field: z.string().nullable().optional(),
    requestId: z.uuid().nullable().optional(),
  })
  .strict();

/** `POST /api/v1/positions/export` request body. */
export const exportPositionsRequestSchema = z
  .object({
    format: z.enum(EXPORT_FORMATS),
    accountType: z.enum(ACCOUNT_TYPES).nullable().optional(),
    status: z.enum(POSITION_STATUSES).nullable().optional(),
    q: z.string().min(1).nullable().optional(),
    symbols: z.array(z.string().regex(/^[A-Z][A-Z.-]{1,9}$/)).min(1).nullable().optional(),
  })
  .strict();

/** The asynchronous export job handle. */
export const exportJobSchema = z
  .object({
    jobId: z.uuid(),
    status: z.enum(EXPORT_JOB_STATUSES),
    createdAt: z.iso.datetime(),
    finishedAt: z.iso.datetime().nullable(),
    rowCount: z.coerce.number().int().min(0),
    downloadUrl: z.url().nullable(),
  })
  .strict();

/** One Combobox option, exactly as `components.schemas.Instrument` describes it. */
export const instrumentSchema = z
  .object({
    id: z.uuid(),
    label: z.string().min(1),
    value: z.string().regex(/^[A-Z][A-Z.-]{1,11}$/),
    group: z.string().nullable(),
  })
  .strict();

/** `GET /api/v1/instruments/search` response. */
export const instrumentSearchResponseSchema = z
  .object({
    items: z.array(instrumentSchema),
  })
  .strict();

export type Position = z.infer<typeof positionSchema>;
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;
export type PositionListResponse = z.infer<typeof positionListResponseSchema>;
export type ErrorResponse = z.infer<typeof errorSchema>;
export type ExportPositionsRequest = z.infer<typeof exportPositionsRequestSchema>;
export type ExportJob = z.infer<typeof exportJobSchema>;
export type Instrument = z.infer<typeof instrumentSchema>;
export type InstrumentSearchResponse = z.infer<typeof instrumentSearchResponseSchema>;

/**
 * Parse a response body with the guard for its contract operation, throwing the
 * zod issue list instead of letting a malformed row reach the table.
 */
export function parseWith<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const detail = result.error.issues.map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n');
    throw new Error(`contracts: payload does not satisfy its runtime guard:\n${detail}`);
  }
  return result.data;
}

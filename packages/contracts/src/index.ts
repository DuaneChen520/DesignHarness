/**
 * `@designharness/contracts` — the interface and zero-backend delivery layer.
 *
 * The package root is safe for both Node and browser bundles: handlers,
 * generated provenance, runtime guards and types, and nothing that imports
 * `msw/node`, `msw/browser` or `node:fs`. Those live in the adapters:
 *
 * - `@designharness/contracts/server` — `setupMockServer()` for tests (msw/node)
 * - `@designharness/contracts/browser` — `createMockWorker()` for apps (msw/browser)
 *
 * Flow, one direction only:
 *
 * ```text
 * openapi/*.json  ->  @msw/source fromOpenApi  ->  MSW handlers  ->  components
 *        |                                                              ^
 *        +-> zod guards (drift-tested against components.schemas) -----+
 * ```
 */
export {
  CONTRACT_DOCUMENTS,
  DEFAULT_API_ORIGIN,
  contractUrl,
  createMockHandlers,
  decoratedHandlers,
  describeContractBehaviour,
  documentedMedia,
  generateHandlers,
  loadContractModels,
} from './handlers.js';
export type { MockHandlerOptions } from './handlers.js';

export { decorateGeneratedHandler, describeBehaviour, isDecorated } from './contract-behaviour.js';
export type { BehaviourReport, ContractLogger } from './contract-behaviour.js';

export {
  analyzeContract,
  asJsonObject,
  collectRefs,
  componentSchema,
  isJsonObject,
  itemSchemaOf,
  propertySchemaMap,
  recordStores,
  resolvePointer,
  resolveSchemaNode,
  schemaEnumValues,
  schemaPropertyNames,
  schemaRequiredNames,
  schemaTypeNames,
  toMswPath,
} from './openapi-document.js';
export type { ContractModel, JsonObject, OperationView, ResponseMedia } from './openapi-document.js';

export {
  ACCOUNT_TYPES,
  EXPORT_FORMATS,
  EXPORT_JOB_STATUSES,
  POSITION_STATUSES,
  SORT_ORDERS,
  errorSchema,
  exportJobSchema,
  exportPositionsRequestSchema,
  instrumentSchema,
  instrumentSearchResponseSchema,
  paginationMetaSchema,
  parseWith,
  positionListResponseSchema,
  positionSchema,
} from './schemas.js';
export type {
  ErrorResponse,
  ExportJob,
  ExportPositionsRequest,
  Instrument,
  InstrumentSearchResponse,
  PaginationMeta,
  Position,
  PositionListResponse,
} from './schemas.js';

export { PAGINATION_META_FIELDS, TABLE_QUERY_PARAMETERS, TABLE_SORT_DIRECTIONS } from './types.js';
export type {
  AccountType,
  ComboboxContract,
  DataTableContract,
  Pagination,
  PositionRow,
  PositionSortableField,
  PositionStatus,
  SortOrder,
  TableQuery,
  TableRequestState,
  TableResult,
} from './types.js';

export {
  INSTRUMENTS_SEARCH_OPERATION_ID,
  INSTRUMENTS_SEARCH_PATH,
  POSITIONS_OPERATION_ID,
  POSITIONS_PATH,
  comboboxSearchQueryKey,
  dataTableQueryKey,
  defaultContractFetcher,
  useComboboxSearchQuery,
  useDataTableQuery,
} from './hooks.js';
export type { UseComboboxSearchQueryOptions, UseDataTableQueryOptions } from './hooks.js';

export { assertMatchesSchema, ContractAssertionError, resolveRef, supportedKeywords, validateSchema } from './testing/openapi-assert.js';
export type { JsonSchema, ValidationIssue, ValidationResult, ValidatorOptions } from './testing/openapi-assert.js';

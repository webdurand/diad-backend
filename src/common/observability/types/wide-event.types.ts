/**
 * TypeScript mirror of contracts/wide-event.json.
 * Honeycomb-style structured event — UM evento rico por unidade de trabalho.
 * Naming OTel Semantic Conventions desde dia zero.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type ServiceName = "diad-backend" | "diad-frontend" | "diad-agents";

export type DeploymentEnvironment = "development" | "staging" | "production";

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "HEAD";

/**
 * Recursive cause chain (Error.cause Node, __cause__ Python).
 */
export interface ErrorCauseChain {
  type?: string;
  message?: string;
  stack?: string;
  cause?: ErrorCauseChain | null;
  [key: string]: unknown;
}

/**
 * Wide event shape (subset; additionalProperties allowed via [key: string]).
 */
export interface WideEvent {
  timestamp: string;
  level: LogLevel;
  "service.name": ServiceName;
  "service.version"?: string;
  "deployment.environment"?: DeploymentEnvironment;
  event: string;
  "trace.id"?: string;
  "span.id"?: string;
  "parent.span.id"?: string;
  duration_ms?: number;
  "user.id"?: string;
  "http.request.method"?: HttpMethod;
  "http.response.status_code"?: number;
  "http.route"?: string;
  "url.path"?: string;
  "url.scheme"?: "http" | "https";
  "db.operation"?: "select" | "insert" | "update" | "delete";
  "db.system"?: "postgresql";
  "error.type"?: string;
  "error.message"?: string;
  "error.stack"?: string;
  "error.cause"?: ErrorCauseChain | null;
  attributes?: Record<string, unknown>;
  [key: string]: unknown;
}

import { AppError } from "./errors";

function atPath(value: unknown, path: string[]): unknown {
  for (const key of path) {
    if (typeof value !== "object" || value === null) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

// Only inspect allowlisted codes. Provider messages can contain hosts, SQL or secrets.
export function databaseFailure(error: unknown): AppError | null {
  const codes = [
    atPath(error, ["code"]),
    atPath(error, ["errorCode"]),
    atPath(error, ["meta", "code"]),
    atPath(error, ["cause", "code"]),
    atPath(error, ["meta", "driverAdapterError", "cause", "originalCode"]),
  ];
  if (
    codes.some((code) =>
      ["P2021", "P2022", "42P01", "42703"].includes(String(code)),
    )
  ) {
    return new AppError(
      503,
      "DATABASE_NOT_INITIALIZED",
      "The queue database needs initialization. An administrator must apply the database migrations.",
    );
  }
  if (
    codes.some((code) =>
      ["P1000", "P1010", "28P01", "28000", "42501"].includes(String(code)),
    )
  ) {
    return new AppError(
      503,
      "DATABASE_ACCESS_FAILED",
      "QueueFair cannot access its database. An administrator must check database credentials and permissions.",
    );
  }
  if (
    codes.some((code) => ["P1003", "P1013", "3D000"].includes(String(code)))
  ) {
    return new AppError(
      503,
      "DATABASE_CONFIGURATION_INVALID",
      "The queue database configuration is invalid. An administrator must check the hosted PostgreSQL connection string.",
    );
  }
  if (
    codes.some((code) =>
      [
        "P1001",
        "P1002",
        "P1011",
        "P1017",
        "P2024",
        "ECONNREFUSED",
        "ETIMEDOUT",
        "ENOTFOUND",
      ].includes(String(code)),
    )
  ) {
    return new AppError(
      503,
      "DATABASE_UNAVAILABLE",
      "The queue database connection is unavailable. Please retry shortly; an administrator may need to check connectivity and TLS settings.",
    );
  }
  return null;
}

import { it, expect } from "vitest";
import { Prisma } from "../../src/generated/prisma/client";
import { databaseFailure } from "../../src/server/database-errors";

it("identifies an unmigrated schema without exposing Prisma metadata", () => {
  const error = new Prisma.PrismaClientKnownRequestError(
    "Private SQL and hostname",
    {
      code: "P2021",
      clientVersion: "7.10.1",
      meta: { table: "private_schema.Service" },
    },
  );
  const result = databaseFailure(error);
  expect(result).toMatchObject({
    status: 503,
    code: "DATABASE_NOT_INITIALIZED",
  });
  expect(result?.message).toContain("migrations");
  expect(JSON.stringify(result)).not.toContain("private_schema");
  expect(result?.message).not.toContain("Private SQL");
});
it("handles initialization errors stored under errorCode", () => {
  const error = new Prisma.PrismaClientInitializationError(
    "postgresql://private:secret@host/db",
    "7.10.1",
    "P1001",
  );
  const result = databaseFailure(error);
  expect(result?.code).toBe("DATABASE_UNAVAILABLE");
  expect(result?.message).not.toContain("secret");
});
it("recognizes adapter authentication errors and redacts provider messages", () => {
  const error = {
    code: "P2010",
    message: "password=private-secret",
    meta: { driverAdapterError: { cause: { originalCode: "28P01" } } },
  };
  const result = databaseFailure(error);
  expect(result?.code).toBe("DATABASE_ACCESS_FAILED");
  expect(JSON.stringify(result)).not.toContain("private-secret");
});
it("leaves uniqueness conflicts and unrelated exceptions on their existing paths", () => {
  expect(databaseFailure({ code: "P2002" })).toBeNull();
  expect(databaseFailure(new Error("unrelated"))).toBeNull();
  expect(databaseFailure(null)).toBeNull();
});

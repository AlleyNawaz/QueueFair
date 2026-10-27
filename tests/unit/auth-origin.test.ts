import { afterEach, describe, expect, it } from "vitest";
import { checkOrigin } from "@/server/auth";
import { AppError } from "@/server/errors";

const configuredOrigin = process.env.APP_ORIGIN;
afterEach(() => {
  if (configuredOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = configuredOrigin;
});

describe("mutation origin validation", () => {
  it("allows same-origin requests when APP_ORIGIN is omitted", () => {
    delete process.env.APP_ORIGIN;
    expect(
      checkOrigin(
        new Request("https://queuefair.vercel.app/api/services/1/tickets", {
          method: "POST",
          headers: { origin: "https://queuefair.vercel.app" },
        }),
      ),
    ).toBeUndefined();
  });

  it("rejects a cross-origin request when APP_ORIGIN is omitted", () => {
    delete process.env.APP_ORIGIN;
    try {
      checkOrigin(
        new Request("https://queuefair.vercel.app/api/services/1/tickets", {
          method: "POST",
          headers: { origin: "https://attacker.example" },
        }),
      );
      throw new Error("Expected origin check to reject the request.");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ status: 403, code: "ORIGIN_REJECTED" });
    }
  });

  it("uses the configured canonical origin when present", () => {
    process.env.APP_ORIGIN = "https://queuefair.vercel.app/student";
    expect(
      checkOrigin(
        new Request("https://preview.vercel.app/api/services/1/tickets", {
          method: "POST",
          headers: { origin: "https://queuefair.vercel.app" },
        }),
      ),
    ).toBeUndefined();
  });
});

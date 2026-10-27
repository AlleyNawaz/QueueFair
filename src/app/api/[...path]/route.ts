import { NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";
import {
  anonymous,
  requireUser,
  allowedCounter,
  allowedService,
  login,
  logout,
  checkOrigin,
  rateLimit,
} from "@/server/auth";
import { AppError, assert } from "@/server/errors";
import {
  services,
  publicState,
  privateTicket,
  myTickets,
  staffOverview,
  analytics,
} from "@/server/reads";
import {
  join,
  ownerCommand,
  counterCommand,
  updateService,
  locked,
  officeCommand,
} from "@/server/queue";
import {
  joinSchema,
  loginSchema,
  reasonSchema,
  serviceSchema,
  counterSchema,
} from "@/lib/contracts";
import { db } from "@/server/db";
import { databaseFailure } from "@/server/database-errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
async function handle(req: NextRequest, ctx: Context) {
  try {
    const { path: p } = await ctx.params;
    const method = req.method;
    if (method !== "GET") checkOrigin(req);
    assert(
      process.env.DATABASE_URL?.trim(),
      503,
      "DATABASE_NOT_CONFIGURED",
      "QueueFair's database is not configured. Set DATABASE_URL in the deployment environment.",
    );
    const key = req.headers.get("idempotency-key") ?? "";
    const json = async () => {
      try {
        return await req.json();
      } catch {
        throw new AppError(400, "INVALID_JSON", "Provide a valid JSON body.");
      }
    };
    let data: unknown;
    if (method === "GET" && p.join("/") === "services") data = await services();
    else if (method === "GET" && p[0] === "services" && p[2] === "public-state")
      data = (await publicState(p[1])).dto;
    else if (method === "POST" && p[0] === "services" && p[2] === "tickets") {
      const input = joinSchema.parse(await json());
      const owner = await anonymous();
      assert(owner, 401, "OWNER_REQUIRED", "Browser ownership is required.");
      await rateLimit("join", owner.id, 12);
      data = await join(p[1], owner.id, input, key);
    } else if (method === "GET" && p.join("/") === "me/tickets") {
      const owner = await anonymous();
      data = owner ? await myTickets(owner.id) : [];
    } else if (p[0] === "tickets") {
      const owner = await anonymous();
      assert(owner, 404, "NOT_FOUND", "Ticket not found in this browser.");
      await rateLimit("ticket", owner.id, 180);
      if (method === "GET" && p.length === 2)
        data = await privateTicket(p[1], owner.id);
      else if (method === "POST" && (p[2] === "cancel" || p[2] === "rejoin"))
        data = await ownerCommand(p[1], owner.id, p[2], key);
      else throw new AppError(404, "NOT_FOUND", "Endpoint not found.");
    } else if (method === "POST" && p.join("/") === "auth/anonymous") {
      await rateLimit("anonymous-bootstrap", "local-demo", 120);
      const owner = await anonymous(true);
      data = { established: !!owner };
    } else if (method === "POST" && p.join("/") === "auth/login") {
      const input = loginSchema.parse(await json());
      // Direct local deployment: use the connection host bucket, not spoofable forwarded headers.
      // A trusted reverse proxy should configure a real connection identity before wider use.
      await rateLimit("login-global", "local-auth", 60, 900);
      await rateLimit("login-account", input.email.toLowerCase(), 8, 900);
      data = await login(input.email, input.password);
    } else if (method === "POST" && p.join("/") === "auth/logout") {
      await logout();
      data = { ok: true };
    } else if (method === "GET" && p.join("/") === "staff/overview")
      data = await staffOverview(await requireUser());
    else if (
      method === "POST" &&
      p[0] === "staff" &&
      p[1] === "services" &&
      p.length === 4 &&
      ["pause", "resume"].includes(p[3])
    ) {
      const user = await requireUser();
      await allowedService(user, p[2]);
      const body = await json();
      const input = z
        .object({ reason: z.string().trim().min(3).max(160).optional() })
        .strict()
        .parse(body);
      data = await officeCommand(
        p[2],
        user.id,
        p[3] as "pause" | "resume",
        input.reason,
      );
    } else if (method === "POST" && p[0] === "counters") {
      const user = await requireUser();
      await allowedCounter(user, p[1]);
      const action = p.length === 3 ? p[2] : p[4];
      assert(
        [
          "activate",
          "pause",
          "resume",
          "close",
          "call-next",
          "start",
          "complete",
          "miss",
        ].includes(action),
        404,
        "NOT_FOUND",
        "Endpoint not found.",
      );
      const reason =
        action === "pause"
          ? reasonSchema.parse(await json()).reason
          : undefined;
      data = await counterCommand(
        p[1],
        user.id,
        action,
        p.length === 5 ? p[3] : undefined,
        key,
        reason,
      );
    } else if (p[0] === "admin") {
      const user = await requireUser(true);
      if (method === "GET" && p[1] === "analytics") {
        const from = new Date(
          req.nextUrl.searchParams.get("from") ??
            new Date(Date.now() - 7 * 86400_000).toISOString(),
        );
        const to = new Date(
          req.nextUrl.searchParams.get("to") ?? new Date().toISOString(),
        );
        assert(
          Number.isFinite(+from) &&
            Number.isFinite(+to) &&
            to > from &&
            +to - +from <= 93 * 86400_000,
          422,
          "INVALID_RANGE",
          "Choose a date range of 1–93 days.",
        );
        data = await analytics(from, to);
      } else if (method === "GET" && p[1] === "services")
        data = await db.service.findMany({
          include: { counters: true },
          orderBy: { name: "asc" },
        });
      else if (method === "GET" && p[1] === "users")
        data = await db.user.findMany({
          select: { id: true, displayName: true, role: true },
        });
      else if (
        (method === "POST" || method === "PATCH") &&
        p[1] === "services"
      ) {
        const input = serviceSchema.parse(await json());
        if (method === "PATCH") {
          assert(p[2], 400, "ID_REQUIRED", "A service id is required.");
          data = await updateService(p[2], input, user.id);
        } else
          data = await db.service.create({ data: input, select: { id: true } });
      } else if (method === "POST" && p[1] === "counters") {
        const input = counterSchema.parse(await json());
        data = await locked(input.serviceId, async (tx) => {
          if (input.staffUserId)
            assert(
              await tx.user.findUnique({ where: { id: input.staffUserId } }),
              422,
              "INVALID_USER",
              "Select an existing staff user.",
            );
          const c = await tx.counter.create({
            data: { name: input.name, serviceId: input.serviceId },
          });
          if (input.staffUserId)
            await tx.staffAssignment.create({
              data: {
                userId: input.staffUserId,
                serviceId: input.serviceId,
                counterId: c.id,
              },
            });
          await tx.serviceEvent.create({
            data: {
              serviceId: input.serviceId,
              counterId: c.id,
              eventType: "COUNTER_CREATED",
              actorUserId: user.id,
            },
          });
          return { id: c.id };
        });
      } else if (method === "PATCH" && p[1] === "counters") {
        const input = z
          .object({ staffUserId: z.string().min(1) })
          .strict()
          .parse(await json());
        const c = await db.counter.findUnique({ where: { id: p[2] } });
        assert(c, 404, "NOT_FOUND", "Counter not found.");
        data = await locked(c.serviceId, async (tx) => {
          assert(
            await tx.user.findUnique({ where: { id: input.staffUserId } }),
            422,
            "INVALID_USER",
            "Select an existing staff user.",
          );
          await tx.staffAssignment.create({
            data: {
              serviceId: c.serviceId,
              counterId: c.id,
              userId: input.staffUserId,
            },
          });
          await tx.serviceEvent.create({
            data: {
              serviceId: c.serviceId,
              counterId: c.id,
              eventType: "STAFF_ASSIGNED",
              actorUserId: user.id,
            },
          });
          return { id: c.id };
        });
      } else throw new AppError(404, "NOT_FOUND", "Endpoint not found.");
    } else throw new AppError(404, "NOT_FOUND", "Endpoint not found.");
    return NextResponse.json(
      { data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ZodError)
      return NextResponse.json(
        {
          error: {
            code: "INVALID_INPUT",
            message: "Check the highlighted input.",
            fields: error.flatten().fieldErrors,
          },
        },
        { status: 422, headers: { "Cache-Control": "no-store" } },
      );
    if (error instanceof AppError)
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    const databaseError = databaseFailure(error);
    if (databaseError) {
      console.error("QueueFair database request failed:", databaseError.code);
      return NextResponse.json(
        { error: { code: databaseError.code, message: databaseError.message } },
        {
          status: databaseError.status,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
    if ((error as { code?: string }).code === "P2002")
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "This value already exists. Refresh and try again.",
          },
        },
        { status: 409 },
      );
    console.error(
      "QueueFair request failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Something went wrong. Please retry.",
        },
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;

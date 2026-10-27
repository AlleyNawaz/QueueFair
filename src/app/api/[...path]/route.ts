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
  meetingRequestSchema,
  meetingDecisionSchema,
  meetingResponseSchema,
} from "@/lib/contracts";
import { db } from "@/server/db";
import { databaseFailure } from "@/server/database-errors";
import {
  createMeetingRequest,
  meetingRequestDetail,
  myMeetingRequests,
  officeDetail,
  officeDirectory,
  officeInbox,
  staffMeetingDecision,
  studentMeetingCommand,
} from "@/server/meetings";
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
    if (method === "GET" && p.join("/") === "offices")
      data = await officeDirectory();
    else if (method === "GET" && p[0] === "offices" && p.length === 2)
      data = await officeDetail(p[1]);
    else if (method === "POST" && p[0] === "offices" && p[2] === "requests") {
      const input = meetingRequestSchema.parse(await json());
      const owner = await anonymous();
      assert(owner, 401, "OWNER_REQUIRED", "Browser ownership is required.");
      await rateLimit("meeting-create", owner.id, 8);
      data = await createMeetingRequest(p[1], owner.id, input, key);
    } else if (method === "GET" && p.join("/") === "me/meeting-requests") {
      const owner = await anonymous();
      data = owner ? await myMeetingRequests(owner.id) : [];
    } else if (method === "GET" && p.join("/") === "staff/meetings") {
      data = await officeInbox(
        await requireUser(),
        req.nextUrl.searchParams.get("officeId") ?? undefined,
        req.nextUrl.searchParams.get("status") ?? undefined,
      );
    } else if (
      method === "POST" &&
      p[0] === "staff" &&
      p[1] === "meetings" &&
      p[3] === "decision"
    ) {
      const input = meetingDecisionSchema.parse(await json());
      data = await staffMeetingDecision(p[2], await requireUser(), input, key);
    } else if (p[0] === "meeting-requests" && p.length >= 2) {
      const owner = await anonymous();
      assert(
        owner,
        404,
        "NOT_FOUND",
        "Meeting request not found in this browser.",
      );
      await rateLimit("meeting-request", owner.id, 120);
      if (method === "GET" && p.length === 2)
        data = await meetingRequestDetail(p[1], owner.id);
      else if (method === "POST" && p[2] === "cancel")
        data = await studentMeetingCommand(p[1], owner.id, "cancel", key);
      else if (method === "POST" && p[2] === "respond") {
        const input = meetingResponseSchema.parse(await json());
        data = await studentMeetingCommand(p[1], owner.id, input.action, key);
      } else throw new AppError(404, "NOT_FOUND", "Endpoint not found.");
    } else if (method === "GET" && p.join("/") === "services")
      data = await services();
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
        if (input.parentServiceId) {
          assert(
            input.parentServiceId !== p[2],
            422,
            "INVALID_PARENT",
            "An office cannot be its own parent.",
          );
          const parent = await db.service.findUnique({
            where: { id: input.parentServiceId },
          });
          assert(
            parent?.serviceType === "OFFICE",
            422,
            "INVALID_PARENT",
            "Choose an existing office as the routing parent.",
          );
          let cursor: string | null = parent.id;
          const visited = new Set<string>();
          while (cursor && !visited.has(cursor)) {
            assert(
              cursor !== p[2],
              422,
              "INVALID_PARENT",
              "This parent would create an office routing cycle.",
            );
            visited.add(cursor);
            const ancestor: { parentServiceId: string | null } | null =
              await db.service.findUnique({
                where: { id: cursor },
                select: { parentServiceId: true },
              });
            cursor = ancestor?.parentServiceId ?? null;
          }
        }
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
      } else if (method === "POST" && p[1] === "assignments") {
        const input = z
          .object({
            serviceId: z.string().min(1),
            userId: z.string().min(1),
            counterId: z.string().min(1).nullable().optional(),
            canManageDescendants: z.boolean().default(false),
          })
          .strict()
          .parse(await json());
        data = await locked(input.serviceId, async (tx, service) => {
          const assignedUser = await tx.user.findUnique({
            where: { id: input.userId },
          });
          assert(
            assignedUser?.role === "STAFF",
            422,
            "INVALID_USER",
            "Choose a staff account.",
          );
          const counterId = input.counterId ?? null;
          if (counterId) {
            const counter = await tx.counter.findUnique({
              where: { id: counterId },
            });
            assert(
              counter?.serviceId === service.id,
              422,
              "INVALID_COUNTER",
              "Choose a counter in this office.",
            );
            assert(
              !input.canManageDescendants,
              422,
              "INVALID_SCOPE",
              "Descendant inbox scope requires a whole-office assignment.",
            );
          }
          assert(
            !input.canManageDescendants || service.directoryGroup,
            422,
            "INVALID_SCOPE",
            "Only a routing group can grant explicit descendant inbox access.",
          );
          const existing = await tx.staffAssignment.findFirst({
            where: { userId: input.userId, serviceId: service.id, counterId },
          });
          const assignment = existing
            ? await tx.staffAssignment.update({
                where: { id: existing.id },
                data: { canManageDescendants: input.canManageDescendants },
              })
            : await tx.staffAssignment.create({
                data: {
                  userId: input.userId,
                  serviceId: service.id,
                  counterId,
                  canManageDescendants: input.canManageDescendants,
                },
              });
          await tx.serviceEvent.create({
            data: {
              serviceId: service.id,
              counterId,
              eventType: "STAFF_ASSIGNED",
              actorUserId: user.id,
              metadata: {
                assignedUserId: input.userId,
                canManageDescendants: input.canManageDescendants,
              },
            },
          });
          return { id: assignment.id };
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

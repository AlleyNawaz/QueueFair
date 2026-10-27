import { cookies } from "next/headers";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { verify } from "argon2";
import { db } from "./db";
import { assert } from "./errors";
import type { User } from "@/generated/prisma/client";
export const hash = (secret: string) =>
  createHash("sha256").update(secret).digest("hex");
export const randomSecret = () => randomBytes(32).toString("base64url");
const options = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};
export async function anonymous(create = false) {
  const jar = await cookies();
  const secret = jar.get("qf_owner")?.value;
  const session = secret
    ? await db.anonymousSession.findUnique({
        where: { hashedSecret: hash(secret) },
      })
    : null;
  if (session && session.expiresAt > new Date()) return session;
  if (!create) return null;
  const next = randomSecret();
  const expiresAt = new Date(Date.now() + 30 * 86400_000);
  const owner = await db.anonymousSession.create({
    data: { hashedSecret: hash(next), expiresAt },
  });
  jar.set("qf_owner", next, { ...options, expires: expiresAt });
  return owner;
}
export async function currentUser() {
  const token = (await cookies()).get("qf_auth")?.value;
  const session = token
    ? await db.authSession.findUnique({
        where: { hashedToken: hash(token) },
        include: { user: true },
      })
    : null;
  return session && session.expiresAt > new Date() ? session.user : null;
}
export async function requireUser(admin = false) {
  const user = await currentUser();
  assert(user, 401, "UNAUTHENTICATED", "Please sign in.");
  assert(
    !admin || user.role === "ADMIN",
    403,
    "FORBIDDEN",
    "Administrator access required.",
  );
  return user;
}
export async function allowedCounter(user: User, counterId: string) {
  const counter = await db.counter.findUnique({ where: { id: counterId } });
  assert(counter, 404, "NOT_FOUND", "Counter not found.");
  if (user.role !== "ADMIN") {
    const assignment = await db.staffAssignment.findFirst({
      where: {
        userId: user.id,
        serviceId: counter.serviceId,
        OR: [{ counterId: null }, { counterId }],
      },
    });
    assert(
      assignment,
      403,
      "FORBIDDEN",
      "This counter is not assigned to you.",
    );
  }
  return counter;
}
export async function allowedService(user: User, serviceId: string) {
  const service = await db.service.findUnique({ where: { id: serviceId } });
  assert(service, 404, "NOT_FOUND", "Service not found.");
  if (user.role !== "ADMIN")
    assert(
      await canManageService(user.id, serviceId),
      403,
      "FORBIDDEN",
      "This office is not assigned to you.",
    );
  return service;
}
export async function canManageService(userId: string, serviceId: string) {
  return !!(await db.staffAssignment.findFirst({
    where: { userId, serviceId },
    select: { id: true },
  }));
}
export async function visibleServiceScopes(user: User) {
  if (user.role === "ADMIN") {
    const services = await db.service.findMany({ select: { id: true } });
    return services.map(({ id }) => ({
      serviceId: id,
      visible: true,
      inherited: false,
      wholeService: true,
      counterIds: [] as string[],
    }));
  }
  const assignments = await db.staffAssignment.findMany({
    where: { userId: user.id },
    select: { serviceId: true, counterId: true },
  });
  return [
    ...new Set(assignments.map((assignment) => assignment.serviceId)),
  ].map((serviceId) => {
    const direct = assignments.filter(
      (assignment) => assignment.serviceId === serviceId,
    );
    return {
      serviceId,
      visible: true,
      inherited: false,
      wholeService: direct.some((assignment) => assignment.counterId === null),
      counterIds: direct.flatMap((assignment) =>
        assignment.counterId ? [assignment.counterId] : [],
      ),
    };
  });
}
export async function login(email: string, password: string) {
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  // A dummy Argon2 verification keeps unknown accounts on the same expensive path.
  const dummy =
    "$argon2id$v=19$m=65536,t=3,p=4$MDEyMzQ1Njc4OWFiY2RlZg$PlOBUgYri5rSQDTR98l76SAdDoXIi8Ww8bkYDBRcz2U";
  const valid = await verify(user?.passwordHash ?? dummy, password).catch(
    () => false,
  );
  assert(
    user && valid,
    401,
    "INVALID_CREDENTIALS",
    "Invalid email or password.",
  );
  const secret = randomSecret();
  const expiresAt = new Date(Date.now() + 8 * 3600_000);
  await db.authSession.create({
    data: { hashedToken: hash(secret), userId: user.id, expiresAt },
  });
  (await cookies()).set("qf_auth", secret, { ...options, expires: expiresAt });
  return { id: user.id, displayName: user.displayName, role: user.role };
}
export async function logout() {
  const jar = await cookies();
  const token = jar.get("qf_auth")?.value;
  if (token)
    await db.authSession.deleteMany({ where: { hashedToken: hash(token) } });
  jar.delete("qf_auth");
}
export function checkOrigin(request: Request) {
  const configured = process.env.APP_ORIGIN?.trim();
  const expectedOrigin = configured
    ? new URL(configured).origin
    : new URL(request.url).origin;
  assert(
    request.headers.get("origin") === expectedOrigin,
    403,
    "ORIGIN_REJECTED",
    "This request must originate from QueueFair.",
  );
}
export async function rateLimit(
  scope: string,
  identity: string,
  limit: number,
  windowSeconds = 60,
) {
  const secret =
    process.env.SESSION_SECRET?.trim() || process.env.DATABASE_URL?.trim();
  assert(
    secret && secret.length >= 32,
    500,
    "CONFIGURATION",
    "A 32-character SESSION_SECRET or DATABASE_URL is required.",
  );
  const digest = createHmac("sha256", secret).update(identity).digest("hex");
  const key = `${scope}:${digest}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
  const bucket = await db.rateLimitBucket.upsert({
    where: { key },
    create: {
      key,
      count: 1,
      resetAt: new Date(Date.now() + windowSeconds * 1000),
    },
    update: { count: { increment: 1 } },
  });
  assert(
    bucket.count <= limit,
    429,
    "RATE_LIMITED",
    "Too many requests. Please try again shortly.",
  );
  // Bounded window history; no secret or raw network identity is persisted.
  if (Math.random() < 0.02)
    await db.rateLimitBucket.deleteMany({
      where: { resetAt: { lt: new Date() } },
    });
}

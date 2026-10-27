import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "argon2";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const origin = "http://127.0.0.1:3100";
let serviceId: string;
let counterId: string;
let otherCounterId: string;
let officeId: string;
test.beforeAll(async () => {
  if (
    !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test") ||
    process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
  )
    throw new Error("Unsafe test database.");
});
test.beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE "Service", "User", "AnonymousSession", "IdempotencyRecord", "RateLimitBucket" CASCADE',
  );
  const user = await db.user.create({
    data: {
      email: "staff@queuefair.demo",
      displayName: "Campus Staff",
      role: "STAFF",
      passwordHash: await hash(process.env.DEMO_STAFF_PASSWORD!),
    },
  });
  await db.user.create({
    data: {
      email: "admin@queuefair.demo",
      displayName: "Campus Admin",
      role: "ADMIN",
      passwordHash: await hash(process.env.DEMO_ADMIN_PASSWORD!),
    },
  });
  const s = await db.service.create({
    data: {
      name: "Finance Desk",
      slug: "finance-desk",
      prefix: "FIN",
      description: "Fee enquiries and financial assistance.",
      location: "Admin Block · Ground floor",
      weeklyHours: {
        days: [0, 1, 2, 3, 4, 5, 6],
        open: "00:00",
        close: "23:59",
      },
      gracePeriodSeconds: 10,
      documentRequirements: ["Relevant documents"],
      visitReasonOptions: ["Fee enquiry"],
    },
  });
  serviceId = s.id;
  const c = await db.counter.create({
    data: { serviceId: s.id, name: "Counter 1", state: "ACTIVE" },
  });
  counterId = c.id;
  await db.staffAssignment.create({
    data: { userId: user.id, serviceId: s.id, counterId: c.id },
  });
  otherCounterId = (
    await db.counter.create({
      data: { serviceId: s.id, name: "Counter 2", state: "ACTIVE" },
    })
  ).id;
  const office = await db.service.create({
    data: {
      serviceType: "OFFICE",
      allowNote: true,
      name: "Hostel Administration Office",
      slug: "hostel-office-test",
      prefix: "HOST",
      description: "Same-day walk-in line for residence enquiries.",
      location: "Cedar Residence · Office 2",
      weeklyHours: {
        days: [0, 1, 2, 3, 4, 5, 6],
        open: "00:00",
        close: "23:59",
      },
      gracePeriodSeconds: 30,
      documentRequirements: ["Relevant room or request reference"],
      visitReasonOptions: ["Room access", "Maintenance follow-up"],
    },
  });
  officeId = office.id;
  await db.counter.create({
    data: { serviceId: office.id, name: "Office", state: "ACTIVE" },
  });
  const officer = await db.user.create({
    data: {
      email: "hostel.officer@queuefair.demo",
      displayName: "Hostel Office Officer",
      role: "STAFF",
      passwordHash: await hash(process.env.DEMO_HOSTEL_OFFICER_PASSWORD!),
    },
  });
  await db.staffAssignment.create({
    data: {
      userId: officer.id,
      serviceId: office.id,
    },
  });
});
test.afterAll(() => db.$disconnect());
test("directory makes a zero-wait service actionable in the first viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  const finance = page.getByRole("link", {
    name: "View queue for Finance Desk",
  });
  await expect(finance).toBeVisible();
  await expect(
    page.getByText("No one waiting", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Joining is open", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText(/Up next/i)).toHaveCount(0);
  await expect(page.getByText("3 counters configured").first()).toBeVisible();
  await expect(page.getByText("2 of 2 counters set active")).toHaveCount(0);
  const bounds = await finance.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(768);
  await page.goto("/display/finance-desk");
  await expect(page.getByText("No tickets waiting")).toBeVisible();
  await expect(
    page.getByText("No one waiting · Joining is open"),
  ).toBeVisible();
});
async function joinUI(page: Page) {
  await page.goto("/services/finance-desk");
  await page.getByRole("button", { name: "Get my ticket" }).click();
  await expect(page).toHaveURL(/\/tickets\//);
  await expect(page.getByText("Your place is saved.")).toBeVisible();
  return page.url().split("/").at(-1)!;
}
async function signIn(
  page: Page,
  role: "admin" | "staff" | "officer" = "staff",
) {
  await page.goto("/login");
  await page
    .getByLabel("Email address")
    .fill(
      role === "admin"
        ? "admin@queuefair.demo"
        : role === "officer"
          ? "hostel.officer@queuefair.demo"
          : "staff@queuefair.demo",
    );
  await page
    .getByLabel("Password", { exact: true })
    .fill(
      role === "admin"
        ? process.env.DEMO_ADMIN_PASSWORD!
        : role === "officer"
          ? process.env.DEMO_HOSTEL_OFFICER_PASSWORD!
          : process.env.DEMO_STAFF_PASSWORD!,
    );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(role === "admin" ? "/admin" : "/staff");
}
async function post(ctx: BrowserContext, path: string, data: unknown = {}) {
  return ctx.request.post(`/api/${path}`, {
    headers: { Origin: origin, "Idempotency-Key": crypto.randomUUID() },
    data,
  });
}
test("student ownership survives refresh; staff calls, starts, completes; student polls", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await joinUI(page);
  await page.reload();
  await expect(page.getByText("Your place is saved.")).toBeVisible();
  const staff = await browser.newContext({ baseURL: origin });
  const sp = await staff.newPage();
  await signIn(sp);
  await sp.getByRole("link", { name: /Open workspace/ }).click();
  await sp.getByRole("button", { name: "Call next ticket" }).click();
  await expect(page.getByText("Please go to Counter 1.")).toBeVisible();
  await sp.getByRole("button", { name: "Start service", exact: true }).click();
  await expect(
    page.getByText("You’re being helped at Counter 1."),
  ).toBeVisible();
  await sp.getByRole("button", { name: "Complete service" }).click();
  await expect(page.getByText("All done. You’re good to go.")).toBeVisible();
  expect(errors).toEqual([]);
  await staff.close();
});
test("cancel confirmation releases waiting place and preserves history", async ({
  page,
}) => {
  const id = await joinUI(page);
  await page
    .getByRole("button", { name: "Cancel ticket", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Yes, cancel ticket" }).click();
  await expect(page.getByText("This ticket is cancelled.")).toBeVisible();
  expect(
    (await db.ticket.findUniqueOrThrow({ where: { publicId: id } })).status,
  ).toBe("CANCELLED");
  expect(await db.activeParticipation.count()).toBe(0);
});
test("missed ticket rejoins at tail once and second rejoin is rejected", async ({
  page,
  browser,
}) => {
  const publicId = await joinUI(page);
  const staff = await browser.newContext({ baseURL: origin });
  const sp = await staff.newPage();
  await signIn(sp);
  expect(
    (await post(staff, `counters/${counterId}/call-next`)).ok(),
  ).toBeTruthy();
  let t = await db.ticket.findUniqueOrThrow({ where: { publicId } });
  await db.ticket.update({
    where: { id: t.id },
    data: { calledAt: new Date(Date.now() - 11000) },
  });
  expect(
    (await post(staff, `counters/${counterId}/tickets/${t.id}/miss`)).ok(),
  ).toBeTruthy();
  await expect(
    page.getByRole("button", { name: "Rejoin at the back" }),
  ).toBeVisible();
  const other = await browser.newContext({ baseURL: origin });
  const op = await other.newPage();
  await joinUI(op);
  await page.getByRole("button", { name: "Rejoin at the back" }).click();
  await expect(page.getByText("Your place is saved.")).toBeVisible();
  const waiting = await db.ticket.findMany({
    orderBy: { queueSequence: "asc" },
  });
  expect(waiting.at(-1)?.publicId).toBe(publicId);
  expect(waiting.at(-1)?.tokenLabel).toBe("FIN-001");
  await post(staff, `counters/${counterId}/call-next`);
  const otherTicket = await db.ticket.findFirstOrThrow({
    where: { assignedCounterId: counterId, status: "CALLED" },
  });
  await post(staff, `counters/${counterId}/tickets/${otherTicket.id}/start`);
  await post(staff, `counters/${counterId}/tickets/${otherTicket.id}/complete`);
  await post(staff, `counters/${counterId}/call-next`);
  t = await db.ticket.findUniqueOrThrow({ where: { publicId } });
  await db.ticket.update({
    where: { id: t.id },
    data: { calledAt: new Date(Date.now() - 11000) },
  });
  await post(staff, `counters/${counterId}/tickets/${t.id}/miss`);
  await expect(page.getByText("Your one rejoin has been used.")).toBeVisible();
  expect(
    (await post(page.context(), `tickets/${publicId}/rejoin`)).status(),
  ).toBe(409);
  await staff.close();
  await other.close();
});
test("admin pause appears on student and display, blocks joining", async ({
  page,
  browser,
}) => {
  await page.goto("/services/finance-desk");
  const admin = await browser.newContext({ baseURL: origin });
  const ap = await admin.newPage();
  await signIn(ap, "admin");
  await ap.goto(`/admin/services/${serviceId}`);
  await ap.getByLabel("Service state").selectOption("PAUSED");
  await ap
    .getByLabel("Visible pause / closed reason")
    .fill("Campus maintenance");
  await ap.getByRole("button", { name: "Save service", exact: true }).click();
  await expect(ap.getByText("Settings saved.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Joining currently unavailable" }),
  ).toBeDisabled();
  await expect(page.getByText(/Campus maintenance/)).toBeVisible();
  await page.goto("/display/finance-desk");
  await expect(page.getByText(/Campus maintenance/)).toBeVisible();
  await admin.close();
});
test("assigned office officer pauses/resumes, sees private context, and completes walk-in", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  await page.goto("/services/hostel-office-test");
  await expect(
    page.getByText("Same-day walk-in line · not an appointment"),
  ).toBeVisible();
  await page
    .getByLabel(/anything else/i)
    .fill("Maintenance request reference R-14");
  await page.getByRole("button", { name: "Get my ticket" }).click();
  await expect(page).toHaveURL(/\/tickets\//);
  const publicId = page.url().split("/").at(-1)!;
  await expect(
    page.getByText("Your note: Maintenance request reference R-14"),
  ).toBeVisible();
  const publicState = await page
    .context()
    .request.get(`/api/services/${officeId}/public-state`);
  expect(await publicState.text()).not.toContain(
    "Maintenance request reference R-14",
  );

  const unassigned = await browser.newContext({ baseURL: origin });
  const unauthenticatedStaffLogin = await post(unassigned, "auth/login", {
    email: "staff@queuefair.demo",
    password: process.env.DEMO_STAFF_PASSWORD!,
  });
  expect(unauthenticatedStaffLogin.ok()).toBeTruthy();
  expect(
    (
      await post(unassigned, `staff/services/${officeId}/pause`, {
        reason: "In a meeting",
      })
    ).status(),
  ).toBe(403);
  const assignedOverview = await unassigned.request.get("/api/staff/overview");
  expect(await assignedOverview.text()).not.toContain(
    "Hostel Administration Office",
  );

  const officer = await browser.newContext({ baseURL: origin });
  const op = await officer.newPage();
  await signIn(op, "officer");
  await op
    .getByRole("button", { name: "In a meeting — pause new joins and calls" })
    .click();
  await expect(op.getByText("Office line paused")).toBeVisible();
  await expect(page.getByText(/In a meeting/)).toBeVisible();
  await page.goto("/display/hostel-office-test");
  await expect(page.getByText(/In a meeting/)).toBeVisible();
  await page.goto("/services/hostel-office-test");
  await expect(
    page.getByRole("button", { name: "Joining currently unavailable" }),
  ).toBeDisabled();
  await page.goto(`/tickets/${publicId}`);

  await op.getByRole("button", { name: "Resume office walk-in line" }).click();
  await expect(op.getByText("Office line accepting walk-ins")).toBeVisible();
  await op.getByRole("link", { name: /Open workspace/ }).click();
  await expect(
    op.getByText("Room access · Maintenance request reference R-14"),
  ).toBeVisible();
  await expect(
    op.getByText("Maintenance request reference R-14"),
  ).toBeVisible();
  await op.getByRole("button", { name: "Call next ticket" }).click();
  await expect(
    page.getByText(
      /Please go to Hostel Administration Office · Cedar Residence/,
    ),
  ).toBeVisible();
  await expect(page.getByText(/call window is 30 seconds/)).toBeVisible();
  await op.getByRole("button", { name: "Start service", exact: true }).click();
  await expect(page.getByText(/You’re being helped at Office/)).toBeVisible();
  await op.getByRole("button", { name: "Complete service" }).click();
  await expect(page.getByText("All done. You’re good to go.")).toBeVisible();
  expect(
    (await db.ticket.findUniqueOrThrow({ where: { publicId } })).status,
  ).toBe("COMPLETED");
  await unassigned.close();
  await officer.close();
});
test("private ownership, public allowlist, auth/assignment/CSRF/reset boundaries", async ({
  page,
  browser,
}) => {
  const id = await joinUI(page);
  const other = await browser.newContext({ baseURL: origin });
  expect((await other.request.get(`/api/tickets/${id}`)).status()).toBe(404);
  expect((await post(other, `tickets/${id}/cancel`)).status()).toBe(404);
  expect((await other.request.get("/api/staff/overview")).status()).toBe(401);
  expect((await other.request.get("/api/admin/analytics")).status()).toBe(401);
  const staff = await browser.newContext({ baseURL: origin });
  const sp = await staff.newPage();
  await signIn(sp);
  expect((await staff.request.get("/api/admin/analytics")).status()).toBe(403);
  expect(
    (await post(staff, `counters/${otherCounterId}/call-next`)).status(),
  ).toBe(403);
  expect(
    (
      await page.context().request.post(`/api/tickets/${id}/cancel`, {
        headers: { Origin: "https://evil.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect((await post(staff, "demo/reset")).status()).toBe(404);
  const pub = await other.request.get(
    `/api/services/${serviceId}/public-state`,
  );
  expect(pub.headers()["cache-control"]).toBe("no-store");
  const json = JSON.stringify(await pub.json());
  for (const key of [
    "note",
    "visitReasonCode",
    "anonymousSessionId",
    "hashedSecret",
    "passwordHash",
  ])
    expect(json).not.toContain(`"${key}"`);
  await page.goto("/display/finance-desk");
  await expect(page.getByText("FIN-001")).toBeVisible();
  await expect(page.getByText("CONFIGURED ACTIVE").first()).toBeVisible();
  await expect(page.getByText("Fee enquiry", { exact: true })).toHaveCount(0);
  await other.close();
  await staff.close();
});
test("mobile service and ticket have no horizontal overflow; Urdu switches direction", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Choose a service" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "اردو" }).click();
  await expect(page.locator("main")).toHaveAttribute("dir", "rtl");
  await page.getByRole("button", { name: "English" }).click();
  await joinUI(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("core join and staff controls work from keyboard", async ({
  page,
  browser,
}) => {
  await page.goto("/services/finance-desk");
  await page.getByRole("combobox").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("textbox")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Get my ticket" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/tickets\//);
  const staff = await browser.newContext({ baseURL: origin });
  const sp = await staff.newPage();
  await signIn(sp);
  await sp.getByRole("link", { name: /Open workspace/ }).focus();
  await sp.keyboard.press("Enter");
  await sp.getByRole("button", { name: "Call next ticket" }).focus();
  await sp.keyboard.press("Enter");
  await expect(
    sp.getByRole("button", { name: "Start service", exact: true }),
  ).toBeVisible();
  await staff.close();
});
test("failed polling keeps last state visible and labels it stale", async ({
  page,
}) => {
  await joinUI(page);
  await page.route("**/api/tickets/**", (route) => route.abort());
  await expect(page.getByText(/showing stale data/)).toBeVisible({
    timeout: 16000,
  });
  await expect(page.getByText("Your place is saved.")).toBeVisible();
});

test("credential errors are generic, rate limits persist, and logout revokes access", async ({
  page,
}) => {
  const context = page.context();
  const wrong = await post(context, "auth/login", {
    email: "staff@queuefair.demo",
    password: "incorrect-password",
  });
  const unknown = await post(context, "auth/login", {
    email: "unknown@example.test",
    password: "incorrect-password",
  });
  expect(wrong.status()).toBe(401);
  expect(unknown.status()).toBe(401);
  expect((await wrong.json()).error.message).toBe(
    (await unknown.json()).error.message,
  );
  for (let i = 0; i < 7; i++)
    expect(
      (
        await post(context, "auth/login", {
          email: "unknown@example.test",
          password: "incorrect-password",
        })
      ).status(),
    ).toBe(401);
  expect(
    (
      await post(context, "auth/login", {
        email: "unknown@example.test",
        password: "incorrect-password",
      })
    ).status(),
  ).toBe(429);
  expect(
    await db.rateLimitBucket.count({ where: { count: { gte: 9 } } }),
  ).toBeGreaterThan(0);
  await signIn(page);
  expect(
    (await context.cookies()).find((c) => c.name === "qf_auth")?.httpOnly,
  ).toBe(true);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/login");
  expect((await context.request.get("/api/staff/overview")).status()).toBe(401);
  expect(await db.authSession.count()).toBe(0);
});

test("initial directory failure ends loading and retry recovers", async ({
  page,
}) => {
  await page.route("**/api/services", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The queue database connection is unavailable.",
        },
      }),
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "We couldn’t load the queues." }),
  ).toBeVisible();
  await expect(page.getByText("Loading the latest queue…")).toHaveCount(0);
  await page.unroute("**/api/services");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Choose a service" }),
  ).toBeVisible();
});

import { z } from "zod";

export const joinSchema = z
  .object({
    reason: z.string().min(1).max(80),
    note: z.string().trim().max(240).optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.email().max(200),
    password: z.string().min(1).max(200),
  })
  .strict();

export const reasonSchema = z
  .object({
    reason: z.string().trim().min(3).max(160),
  })
  .strict();

const optionalNullableText = (max: number) =>
  z.string().trim().max(max).nullable().optional();

export const meetingRequestSchema = z
  .object({
    reason: z.string().trim().min(1).max(100),
    note: z.string().trim().max(240).optional(),
    preferredAt: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .strict();

export const meetingDecisionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("accept"),
    at: z.iso.datetime({ offset: true }),
  }),
  z.object({
    action: z.literal("reject"),
    reason: z.string().trim().min(3).max(240),
  }),
  z.object({
    action: z.literal("propose"),
    at: z.iso.datetime({ offset: true }),
    reason: z.string().trim().max(240).optional(),
  }),
  z.object({ action: z.literal("complete") }),
]);

export const meetingResponseSchema = z
  .object({ action: z.enum(["accept-proposal", "decline-proposal"]) })
  .strict();

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const serviceSchema = z
  .object({
    serviceType: z.enum(["DESK", "OFFICE"]),
    allowNote: z.boolean(),
    directoryGroup: z.boolean().default(false),
    parentServiceId: z.string().min(1).nullable().default(null),
    positionTitle: optionalNullableText(120).default(null),
    officeSourceUrl: z.url().nullable().default(null),
    meetingRequestsEnabled: z.boolean().default(false),
    meetingDurationMinutes: z.number().int().min(10).max(60).default(20),
    meetingBookingHorizonDays: z.number().int().min(1).max(180).default(30),
    meetingCancellationCutoffMinutes: z
      .number()
      .int()
      .min(0)
      .max(10080)
      .default(60),
    meetingDailyCapacity: z.number().int().min(1).max(100).default(8),
    meetingRequestReasonOptions: z
      .array(z.string().trim().min(1).max(100))
      .max(12)
      .default([]),
    name: z.string().trim().min(3).max(80),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(80),
    description: z.string().min(5).max(500),
    prefix: z.string().regex(/^[A-Z]{2,5}$/),
    location: z.string().min(3).max(120),
    state: z.enum(["OPEN", "PAUSED", "CLOSED"]),
    pauseReason: z.string().max(160).nullable().optional(),
    notice: z.string().max(300),
    weeklyHours: z
      .object({
        days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
        open: time,
        close: time,
      })
      .refine(
        (hours) => hours.close > hours.open,
        "Closing time must follow opening time",
      ),
    defaultServiceSeconds: z.number().int().min(30).max(7200),
    gracePeriodSeconds: z.number().int().min(10).max(600),
    maxWaitingTickets: z.number().int().min(1).max(1000),
    documentRequirements: z.array(z.string().min(1).max(120)).max(10),
    visitReasonOptions: z.array(z.string().min(1).max(80)).min(1).max(10),
  })
  .strict()
  .refine(
    (service) => service.state === "OPEN" || !!service.pauseReason?.trim(),
    "A visible reason is required when paused or closed",
  )
  .refine(
    (service) =>
      service.gracePeriodSeconds >= 30 || service.serviceType === "DESK",
    "Office arrival grace must be at least 30 seconds",
  )
  .refine(
    (service) =>
      !service.meetingRequestsEnabled ||
      (service.serviceType === "OFFICE" &&
        !service.directoryGroup &&
        service.meetingRequestReasonOptions.length > 0),
    "Meeting requests require a non-group office and at least one topic",
  )
  .refine(
    (service) => !service.directoryGroup || service.serviceType === "OFFICE",
    "Directory groups must use the office type",
  );

export const counterSchema = z
  .object({
    serviceId: z.string().min(1),
    name: z.string().trim().min(2).max(60),
    staffUserId: z.string().optional(),
  })
  .strict();

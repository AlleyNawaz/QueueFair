import { z } from "zod";
export const joinSchema = z
  .object({
    reason: z.string().min(1).max(80),
    note: z.string().max(240).optional(),
  })
  .strict();
export const loginSchema = z
  .object({ email: z.email().max(200), password: z.string().min(1).max(200) })
  .strict();
export const reasonSchema = z
  .object({ reason: z.string().trim().min(3).max(160) })
  .strict();
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const serviceSchema = z
  .object({
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
      .refine((h) => h.close > h.open, "Closing time must follow opening time"),
    defaultServiceSeconds: z.number().int().min(30).max(7200),
    gracePeriodSeconds: z.number().int().min(10).max(600),
    maxWaitingTickets: z.number().int().min(1).max(1000),
    documentRequirements: z.array(z.string().min(1).max(120)).max(10),
    visitReasonOptions: z.array(z.string().min(1).max(80)).min(1).max(10),
  })
  .strict()
  .refine(
    (s) => s.state === "OPEN" || !!s.pauseReason?.trim(),
    "A visible reason is required when paused or closed",
  );
export const counterSchema = z
  .object({
    serviceId: z.string().min(1),
    name: z.string().trim().min(2).max(60),
    staffUserId: z.string().optional(),
  })
  .strict();

import { describe, it, expect } from "vitest";
import {
  states,
  canTransition,
  canRejoin,
  graceElapsed,
  localDate,
  withinHours,
  estimateWait,
} from "../../src/lib/policy";
const now = new Date("2026-10-26T08:00:00Z");
const allowed = [
  "WAITING:CALLED",
  "WAITING:CANCELLED",
  "WAITING:EXPIRED",
  "CALLED:SERVING",
  "CALLED:MISSED",
  "CALLED:CANCELLED",
  "SERVING:COMPLETED",
  "MISSED:WAITING",
  "MISSED:CANCELLED",
  "MISSED:EXPIRED",
];
describe("state machine", () => {
  for (const from of states)
    for (const to of states)
      it(`${from} -> ${to}`, () =>
        expect(canTransition(from, to)).toBe(
          allowed.includes(`${from}:${to}`),
        ));
});
it("enforces grace before, at, after boundary", () => {
  const called = new Date(+now - 120000);
  expect(graceElapsed(called, 120, new Date(+now - 1))).toBe(false);
  expect(graceElapsed(called, 120, now)).toBe(true);
  expect(graceElapsed(called, 120, new Date(+now + 1))).toBe(true);
});
it("rejoin only once, same day and open", () => {
  const t = { status: "MISSED", rejoinCount: 0, localDate: "2026-10-26" };
  expect(canRejoin(t, "2026-10-26", true)).toBe(true);
  expect(canRejoin({ ...t, rejoinCount: 1 }, t.localDate, true)).toBe(false);
  expect(canRejoin(t, "2026-10-27", true)).toBe(false);
  expect(canRejoin(t, t.localDate, false)).toBe(false);
});
it("derives Karachi day across local and UTC midnight", () => {
  expect(localDate(new Date("2026-10-26T18:59:59Z"))).toBe("2026-10-26");
  expect(localDate(new Date("2026-10-26T19:00:00Z"))).toBe("2026-10-27");
  expect(localDate(new Date("2026-10-26T23:59:59Z"))).toBe("2026-10-27");
  expect(localDate(new Date("2026-10-27T00:00:00Z"))).toBe("2026-10-27");
});
it("checks weekday and inclusive open / exclusive close", () => {
  const h = { days: [1], open: "09:00", close: "17:00" };
  expect(withinHours(new Date("2026-10-26T04:00Z"), "Asia/Karachi", h)).toBe(
    true,
  );
  expect(withinHours(new Date("2026-10-26T12:00Z"), "Asia/Karachi", h)).toBe(
    false,
  );
  expect(withinHours(new Date("2026-10-25T06:00Z"), "Asia/Karachi", h)).toBe(
    false,
  );
});
const base = {
  now,
  open: true,
  baseline: 360,
  grace: 120,
  durations: [],
  counters: [{ state: "ACTIVE" }],
  ahead: 0,
};
it("no counters or closed service gives unavailable estimate", () => {
  expect(estimateWait({ ...base, counters: [] }).available).toBe(false);
  expect(estimateWait({ ...base, open: false }).available).toBe(false);
});
it("fallback and immediate call label are honest", () => {
  const e = estimateWait({ ...base, durations: [60, 90, 120, 180] });
  expect(e.source).toBe("Configured baseline");
  expect(e.label).toBe("You may be called next");
});
it("one counter models FIFO and rejoin at tail", () => {
  expect(estimateWait({ ...base, ahead: 3 }).seconds).toBe(1080);
  expect(estimateWait({ ...base, ahead: 4 }).seconds).toBe(1440);
});
it("parallel counters share waiting work", () =>
  expect(
    estimateWait({
      ...base,
      ahead: 3,
      counters: [{ state: "ACTIVE" }, { state: "ACTIVE" }],
    }).seconds,
  ).toBe(360));
it("serving work has estimated remaining occupancy", () =>
  expect(
    estimateWait({
      ...base,
      counters: [
        {
          state: "ACTIVE",
          work: {
            status: "SERVING",
            serviceStartedAt: new Date(+now - 120000),
            calledAt: null,
          },
        },
      ],
    }).seconds,
  ).toBe(240));
it("called work includes remaining grace plus a visit", () =>
  expect(
    estimateWait({
      ...base,
      counters: [
        {
          state: "ACTIVE",
          work: {
            status: "CALLED",
            serviceStartedAt: null,
            calledAt: new Date(+now - 60000),
          },
        },
      ],
    }).seconds,
  ).toBe(420));
it("uses five valid samples and excludes outliers without changing input", () => {
  const ds = [0, 8000, 60, 120, 180, 240, 300];
  const e = estimateWait({ ...base, durations: ds });
  expect(e.averageSeconds).toBe(180);
  expect(e.source).toBe("Recent completed visits");
  expect(ds.length).toBe(7);
});

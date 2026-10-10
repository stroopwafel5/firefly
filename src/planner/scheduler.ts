import { Location, ScheduledItem, WeeklyHours } from '../models';
import { checkOpen, earliestOpenStart } from './time';
import { TravelTable } from './travel';

/**
 * Builds and re-times a single day. Pure functions, no network — see HOW_TO_TEST.md
 * ("How Firefly builds a trip") for the plain-language version of these rules.
 */

export const LUNCH = { from: 12 * 60, to: 14 * 60 + 30, duration: 60 };
export const DINNER = { from: 18 * 60 + 30, to: 21 * 60, duration: 75 };
/** Never make people wait more than this outside a place before it opens. */
export const MAX_WAIT = 75;
export const DEFAULT_MAX_ATTRACTIONS = 6;
/** Minutes kept free before a meal for getting to a restaurant when no restaurant is known. */
export const MEAL_TRAVEL_ALLOWANCE = 15;
/** Visits this long (zoos, theme parks) may run through a meal: you eat on site. */
export const MEAL_ON_SITE_MIN_VISIT = 180;

export interface Point {
  id: string;
  location: Location;
}

/** Something the scheduler may place anywhere it fits: an attraction or an event without a set time. */
export interface Candidate extends Point {
  kind: 'attraction' | 'event';
  duration: number;
  weeklyHours?: WeeklyHours;
  /** Events without a set start: the hours during which they run that day. */
  window?: { start: number; end: number };
  /** Higher is better (see generator.scoreAttraction). */
  score: number;
  /** Must-see places the traveller picked are always tried first. */
  mustInclude?: boolean;
  /**
   * Greedy route priorities 1–3 (popularity, accessibility fit, type/age fit — see route.ts),
   * compared left to right; priority 4 is the distance from the current point. When candidates
   * carry a rank, the day is built in this order instead of by `score`.
   */
  rank?: number[];
}

/** An event with a set start and end time. Never moved. */
export interface FixedItem extends Point {
  start: number;
  end: number;
}

export interface MealOption extends Point {
  weeklyHours?: WeeklyHours;
}

export interface DayInput {
  date: Date;
  dayStart: number;
  dayEnd: number;
  base: Point;
  candidates: Candidate[];
  fixed: FixedItem[];
  restaurants: MealOption[];
  travel: TravelTable;
  maxAttractions?: number;
  /**
   * Minutes of quiet time after each visit (accessibility pacing; 0 = none). The next visit,
   * meal or fixed-time event has to leave room for it.
   */
  breakMinutes?: number;
  /** Restaurants already used earlier in the trip (avoid repeats). */
  usedRestaurants?: Set<string>;
  /** Optional: receives every decision, for explaining a plan. */
  trace?: (t: TraceEntry) => void;
}

/** Why a candidate was not picked at one step (see HOW_TO_TEST.md, "Reading a trace"). */
export type SkipReason = 'closed' | 'closedToday' | 'afterDayEnd' | 'clashesWithFixed' | 'noRoomForLunch' | 'noRoomForDinner';

/** One decision of the day builder, for testers (scripts/explainTrip.ts prints these). */
export type TraceEntry =
  | { kind: 'meal'; at: number; meal: 'lunch' | 'dinner'; restaurant: string | null; start?: number; travel?: number }
  | {
      kind: 'pick';
      at: number;
      chosen: string;
      start: number;
      end: number;
      travel: number;
      wait: number;
      value: number;
      /** Set when this long visit runs through a meal, which is then eaten on site. */
      mealOnSite?: 'lunch' | 'dinner';
      others: Array<{ id: string; value?: number; skip?: SkipReason }>;
    }
  | { kind: 'fixed'; at: number; id: string; start: number; end: number; travel: number }
  | { kind: 'jump'; at: number; to: number; meal: 'lunch' | 'dinner' }
  | { kind: 'end'; at: number; why: 'nothingFits' | 'maxAttractions' };

export interface DayResult {
  slots: ScheduledItem[];
  placed: string[];
  restaurants: string[];
}

let slotCounter = 0;
function slotKey(kind: string, id: string) {
  slotCounter = (slotCounter + 1) % 1_000_000;
  return `${kind}:${id}:${slotCounter}`;
}

/** Earliest start ≥ `from` that respects a candidate's opening hours or event window. */
function feasibleStart(c: Candidate, date: Date, from: number): number | null {
  if (c.window) {
    const s = Math.max(from, c.window.start);
    return s + c.duration <= c.window.end ? s : null;
  }
  return earliestOpenStart(c.weeklyHours, date, from, c.duration);
}

/**
 * Greedy day builder.
 *
 * Starting at `dayStart` from the base (last night's hotel or the start city), repeatedly:
 *  1. If it's lunch time (12:00–14:30) or dinner time (18:30–21:00), eat at the open
 *     restaurant closest to where you are.
 *  2. Otherwise pick the candidate with the best value = score − 1.5 × (travel + waiting)
 *     − 2 × (waiting beyond 75 min), among those that are open for the whole visit, end
 *     before the day ends, leave enough time to reach the next fixed-time event, and leave
 *     room for the next meal (visits of 3 h or more that are under way at mealtime may run
 *     through it — the meal is eaten on site).
 *  3. If nothing fits, go to the next fixed-time event, or have free time until the next
 *     meal (leaving in time to reach the restaurant when the meal window opens).
 * At most 6 attractions a day. Must-see places get a huge bonus, so they are placed
 * whenever they fit at all. Pass `trace` to receive every decision.
 */
/**
 * Chooses among the visits that fit right now. Ranked candidates (the greedy route): must-sees
 * first, then visits without a long wait for opening, then the best rank, then the nearest.
 * Otherwise the highest value (score minus travel and waiting).
 */
function pickBest<T extends { c: Candidate; start: number; leg: { distanceMeters: number }; value: number }>(list: T[], cursor: number): T | null {
  if (!list.length) return null;
  if (!list.some((x) => x.c.rank)) return list.reduce((a, b) => (b.value > a.value ? b : a));
  const wait = (x: T) => x.start - cursor;
  return [...list].sort(
    (x, y) =>
      Number(!!y.c.mustInclude) - Number(!!x.c.mustInclude) ||
      Number(wait(x) > MAX_WAIT) - Number(wait(y) > MAX_WAIT) ||
      compareRanks(x.c.rank ?? [], y.c.rank ?? []) ||
      x.leg.distanceMeters - y.leg.distanceMeters,
  )[0];
}

function compareRanks(x: readonly number[], y: readonly number[]): number {
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (y[i] ?? 0) - (x[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export function scheduleDay(input: DayInput): DayResult {
  const { date, dayStart, dayEnd, base, travel } = input;
  const maxAttractions = input.maxAttractions ?? DEFAULT_MAX_ATTRACTIONS;
  const brk = input.breakMinutes ?? 0;
  const slots: ScheduledItem[] = [];
  const placed: string[] = [];
  const restaurantsUsed: string[] = [];
  const used = input.usedRestaurants ?? new Set<string>();

  let cursor = dayStart;
  let pos: Point = base;
  let remaining = [...input.candidates];
  const fixedQueue = input.fixed
    .filter((f) => f.start >= dayStart && f.end <= dayEnd)
    .sort((a, b) => a.start - b.start);

  let lunchDone = !(dayStart <= LUNCH.to - LUNCH.duration && dayEnd >= LUNCH.from + LUNCH.duration);
  let dinnerDone = !(dayStart <= DINNER.to - DINNER.duration && dayEnd >= DINNER.from + DINNER.duration);
  let attractionsPlaced = 0;
  /** Travel from a point to the closest restaurant still available today. */
  const mealTravel = (from: Point): number => {
    let best = Infinity;
    for (const r of input.restaurants) {
      if (used.has(r.id) || restaurantsUsed.includes(r.id)) continue;
      best = Math.min(best, travel.leg(from.id, from.location, r.id, r.location).minutes);
    }
    return Number.isFinite(best) ? best : MEAL_TRAVEL_ALLOWANCE;
  };
  /**
   * Latest end for a visit at `from` before a meal: the meal should start by `to − duration`,
   * and — after travelling to the closest restaurant — still end before the day ends.
   */
  const mustEndBy = (win: typeof LUNCH, from: Point) => Math.min(win.to - win.duration, dayEnd - win.duration - mealTravel(from));

  const placeMeal = (meal: 'lunch' | 'dinner'): boolean => {
    const win = meal === 'lunch' ? LUNCH : DINNER;
    const next = fixedQueue[0];
    let best: { r: MealOption; start: number; leg: ReturnType<TravelTable['leg']> } | null = null;
    for (const r of input.restaurants) {
      if (used.has(r.id) || restaurantsUsed.includes(r.id)) continue;
      const leg = travel.leg(pos.id, pos.location, r.id, r.location);
      const start = Math.max(cursor + leg.minutes, win.from);
      const end = start + win.duration;
      if (start > win.to || end > dayEnd) continue;
      if (next && end + travel.leg(r.id, r.location, next.id, next.location).minutes > next.start) continue;
      const open = checkOpen(r.weeklyHours, date, start, end);
      if (open === 'closed' || open === 'closedDay') continue;
      if (!best || leg.minutes < best.leg.minutes) best = { r, start, leg };
    }
    input.trace?.({ kind: 'meal', at: cursor, meal, restaurant: best?.r.id ?? null, start: best?.start, travel: best?.leg.minutes });
    if (!best) return false;
    slots.push({
      key: slotKey('restaurant', best.r.id),
      kind: 'restaurant',
      refId: best.r.id,
      start: best.start,
      end: best.start + win.duration,
      fixed: false,
      meal,
      travelBefore: best.leg,
    });
    restaurantsUsed.push(best.r.id);
    cursor = best.start + win.duration;
    pos = best.r;
    return true;
  };

  for (let guard = 0; guard < 60; guard++) {
    const next = fixedQueue[0];

    // 1. Meals.
    if (!lunchDone && cursor >= LUNCH.from - 15) {
      lunchDone = true;
      if (cursor <= LUNCH.to && placeMeal('lunch')) continue;
    }
    if (!dinnerDone && cursor >= DINNER.from - 15) {
      dinnerDone = true;
      if (cursor <= DINNER.to && placeMeal('dinner')) continue;
    }

    // 2. Best flexible candidate.
    type Option = {
      c: Candidate;
      start: number;
      leg: ReturnType<TravelTable['leg']>;
      value: number;
      mealOnSite?: 'lunch' | 'dinner';
    };
    let best: Option | null = null;
    const considered: Array<{ id: string; value?: number; skip?: SkipReason }> = [];
    const feasible: Option[] = [];
    const skip = (id: string, why: SkipReason) => input.trace && considered.push({ id, skip: why });
    for (const c of remaining) {
      // At most `maxAttractions` attractions a day; drop-in events don't count towards it.
      if (c.kind === 'attraction' && attractionsPlaced >= maxAttractions) continue;
      const leg = travel.leg(pos.id, pos.location, c.id, c.location);
      const arrive = cursor + leg.minutes;
      const start = feasibleStart(c, date, arrive);
      if (start == null) {
        skip(c.id, !c.window && checkOpen(c.weeklyHours, date, arrive, arrive + c.duration) === 'closedDay' ? 'closedToday' : 'closed');
        continue;
      }
      const wait = start - arrive;
      const end = start + c.duration;
      if (end > dayEnd) {
        skip(c.id, 'afterDayEnd');
        continue;
      }
      if (next && end + brk + travel.leg(c.id, c.location, next.id, next.location).minutes > next.start) {
        skip(c.id, 'clashesWithFixed');
        continue;
      }
      // Don't let a visit swallow a meal: it must end early enough for the meal to fit
      // in its window *and* before the traveller's day ends. Long visits (zoo, theme park)
      // that are under way at mealtime are the exception: the meal is eaten on site.
      let mealOnSite: 'lunch' | 'dinner' | undefined;
      let blocked: SkipReason | null = null;
      for (const [meal, win, done] of [['lunch', LUNCH, lunchDone], ['dinner', DINNER, dinnerDone]] as const) {
        if (done || end + brk <= mustEndBy(win, c)) continue;
        const underWayAtMealtime = start <= win.to - win.duration && end >= win.from + win.duration;
        if (c.kind === 'attraction' && c.duration >= MEAL_ON_SITE_MIN_VISIT && underWayAtMealtime && !mealOnSite) {
          mealOnSite = meal;
        } else {
          blocked = meal === 'lunch' ? 'noRoomForLunch' : 'noRoomForDinner';
          break;
        }
      }
      if (blocked) {
        skip(c.id, blocked);
        continue;
      }
      // Waiting is allowed (better than idling) but long waits are penalised hard.
      const longWait = Math.max(0, wait - MAX_WAIT);
      const value = c.score - 1.5 * (leg.minutes + wait) - 2 * longWait + (c.mustInclude ? 1e6 : 0);
      if (input.trace) considered.push({ id: c.id, value });
      feasible.push({ c, start, leg, value, mealOnSite });
    }
    best = pickBest(feasible, cursor);
    if (best) {
      input.trace?.({
        kind: 'pick',
        at: cursor,
        chosen: best.c.id,
        start: best.start,
        end: best.start + best.c.duration,
        travel: best.leg.minutes,
        wait: best.start - cursor - best.leg.minutes,
        value: best.value,
        mealOnSite: best.mealOnSite,
        others: considered.filter((o) => o.id !== best!.c.id),
      });
      slots.push({
        key: slotKey(best.c.kind, best.c.id),
        kind: best.c.kind,
        refId: best.c.id,
        start: best.start,
        end: best.start + best.c.duration,
        fixed: false,
        meal: best.mealOnSite,
        travelBefore: best.leg,
      });
      if (best.mealOnSite === 'lunch') lunchDone = true;
      if (best.mealOnSite === 'dinner') dinnerDone = true;
      placed.push(best.c.id);
      remaining = remaining.filter((x) => x.id !== best!.c.id);
      if (best.c.kind === 'attraction') attractionsPlaced++;
      cursor = best.start + best.c.duration + brk;
      pos = best.c;
      continue;
    }

    // 3. Nothing flexible fits right now: go to whichever comes first —
    //    the next meal window or the next fixed-time event. Otherwise the day is done.
    const nextMealAt =
      !lunchDone && cursor < LUNCH.from ? LUNCH.from : !dinnerDone && cursor < DINNER.from ? DINNER.from : null;
    if (next && (nextMealAt == null || next.start <= nextMealAt)) {
      const leg = travel.leg(pos.id, pos.location, next.id, next.location);
      slots.push({
        key: slotKey('event', next.id),
        kind: 'event',
        refId: next.id,
        start: next.start,
        end: next.end,
        fixed: true,
        travelBefore: leg,
      });
      placed.push(next.id);
      fixedQueue.shift();
      input.trace?.({ kind: 'fixed', at: cursor, id: next.id, start: next.start, end: next.end, travel: leg.minutes });
      cursor = Math.max(cursor + leg.minutes, next.end) + brk;
      pos = next;
      continue;
    }
    if (nextMealAt != null) {
      // Free time until the meal; leave in time to be at the restaurant when the window opens.
      const meal = nextMealAt === LUNCH.from ? 'lunch' : 'dinner';
      input.trace?.({ kind: 'jump', at: cursor, to: nextMealAt, meal });
      if (meal === 'lunch') lunchDone = true;
      else dinnerDone = true;
      if (!placeMeal(meal)) cursor = Math.max(cursor, nextMealAt);
      continue;
    }
    const capped = attractionsPlaced >= maxAttractions && remaining.some((c) => c.kind === 'attraction');
    input.trace?.({ kind: 'end', at: cursor, why: capped ? 'maxAttractions' : 'nothingFits' });
    break;
  }

  return { slots, placed, restaurants: restaurantsUsed };
}

/* ------------------------------------------------------------------ */
/* Drag & drop: re-time a day in a user-chosen order                    */
/* ------------------------------------------------------------------ */

export type MoveReason = 'closed' | 'closedDay' | 'afterEnd' | 'overlap';

function spansMeal(meal: 'lunch' | 'dinner', start: number, end: number): boolean {
  const win = meal === 'lunch' ? LUNCH : DINNER;
  return start <= win.to - win.duration && end >= win.from + win.duration;
}

export interface OrderedItem extends Point {
  kind: ScheduledItem['kind'];
  /** Visit length (attractions, meals, flexible events). */
  duration: number;
  weeklyHours?: WeeklyHours;
  window?: { start: number; end: number };
  /** Set for events with a fixed time. */
  fixedStart?: number;
  fixedEnd?: number;
  meal?: 'lunch' | 'dinner';
  slotKey: string;
}

export type SimulateResult =
  | { ok: true; slots: ScheduledItem[] }
  | { ok: false; slotKey: string; refId: string; reason: MoveReason; otherRefId?: string; at: number };

/**
 * Walks the items in exactly the given order and computes start/end times.
 * Rejects the order (so the UI can snap back and explain why) if any item would be:
 *  - at an attraction/restaurant outside its opening hours ('closed' / 'closedDay'),
 *  - running into an event that has a fixed time ('overlap'),
 *  - finishing after the end of the traveller's day ('afterEnd').
 */
export function simulateOrder(
  order: OrderedItem[],
  ctx: { date: Date; dayStart: number; dayEnd: number; base: Point; travel: TravelTable; breakMinutes?: number },
): SimulateResult {
  const slots: ScheduledItem[] = [];
  let cursor = ctx.dayStart;
  let pos: Point = ctx.base;
  let previous: OrderedItem | null = null;

  for (const item of order) {
    const leg = ctx.travel.leg(pos.id, pos.location, item.id, item.location);
    const arrive = cursor + leg.minutes;
    let start: number;
    let end: number;

    if (item.fixedStart != null && item.fixedEnd != null) {
      if (arrive > item.fixedStart + 5) {
        // The thing before it runs into this fixed event.
        const culprit = previous ?? item;
        return { ok: false, slotKey: culprit.slotKey, refId: culprit.id, reason: 'overlap', otherRefId: item.id, at: arrive };
      }
      start = item.fixedStart;
      end = item.fixedEnd;
    } else if (item.window) {
      start = Math.max(arrive, item.window.start);
      end = start + item.duration;
      if (end > item.window.end) return { ok: false, slotKey: item.slotKey, refId: item.id, reason: 'closed', at: start };
    } else {
      const s = earliestOpenStart(item.weeklyHours, ctx.date, arrive, item.duration);
      if (s == null) {
        const check = checkOpen(item.weeklyHours, ctx.date, arrive, arrive + item.duration);
        return {
          ok: false,
          slotKey: item.slotKey,
          refId: item.id,
          reason: check === 'closedDay' ? 'closedDay' : 'closed',
          at: arrive,
        };
      }
      start = s;
      end = start + item.duration;
    }

    if (end > ctx.dayEnd) return { ok: false, slotKey: item.slotKey, refId: item.id, reason: 'afterEnd', at: end };

    slots.push({
      key: item.slotKey,
      kind: item.kind,
      refId: item.id,
      start,
      end,
      fixed: item.fixedStart != null,
      // A long visit keeps its "meal on site" only while it is still under way at mealtime.
      meal: item.kind === 'restaurant' || (item.meal && spansMeal(item.meal, start, end)) ? item.meal : undefined,
      travelBefore: leg,
    });
    // Same quiet break after each visit as when the day was planned (not after meals).
    cursor = end + (item.kind === 'restaurant' ? 0 : ctx.breakMinutes ?? 0);
    pos = item;
    previous = item;
  }
  return { ok: true, slots };
}

/** Moves the item at `from` to index `to` and re-times the day. */
export function tryMove(
  order: OrderedItem[],
  from: number,
  to: number,
  ctx: Parameters<typeof simulateOrder>[1],
): SimulateResult {
  const moved = order[from];
  if (!moved) throw new Error('bad index');
  if (moved.fixedStart != null) {
    return { ok: false, slotKey: moved.slotKey, refId: moved.id, reason: 'overlap', otherRefId: moved.id, at: moved.fixedStart };
  }
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, moved);
  return simulateOrder(next, ctx);
}

/**
 * Inserts an item into another day at the first position where the whole day still works,
 * preferring the position that adds the least travel. Used by "Move to another day".
 */
export function insertBest(
  order: OrderedItem[],
  item: OrderedItem,
  ctx: Parameters<typeof simulateOrder>[1],
): SimulateResult {
  let best: { res: Extract<SimulateResult, { ok: true }>; travel: number } | null = null;
  let firstFailure: SimulateResult | null = null;
  for (let i = 0; i <= order.length; i++) {
    const candidate = [...order];
    candidate.splice(i, 0, item);
    const res = simulateOrder(candidate, ctx);
    if (!res.ok) {
      firstFailure ??= res;
      continue;
    }
    const travel = res.slots.reduce((sum, s) => sum + (s.travelBefore?.minutes ?? 0), 0);
    if (!best || travel < best.travel) best = { res, travel };
  }
  return best?.res ?? firstFailure ?? { ok: false, slotKey: item.slotKey, refId: item.id, reason: 'afterEnd', at: ctx.dayEnd };
}

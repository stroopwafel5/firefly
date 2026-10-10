import { DayPlan, Location, ModeOfTravel, ScheduledItem } from '../models';
import { eventTiming } from './generator';
import { OrderedItem, SimulateResult, insertBest, simulateOrder, tryMove } from './scheduler';
import { toMinutes } from './time';
import { TravelTable } from './travel';

/** Editing operations on a planned day, used by the Trip Plan screen (drag & drop etc.). */

export function dayContext(day: DayPlan, mode: ModeOfTravel) {
  return {
    date: day.date,
    dayStart: toMinutes(day.start),
    dayEnd: toMinutes(day.end),
    base: day.base ? { id: day.base.id, location: day.base.location } : { id: `anchor:${day.id}`, location: day.anchor },
    travel: new TravelTable(mode, day.travel),
    breakMinutes: day.breakMinutes,
  };
}

export function locationOf(day: DayPlan, s: ScheduledItem): Location {
  if (s.kind === 'attraction') return day.findAttraction(s.refId)?.location ?? day.anchor;
  if (s.kind === 'event') return day.findEvent(s.refId)?.location ?? day.anchor;
  return day.findRestaurant(s.refId)?.location ?? day.anchor;
}

export function orderFromDay(day: DayPlan): OrderedItem[] {
  const ctxStart = toMinutes(day.start);
  const ctxEnd = toMinutes(day.end);
  return [...day.slots]
    .sort((a, b) => a.start - b.start)
    .map((s) => {
      const base: OrderedItem = {
        id: s.refId,
        kind: s.kind,
        location: locationOf(day, s),
        duration: s.end - s.start,
        slotKey: s.key,
        meal: s.meal,
      };
      if (s.kind === 'attraction') base.weeklyHours = day.findAttraction(s.refId)?.weeklyHours;
      if (s.kind === 'restaurant') base.weeklyHours = day.findRestaurant(s.refId)?.weeklyHours;
      if (s.kind === 'event') {
        const e = day.findEvent(s.refId);
        if (s.fixed) {
          base.fixedStart = s.start;
          base.fixedEnd = s.end;
        } else if (e) {
          const timing = eventTiming(e, ctxStart, ctxEnd);
          if ('window' in timing) base.window = timing.window;
        }
      }
      return base;
    });
}

function withSlots(day: DayPlan, slots: ScheduledItem[]): DayPlan {
  const copy = day.clone();
  copy.slots = slots;
  copy.pruneUnreferenced();
  return copy;
}

/** Drag & drop inside a day. Returns the new day, or why the move is not allowed. */
export function reorder(day: DayPlan, from: number, to: number, mode: ModeOfTravel): { day: DayPlan } | { error: SimulateResult & { ok: false } } {
  const res = tryMove(orderFromDay(day), from, to, dayContext(day, mode));
  return res.ok ? { day: withSlots(day, res.slots) } : { error: res };
}

/** Removes an item and re-times the rest (they may start earlier, never later). */
export function removeItem(day: DayPlan, slotKey: string, mode: ModeOfTravel): DayPlan {
  const order = orderFromDay(day).filter((o) => o.slotKey !== slotKey);
  const res = simulateOrder(order, dayContext(day, mode));
  const slots = res.ok ? res.slots : day.slots.filter((s) => s.key !== slotKey);
  return withSlots(day, slots);
}

/**
 * Moves an attraction to another day at the best position that still works there.
 * The attraction object travels with it; travel times on the new day are estimated until
 * the next refresh from the Routes API.
 */
export function moveToDay(
  fromDay: DayPlan,
  toDay: DayPlan,
  slotKey: string,
  mode: ModeOfTravel,
): { from: DayPlan; to: DayPlan } | { error: SimulateResult & { ok: false } } {
  const item = orderFromDay(fromDay).find((o) => o.slotKey === slotKey);
  const slot = fromDay.slots.find((s) => s.key === slotKey);
  if (!item || !slot || item.fixedStart != null) throw new Error('only flexible items can move');
  const res = insertBest(orderFromDay(toDay), item, dayContext(toDay, mode));
  if (!res.ok) return { error: res };
  const target = toDay.clone();
  if (slot.kind === 'attraction') {
    const a = fromDay.findAttraction(slot.refId);
    if (a && !target.findAttraction(a.id)) target.attractions.push(a);
  } else if (slot.kind === 'event') {
    const e = fromDay.findEvent(slot.refId);
    if (e && !target.findEvent(e.id)) target.events.push(e);
  } else {
    const r = fromDay.findRestaurant(slot.refId);
    if (r && !target.findRestaurant(r.id)) target.restaurants.push(r);
  }
  target.slots = res.slots;
  target.pruneUnreferenced();
  return { from: removeItem(fromDay, slotKey, mode), to: target };
}

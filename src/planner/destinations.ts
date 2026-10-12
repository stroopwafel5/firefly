import type { PickedPlace } from './generator';

/** One destination field of the trip form: the text typed, and the place when picked from the suggestions. */
export interface DestinationInput {
  text: string;
  pick?: PickedPlace;
}

const filled = (d: DestinationInput) => !!d.pick || !!d.text.trim();
const clean = (d: DestinationInput): DestinationInput => ({ text: d.text.trim(), pick: d.pick });

/**
 * The trip form's destinations → where the trip ends and the destinations visited on the way, in
 * order. The form has "Destination 1, 2…" (added with "Add more destinations") and then "Final
 * destination". The trip ends at the final destination; when it is empty, or "Come back to the
 * starting city at the end" is on (`backHome`), it ends back at the start — then the final
 * destination, if given, is the last one visited on the way. Empty fields are skipped.
 */
export function tripEnds(
  stops: readonly DestinationInput[],
  final: DestinationInput,
  backHome: boolean,
): { endingPoint: string; endPick?: PickedPlace; destinations: DestinationInput[] } {
  const between = stops.filter(filled).map(clean);
  if (!filled(final)) return { endingPoint: '', endPick: undefined, destinations: between };
  if (backHome) return { endingPoint: '', endPick: undefined, destinations: [...between, clean(final)] };
  return { endingPoint: final.text.trim() || final.pick?.name || '', endPick: final.pick, destinations: between };
}

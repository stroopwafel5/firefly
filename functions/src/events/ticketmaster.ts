import { TICKETMASTER_KEY } from '../params';
import { fetchJson, secret } from '../util';
import { TmResponse, mapTicketmaster, ticketmasterUrl } from './ticketmasterMap';
import { EventJSON, SearchArgs } from './types';

/** Ticketmaster Discovery API (see ticketmasterMap.ts for what is kept and what is rejected). */
export async function ticketmasterEvents(a: SearchArgs): Promise<EventJSON[]> {
  const key = secret(TICKETMASTER_KEY);
  if (!key) return [];
  return mapTicketmaster(await fetchJson<TmResponse>(ticketmasterUrl(a, key)), a);
}

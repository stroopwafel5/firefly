import type { Lang } from '../i18n/localized';
import { EventType, Location, PhotoSource, Time, isoDay } from './common';
import { parseLocalDay } from './Camp';

/** Card shown in the Weekend list (purple). */
export class EventElement {
  constructor(
    public id: string,
    public name: string,
    public description: string,
    public photos: string[],
    public link: string,
  ) {}
}

/** Where an event record came from. Every source must point to a public page. */
export type EventOrigin = 'curated' | 'admin' | 'ticketmaster';

export interface EventJSON {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  types: EventType[];
  country: string;
  price: number | null;
  link: string;
  photo_urls: string[];
  location: { locLat: number; locLon: number };
  photoSources: PhotoSource[];
  bookingLink?: string;
  venue: string;
  address: string;
  priceText?: string;
  currency?: string;
  startTime?: Time;
  endTime?: Time;
  datesConfirmed?: boolean;
  origin: EventOrigin;
  sourceName: string;
  createdBy?: string;
  /** Events uploaded by admins (the upload page) carry their texts in all three languages. */
  i18n?: { name?: Partial<Record<Lang, string>>; description?: Partial<Record<Lang, string>>; priceText?: Partial<Record<Lang, string>> };
}

/** The event's name, description and price line in `lang`, when it has them. */
export function localizeEventJSON(j: EventJSON, lang: Lang): EventJSON {
  const t = j.i18n;
  if (!t) return j;
  return { ...j, name: t.name?.[lang] || j.name, description: t.description?.[lang] || j.description, priceText: t.priceText?.[lang] || j.priceText };
}

/**
 * A real, in-person event. Spec fields come first; the extra fields make each event
 * verifiable (sourceName, link, photoSources) and plannable (venue, times).
 *
 * `price` is the lowest adult price in euro, 0 for free entry, or null when the
 * organizer has not published one (the UI then says "price on the official site").
 */
export class Event {
  private _id: string;
  private _name: string;
  private _description: string;
  private _startDate: Date;
  private _endDate: Date;
  private _types: EventType[];
  private _country: string;
  private _price: number | null;
  private _link: string;
  private _photo_urls: string[];
  private _location: Location;
  private _photoSources: PhotoSource[];
  private _bookingLink: string;
  private _venue: string;
  private _address: string;
  private _priceText: string;
  private _currency: string;
  private _startTime: Time | undefined;
  private _endTime: Time | undefined;
  private _datesConfirmed: boolean;
  private _origin: EventOrigin;
  private _sourceName: string;

  constructor(init: {
    id: string;
    name: string;
    description: string;
    startDate: Date;
    endDate: Date;
    types: EventType[];
    country: string;
    price: number | null;
    link: string;
    photo_urls: string[];
    location: Location;
    photoSources: PhotoSource[];
    venue: string;
    address: string;
    origin: EventOrigin;
    sourceName: string;
    bookingLink?: string;
    priceText?: string;
    currency?: string;
    startTime?: Time;
    endTime?: Time;
    datesConfirmed?: boolean;
  }) {
    this._id = init.id;
    this._name = init.name;
    this._description = init.description;
    this._startDate = init.startDate;
    this._endDate = init.endDate;
    this._types = init.types;
    this._country = init.country;
    this._price = init.price;
    this._link = init.link;
    this._photo_urls = init.photo_urls;
    this._location = init.location;
    this._photoSources = init.photoSources;
    this._venue = init.venue;
    this._address = init.address;
    this._origin = init.origin;
    this._sourceName = init.sourceName;
    this._bookingLink = init.bookingLink ?? '';
    this._priceText = init.priceText ?? '';
    this._currency = init.currency ?? 'EUR';
    this._startTime = init.startTime;
    this._endTime = init.endTime;
    this._datesConfirmed = init.datesConfirmed ?? true;
  }

  get id() { return this._id; }
  set id(v: string) { this._id = v; }
  get name() { return this._name; }
  set name(v: string) { this._name = v; }
  get description() { return this._description; }
  set description(v: string) { this._description = v; }
  get startDate() { return this._startDate; }
  set startDate(v: Date) { this._startDate = v; }
  get endDate() { return this._endDate; }
  set endDate(v: Date) { this._endDate = v; }
  get types() { return this._types; }
  set types(v: EventType[]) { this._types = v; }
  get country() { return this._country; }
  set country(v: string) { this._country = v; }
  get price() { return this._price; }
  set price(v: number | null) { this._price = v; }
  get link() { return this._link; }
  set link(v: string) { this._link = v; }
  get photo_urls() { return this._photo_urls; }
  set photo_urls(v: string[]) { this._photo_urls = v; }
  get location() { return this._location; }
  set location(v: Location) { this._location = v; }
  get photoSources() { return this._photoSources; }
  set photoSources(v: PhotoSource[]) { this._photoSources = v; }
  get bookingLink() { return this._bookingLink; }
  set bookingLink(v: string) { this._bookingLink = v; }
  get venue() { return this._venue; }
  set venue(v: string) { this._venue = v; }
  get address() { return this._address; }
  set address(v: string) { this._address = v; }
  get priceText() { return this._priceText; }
  set priceText(v: string) { this._priceText = v; }
  get currency() { return this._currency; }
  set currency(v: string) { this._currency = v; }
  get startTime() { return this._startTime; }
  set startTime(v: Time | undefined) { this._startTime = v; }
  get endTime() { return this._endTime; }
  set endTime(v: Time | undefined) { this._endTime = v; }
  get datesConfirmed() { return this._datesConfirmed; }
  set datesConfirmed(v: boolean) { this._datesConfirmed = v; }
  get origin() { return this._origin; }
  get sourceName() { return this._sourceName; }

  get isKidFriendly(): boolean {
    return this._types.includes('Kid Friendly') || this._types.includes('Family');
  }

  get isFree(): boolean {
    return this._price === 0;
  }

  /** True when the event runs on the given calendar day (local time). */
  occursOn(day: Date): boolean {
    const d = isoDay(day);
    return isoDay(this._startDate) <= d && d <= isoDay(this._endDate);
  }

  overlaps(from: Date, to: Date): boolean {
    return isoDay(this._startDate) <= isoDay(to) && isoDay(from) <= isoDay(this._endDate);
  }

  toElement(): EventElement {
    return new EventElement(this._id, this._name, this._description, [...this._photo_urls], this._link);
  }

  toJSON(): EventJSON {
    return {
      id: this._id,
      name: this._name,
      description: this._description,
      startDate: isoDay(this._startDate),
      endDate: isoDay(this._endDate),
      types: this._types,
      country: this._country,
      price: this._price,
      link: this._link,
      photo_urls: this._photo_urls,
      location: this._location.toJSON(),
      photoSources: this._photoSources,
      bookingLink: this._bookingLink || undefined,
      venue: this._venue,
      address: this._address,
      priceText: this._priceText || undefined,
      currency: this._currency,
      startTime: this._startTime,
      endTime: this._endTime,
      datesConfirmed: this._datesConfirmed,
      origin: this._origin,
      sourceName: this._sourceName,
    };
  }

  static fromJSON(j: EventJSON): Event {
    return new Event({
      ...j,
      startDate: parseLocalDay(j.startDate),
      endDate: parseLocalDay(j.endDate),
      location: Location.from(j.location),
      photoSources: j.photoSources ?? [],
    });
  }
}

/**
 * Validation shared by the admin form, the Firestore rules mirror and the Ticketmaster
 * adapter: an event is accepted only if it is physical and verifiable.
 * Returns a list of problems (empty = valid). Problem codes are translated by the UI.
 */
export function validateEvent(e: EventJSON): string[] {
  const problems: string[] = [];
  const isHttp = (u?: string) => !!u && /^https?:\/\/[^\s]+\.[^\s]+/.test(u);
  if (!e.name?.trim()) problems.push('missingName');
  if (!isHttp(e.link)) problems.push('missingSourceLink');
  if (!e.venue?.trim() || !e.address?.trim()) problems.push('missingVenue');
  const loc = new Location(e.location?.locLat, e.location?.locLon);
  if (!loc.isValid()) problems.push('missingMapPin');
  if (ONLINE_PATTERN.test(`${e.name} ${e.venue} ${e.address}`)) problems.push('onlineEvent');
  if (!e.photo_urls?.length) problems.push('missingPhoto');
  if (
    e.photo_urls?.length !== e.photoSources?.length ||
    e.photoSources.some((p) => !isHttp(p.sourcePage) || !p.credit?.trim())
  ) {
    problems.push('missingPhotoSource');
  }
  if (!e.types?.length) problems.push('missingType');
  if (!e.startDate || !e.endDate || e.endDate < e.startDate) problems.push('badDates');
  return problems;
}

/** Listings that are not physical: livestreams, webinars, virtual/online-only. */
export const ONLINE_PATTERN =
  /\b(online|virtual|livestream|live stream|live-stream|webinar|zoom|streaming only|stream)\b|אונליין|וירטואלי|онлайн|трансляци/i;

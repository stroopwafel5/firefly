import {
  EventType,
  Location,
  ModeOfTravel,
  PhotoSource,
  Time,
  WeeklyHours,
  isoDay,
} from './common';
import { Event, EventJSON } from './Event';
import type { User } from './User';
import type { AccessibilitySource } from './Accessibility';
import { AttractionKind, isKind, kindFromText, popularityOf } from './AttractionKind';

/* ------------------------------------------------------------------ */
/* Attraction                                                          */
/* ------------------------------------------------------------------ */

export class AttractionElement {
  constructor(
    public id: string,
    public name: string,
    public description: string,
    public photos: string[],
    public link: string,
    public openingHours: Time[],
  ) {}
}

export interface AttractionJSON {
  id: string;
  name: string;
  description: string;
  types: EventType[];
  country: string;
  price: number | null;
  link: string;
  photo_urls: string[];
  photoSources: PhotoSource[];
  location: { locLat: number; locLon: number };
  openingHours: Time[];
  weeklyHours?: WeeklyHours;
  rating?: number;
  numReviews?: number;
  /** Where the place comes from: Tripadvisor (main source) or Wikidata (free backup). */
  provider: AttractionProvider;
  category?: string;
  suggestedMinutes?: number;
  address?: string;
  /** The venue's official website (from Tripadvisor). */
  website?: string;
  /** Needs a verifiable source confirms (see Accessibility.ts). */
  disabilityCompatible?: string[];
  /** Where each confirmation comes from, so people can check it. */
  accessibilitySources?: AccessibilitySource[];
  /** Castle, national park, museum… (see AttractionKind.ts). */
  kind?: AttractionKind;
  /** 0–10: how popular the place is (Tripadvisor rating & reviews, or Wikipedia coverage). */
  popularity?: number;
  wikidataId?: string;
}

export type AttractionProvider = 'tripadvisor' | 'wikidata';

/**
 * A place to visit, from TripAdvisor (link = the TripAdvisor listing) or Wikidata (link = its
 * Wikipedia article). Both are treated exactly the same way by the planner and the screens.
 * `openingHours` follows the spec as a flat [open, close, open, close…] list for a typical day;
 * `weeklyHours` keeps the full week so the planner can respect "closed on Mondays".
 */
export class Attraction {
  constructor(
    public id: string,
    public name: string,
    public description: string,
    public types: EventType[],
    public country: string,
    public price: number | null,
    public link: string,
    public photo_urls: string[],
    public location: Location,
    public openingHours: Time[],
    public photoSources: PhotoSource[] = [],
    public weeklyHours: WeeklyHours | undefined = undefined,
    public rating: number | undefined = undefined,
    public numReviews: number | undefined = undefined,
    public category = '',
    public suggestedMinutes = 90,
    public address = '',
    public website = '',
    /** Disabilities this place is confirmed to suit — only from a verifiable source. */
    public disabilityCompatible: string[] = [],
    public accessibilitySources: AccessibilitySource[] = [],
    public kind: AttractionKind = 'other',
    public popularity: number | undefined = undefined,
    public provider: AttractionProvider = 'tripadvisor',
    public wikidataId = '',
  ) {}

  /** 0–10 (see AttractionKind.popularityOf). */
  get score(): number {
    return popularityOf(this);
  }

  toElement(): AttractionElement {
    return new AttractionElement(this.id, this.name, this.description, [...this.photo_urls], this.link, [
      ...this.openingHours,
    ]);
  }

  toJSON(): AttractionJSON {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      types: this.types,
      country: this.country,
      price: this.price,
      link: this.link,
      photo_urls: this.photo_urls,
      photoSources: this.photoSources,
      location: this.location.toJSON(),
      openingHours: this.openingHours,
      weeklyHours: this.weeklyHours,
      rating: this.rating,
      numReviews: this.numReviews,
      provider: this.provider,
      category: this.category,
      suggestedMinutes: this.suggestedMinutes,
      address: this.address,
      website: this.website,
      disabilityCompatible: this.disabilityCompatible,
      accessibilitySources: this.accessibilitySources,
      kind: this.kind,
      popularity: this.popularity,
      wikidataId: this.wikidataId || undefined,
    };
  }

  static fromJSON(j: AttractionJSON): Attraction {
    return new Attraction(
      j.id,
      j.name,
      j.description,
      j.types ?? [],
      j.country,
      j.price ?? null,
      j.link,
      j.photo_urls ?? [],
      Location.from(j.location),
      j.openingHours ?? [],
      j.photoSources ?? [],
      j.weeklyHours,
      j.rating,
      j.numReviews,
      j.category ?? '',
      j.suggestedMinutes ?? 90,
      j.address ?? '',
      j.website ?? '',
      j.disabilityCompatible ?? [],
      j.accessibilitySources ?? [],
      isKind(j.kind) ? j.kind : kindFromText(`${j.category ?? ''} ${j.name}`),
      typeof j.popularity === 'number' ? j.popularity : undefined,
      j.provider === 'wikidata' ? 'wikidata' : 'tripadvisor',
      j.wikidataId ?? '',
    );
  }
}

/* ------------------------------------------------------------------ */
/* Restaurant & Hotel (no in-app page: they open their source listing)  */
/* ------------------------------------------------------------------ */

export class RestaurantElement {
  constructor(
    public id: string,
    public name: string,
    public description: string,
    public photos: string[],
    public link: string,
    public openingHours: Time[],
  ) {}
}

export interface RestaurantJSON {
  id: string;
  name: string;
  description: string;
  photos: string[];
  photoSources: PhotoSource[];
  linkToPage: string;
  location: { locLat: number; locLon: number };
  openingHours: Time[];
  weeklyHours?: WeeklyHours;
  cuisine?: string[];
  priceLevel?: string;
  rating?: number;
}

/** Spec: Restaurant (id, description, photos, linkToPage, location, openingHours) + name. */
export class Restaurant {
  constructor(
    public id: string,
    public name: string,
    public description: string,
    public photos: string[],
    public linkToPage: string,
    public location: Location,
    public openingHours: Time[],
    public photoSources: PhotoSource[] = [],
    public weeklyHours: WeeklyHours | undefined = undefined,
    public cuisine: string[] = [],
    public priceLevel = '',
    public rating: number | undefined = undefined,
  ) {}

  toElement(): RestaurantElement {
    return new RestaurantElement(this.id, this.name, this.description, [...this.photos], this.linkToPage, [
      ...this.openingHours,
    ]);
  }

  toJSON(): RestaurantJSON {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      photos: this.photos,
      photoSources: this.photoSources,
      linkToPage: this.linkToPage,
      location: this.location.toJSON(),
      openingHours: this.openingHours,
      weeklyHours: this.weeklyHours,
      cuisine: this.cuisine,
      priceLevel: this.priceLevel,
      rating: this.rating,
    };
  }

  static fromJSON(j: RestaurantJSON): Restaurant {
    return new Restaurant(
      j.id,
      j.name,
      j.description,
      j.photos ?? [],
      j.linkToPage,
      Location.from(j.location),
      j.openingHours ?? [],
      j.photoSources ?? [],
      j.weeklyHours,
      j.cuisine ?? [],
      j.priceLevel ?? '',
      j.rating,
    );
  }
}

export class HotelElement {
  constructor(
    public id: string,
    public name: string,
    public description: string,
    public photos: string[],
    public link: string,
  ) {}
}

export interface HotelJSON {
  id: string;
  name: string;
  description: string;
  photos: string[];
  photoSources: PhotoSource[];
  price: number | null;
  linkToBooking: string;
  linkToListing: string;
  locLat: number;
  locLon: number;
  rating?: number;
  currency?: string;
  bookingVia?: HotelBookingVia;
  linkToBookingCom?: string;
  source?: HotelSource;
}

export type HotelBookingVia = 'agoda' | 'website' | 'booking.com';
export type HotelSource = 'agoda' | 'google-hotels' | 'tripadvisor';

/**
 * Spec: Hotel (id, description, photos, price, linkToBooking, locLat, locLon) + name.
 * `price` is the lowest price per night for the trip's dates and party (null if unknown), in
 * `currency`. `linkToBooking` is where to book: Agoda (affiliate link), the hotel's own site,
 * or a pre-filled Booking.com search (`bookingVia` says which); `linkToBookingCom` is always a
 * Booking.com search to compare; `linkToListing` is the TripAdvisor page, if it came from there.
 */
export class Hotel {
  constructor(
    public id: string,
    public name: string,
    public description: string,
    public photos: string[],
    public price: number | null,
    public linkToBooking: string,
    public locLat: number,
    public locLon: number,
    public linkToListing = '',
    public photoSources: PhotoSource[] = [],
    public rating: number | undefined = undefined,
    public currency = '',
    public bookingVia: HotelBookingVia = 'booking.com',
    public linkToBookingCom = '',
    public source: HotelSource = 'tripadvisor',
  ) {}

  get location(): Location {
    return new Location(this.locLat, this.locLon);
  }

  toElement(): HotelElement {
    return new HotelElement(this.id, this.name, this.description, [...this.photos], this.linkToBooking);
  }

  toJSON(): HotelJSON {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      photos: this.photos,
      photoSources: this.photoSources,
      price: this.price,
      linkToBooking: this.linkToBooking,
      linkToListing: this.linkToListing,
      locLat: this.locLat,
      locLon: this.locLon,
      rating: this.rating,
      currency: this.currency || undefined,
      bookingVia: this.bookingVia,
      linkToBookingCom: this.linkToBookingCom || undefined,
      source: this.source,
    };
  }

  static fromJSON(j: HotelJSON): Hotel {
    return new Hotel(
      j.id,
      j.name,
      j.description,
      j.photos ?? [],
      j.price ?? null,
      j.linkToBooking,
      j.locLat,
      j.locLon,
      j.linkToListing ?? '',
      j.photoSources ?? [],
      j.rating,
      j.currency ?? '',
      j.bookingVia ?? 'booking.com',
      j.linkToBookingCom ?? (j.bookingVia && j.bookingVia !== 'booking.com' ? '' : j.linkToBooking),
      j.source ?? 'tripadvisor',
    );
  }
}

/* ------------------------------------------------------------------ */
/* DayPlan                                                              */
/* ------------------------------------------------------------------ */

export type ItemKind = 'attraction' | 'event' | 'restaurant';

export interface TravelLeg {
  minutes: number;
  distanceMeters: number;
  mode: ModeOfTravel;
  /** true when computed from straight-line distance because the routing API had no answer. */
  estimated: boolean;
}

/** One block on the day's timeline. Times are minutes after midnight (may exceed 1440). */
export interface ScheduledItem {
  key: string;
  kind: ItemKind;
  refId: string;
  start: number;
  end: number;
  /** Fixed items (events with a set time) are never moved by drag & drop. */
  fixed: boolean;
  meal?: 'lunch' | 'dinner';
  travelBefore?: TravelLeg;
}

export interface FunFact {
  attractionId: string;
  text: string;
  sourceUrl: string;
  sourceTitle: string;
}

export interface KidText {
  attractionId: string;
  text: string;
  sourceUrl: string;
  sourceTitle: string;
}

export interface DayPlanJSON {
  id: number;
  date: string;
  start: Time;
  end: Time;
  anchor: { locLat: number; locLon: number };
  anchorName: string;
  attractions: AttractionJSON[];
  events: EventJSON[];
  restaurants: RestaurantJSON[];
  hotel: HotelJSON | null;
  slots: ScheduledItem[];
  funFacts?: FunFact[];
  kidTexts?: KidText[];
  travel?: Record<string, [number, number]>;
  base?: { id: string; name: string; location: { locLat: number; locLon: number } };
  breakMinutes?: number;
  placePhoto?: PlacePhoto | null;
}

/**
 * A real photograph of the day's place (its best-known sight, e.g. Prague Castle for Prague), from
 * Wikimedia Commons or Tripadvisor, with the page it comes from and its credit. Never AI-made.
 */
export interface PlacePhoto {
  url: string;
  sourcePage: string;
  credit: string;
  /** What the photo shows ("Prague Castle"). */
  title: string;
}

/** File names that say a picture is AI-made: never shown. */
export const AI_IMAGE = /ai[-_ ]?generated|midjourney|dall[-·_ ]?e|stable[-_ ]?diffusion|generative[-_ ]?ai|\bai[-_ ]art\b/i;

/** Where a day starts: last night's hotel, or the trip's starting city on day 1. */
export interface DayBase {
  id: string;
  name: string;
  location: Location;
}

/**
 * Spec: DayPlan (id, start, end, attractions, events, restaurants, hotel).
 * Added: the date, the town the day is based around, and `slots` — the ordered timeline
 * with travel legs. `attractions/events/restaurants` hold the full objects referenced by slots.
 */
export class DayPlan {
  constructor(
    public id: number,
    public start: Time,
    public end: Time,
    public attractions: Attraction[],
    public events: Event[],
    public restaurants: Restaurant[],
    public hotel: Hotel | null,
    public date: Date = new Date(),
    public slots: ScheduledItem[] = [],
    public anchor: Location = new Location(0, 0),
    public anchorName = '',
    public funFacts: FunFact[] = [],
    public kidTexts: KidText[] = [],
    /** Travel minutes/meters between this day's points ("fromId>toId"), from the Routes API. */
    public travel: Record<string, [number, number]> = {},
    public base: DayBase | null = null,
    /** A quiet break after each visit (accessibility pacing); kept when the day is re-ordered. */
    public breakMinutes = 0,
    /** A photo of the day's place (see PlacePhoto). */
    public placePhoto: PlacePhoto | null = null,
  ) {}

  findAttraction(id: string) {
    return this.attractions.find((a) => a.id === id);
  }
  findEvent(id: string) {
    return this.events.find((e) => e.id === id);
  }
  findRestaurant(id: string) {
    return this.restaurants.find((r) => r.id === id);
  }

  /** Drops objects no slot refers to any more (after removing an item). */
  pruneUnreferenced(): void {
    const ids = (k: ItemKind) => new Set(this.slots.filter((s) => s.kind === k).map((s) => s.refId));
    const a = ids('attraction');
    const e = ids('event');
    const r = ids('restaurant');
    this.attractions = this.attractions.filter((x) => a.has(x.id));
    this.events = this.events.filter((x) => e.has(x.id));
    this.restaurants = this.restaurants.filter((x) => r.has(x.id));
  }

  clone(): DayPlan {
    return DayPlan.fromJSON(this.toJSON());
  }

  toJSON(): DayPlanJSON {
    return {
      id: this.id,
      date: isoDay(this.date),
      start: this.start,
      end: this.end,
      anchor: this.anchor.toJSON(),
      anchorName: this.anchorName,
      attractions: this.attractions.map((a) => a.toJSON()),
      events: this.events.map((e) => e.toJSON()),
      restaurants: this.restaurants.map((r) => r.toJSON()),
      hotel: this.hotel ? this.hotel.toJSON() : null,
      slots: this.slots.map((s) => ({ ...s })),
      funFacts: this.funFacts,
      kidTexts: this.kidTexts,
      travel: this.travel,
      base: this.base ? { id: this.base.id, name: this.base.name, location: this.base.location.toJSON() } : undefined,
      breakMinutes: this.breakMinutes,
      placePhoto: this.placePhoto,
    };
  }

  static fromJSON(j: DayPlanJSON): DayPlan {
    const [y, m, d] = j.date.split('-').map(Number);
    return new DayPlan(
      j.id,
      j.start,
      j.end,
      j.attractions.map(Attraction.fromJSON),
      j.events.map(Event.fromJSON),
      j.restaurants.map(Restaurant.fromJSON),
      j.hotel ? Hotel.fromJSON(j.hotel) : null,
      new Date(y, m - 1, d),
      j.slots.map((s) => ({ ...s })),
      Location.from(j.anchor),
      j.anchorName,
      j.funFacts ?? [],
      j.kidTexts ?? [],
      j.travel ?? {},
      j.base ? { id: j.base.id, name: j.base.name, location: Location.from(j.base.location) } : null,
      j.breakMinutes ?? 0,
      j.placePhoto ?? null,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Trip                                                                 */
/* ------------------------------------------------------------------ */

export interface TripJSON {
  id: number;
  name: string;
  description: string;
  people: string[];
  numAdults: number;
  numKids: number;
  types: EventType[];
  startingPoint: string;
  endingPoint: string;
  locStart: { locLat: number; locLon: number };
  locEnd: { locLat: number; locLon: number };
  startDate: string;
  endDate: string;
  mustSee: AttractionJSON[];
  mustDo: EventJSON[];
  itinerary: DayPlanJSON[];
  ModeOfTravel: ModeOfTravel;
  withEvents: boolean;
  kidFriendly: boolean;
  dayStart: number;
  dayEnd: number;
  ownerId: string;
  createdAt?: number;
  /** Accessibility needs chosen for this trip (see Accessibility.ts). */
  accessNeeds?: string[];
  /** Only places confirmed for those needs were used. */
  accessStrict?: boolean;
  /** Notes about how the plan was made (e.g. "tripadvisorBusy"), shown at the top of the plan. */
  notes?: string[];
}

/**
 * Spec: Trip (id, name, description, people, numAdults, numKids, types, startingPoint,
 * endingPoint, locStart, locEnd, startDate, endDate, mustSee, mustDo, itinerary, ModeOfTravel).
 * `people` is stored as user ids in Firestore; the screen resolves them to User objects.
 */
export class Trip {
  constructor(
    public id: number,
    public name: string,
    public description: string,
    public people: Array<User | string>,
    public numAdults: number,
    public numKids: number,
    public types: EventType[],
    public startingPoint: string,
    public endingPoint: string,
    public locStart: Location,
    public locEnd: Location,
    public startDate: Date,
    public endDate: Date,
    public mustSee: Attraction[],
    public mustDo: Event[],
    public itinerary: DayPlan[],
    public ModeOfTravel: ModeOfTravel,
    public withEvents = true,
    public kidFriendly = false,
    public dayStart = 8 * 60,
    public dayEnd = 20 * 60,
    public ownerId = '',
    public accessNeeds: string[] = [],
    public accessStrict = false,
    public notes: string[] = [],
  ) {}

  /** The pink kids' plan exists only for family trips. */
  get isFamilyTrip(): boolean {
    return this.numKids > 0;
  }

  get numDays(): number {
    return Math.round((stripTime(this.endDate) - stripTime(this.startDate)) / 86_400_000) + 1;
  }

  peopleIds(): string[] {
    return this.people.map((p) => (typeof p === 'string' ? p : p.uid));
  }

  toJSON(): TripJSON {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      people: this.peopleIds(),
      numAdults: this.numAdults,
      numKids: this.numKids,
      types: this.types,
      startingPoint: this.startingPoint,
      endingPoint: this.endingPoint,
      locStart: this.locStart.toJSON(),
      locEnd: this.locEnd.toJSON(),
      startDate: isoDay(this.startDate),
      endDate: isoDay(this.endDate),
      mustSee: this.mustSee.map((a) => a.toJSON()),
      mustDo: this.mustDo.map((e) => e.toJSON()),
      itinerary: this.itinerary.map((d) => d.toJSON()),
      ModeOfTravel: this.ModeOfTravel,
      withEvents: this.withEvents,
      kidFriendly: this.kidFriendly,
      dayStart: this.dayStart,
      dayEnd: this.dayEnd,
      ownerId: this.ownerId,
      accessNeeds: this.accessNeeds,
      accessStrict: this.accessStrict,
      notes: this.notes,
    };
  }

  static fromJSON(j: TripJSON): Trip {
    const day = (s: string) => {
      const [y, m, d] = s.split('-').map(Number);
      return new Date(y, m - 1, d);
    };
    return new Trip(
      j.id,
      j.name,
      j.description,
      j.people ?? [],
      j.numAdults,
      j.numKids,
      j.types ?? [],
      j.startingPoint,
      j.endingPoint,
      Location.from(j.locStart),
      Location.from(j.locEnd),
      day(j.startDate),
      day(j.endDate),
      (j.mustSee ?? []).map(Attraction.fromJSON),
      (j.mustDo ?? []).map(Event.fromJSON),
      (j.itinerary ?? []).map(DayPlan.fromJSON),
      j.ModeOfTravel,
      j.withEvents,
      j.kidFriendly,
      j.dayStart,
      j.dayEnd,
      j.ownerId,
      j.accessNeeds ?? [],
      j.accessStrict ?? false,
      j.notes ?? [],
    );
  }
}

function stripTime(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

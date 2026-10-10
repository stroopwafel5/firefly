import { PhotoSource, isoDay, toDate } from './common';

/** Camps are Different Route's own unless another provider is named (no booking for those yet). */
export const DEFAULT_PROVIDER = 'Differentroute';

/** Lightweight card shown in the Camps list (orange). */
export class CampElement {
  constructor(
    public id: number,
    public name: string,
    public description: string,
    public photos: string[],
    public linkToCampPage: string,
    /** Extra fields the list needs for filtering/badges. */
    public meta: {
      startDate: Date;
      endDate: Date;
      minAge: number;
      maxAge: number;
      country: string;
      price: number;
      currency: string;
      provider: string;
      disability: string[];
    },
  ) {}
}

/**
 * Data behind the single, shared Camp Page screen. `dayByDayItinerary` is a plain array of
 * day descriptions mirroring differentroute.net (rephrased), NOT DayPlan objects.
 */
export class CampPage {
  constructor(
    public id: number,
    public campName: string,
    public description: string,
    public startDate: Date,
    public endDate: Date,
    public photos: string[],
    public dayByDayItinerary: string[],
    public photoSources: PhotoSource[] = [],
    public sourceUrl = '',
    public included: string[] = [],
  ) {}
}

export interface CampJSON {
  id: number;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  minAge: number;
  maxAge: number;
  country: string;
  price: number;
  link: string;
  photos: string[];
  photoSources?: PhotoSource[];
  currency?: string;
  location?: string;
  /** Who runs the camp (default "Differentroute"). */
  provider?: string;
  /** Needs the camp supports (see Accessibility.ts); empty for now. */
  disability?: string[];
}

export class Camp {
  private _id: number;
  private _name: string;
  private _description: string;
  private _startDate: Date;
  private _endDate: Date;
  private _minAge: number;
  private _maxAge: number;
  private _country: string;
  private _price: number;
  private _link: string;
  private _photos: string[];
  /** Not in the spec: provenance of each photo (same order as photos). */
  private _photoSources: PhotoSource[];
  /** Not in the spec: prices on differentroute.net are in euro. */
  private _currency: string;
  /** Not in the spec: town / region shown under the name, e.g. "Luoyang, Henan". */
  private _locationName: string;
  /** Who runs the camp. Only Different Route camps can be booked in the app for now. */
  private _provider: string;
  /** Disabilities the camp supports (autism, adhd, hearing, blind, mentalHealth, physical, intellectual). */
  private _disability: string[];

  constructor(
    id: number,
    name: string,
    description: string,
    startDate: Date,
    endDate: Date,
    minAge: number,
    maxAge: number,
    country: string,
    price: number,
    link: string,
    photos: string[],
    photoSources: PhotoSource[] = [],
    currency = 'EUR',
    locationName = '',
    provider = DEFAULT_PROVIDER,
    disability: string[] = [],
  ) {
    this._id = id;
    this._name = name;
    this._description = description;
    this._startDate = startDate;
    this._endDate = endDate;
    this._minAge = minAge;
    this._maxAge = maxAge;
    this._country = country;
    this._price = price;
    this._link = link;
    this._photos = photos;
    this._photoSources = photoSources;
    this._currency = currency;
    this._locationName = locationName;
    this._provider = provider || DEFAULT_PROVIDER;
    this._disability = disability;
  }

  get id() { return this._id; }
  set id(v: number) { this._id = v; }
  get name() { return this._name; }
  set name(v: string) { this._name = v; }
  get description() { return this._description; }
  set description(v: string) { this._description = v; }
  get startDate() { return this._startDate; }
  set startDate(v: Date) { this._startDate = v; }
  get endDate() { return this._endDate; }
  set endDate(v: Date) { this._endDate = v; }
  get minAge() { return this._minAge; }
  set minAge(v: number) { this._minAge = v; }
  get maxAge() { return this._maxAge; }
  set maxAge(v: number) { this._maxAge = v; }
  get country() { return this._country; }
  set country(v: string) { this._country = v; }
  get price() { return this._price; }
  set price(v: number) { this._price = v; }
  get link() { return this._link; }
  set link(v: string) { this._link = v; }
  get photos() { return this._photos; }
  set photos(v: string[]) { this._photos = v; }
  get photoSources() { return this._photoSources; }
  set photoSources(v: PhotoSource[]) { this._photoSources = v; }
  get currency() { return this._currency; }
  set currency(v: string) { this._currency = v; }
  get locationName() { return this._locationName; }
  set locationName(v: string) { this._locationName = v; }
  get provider() { return this._provider; }
  set provider(v: string) { this._provider = v; }
  get disability() { return this._disability; }
  set disability(v: string[]) { this._disability = v; }

  /** Booking in the app is only for Different Route's own camps (for now). */
  get bookableInApp(): boolean {
    return this._provider === DEFAULT_PROVIDER;
  }

  /** Number of nights/days the camp lasts (inclusive of both ends). */
  get durationDays(): number {
    return Math.round((this._endDate.getTime() - this._startDate.getTime()) / 86_400_000) + 1;
  }

  acceptsAge(age: number): boolean {
    return age >= this._minAge && age <= this._maxAge;
  }

  toElement(): CampElement {
    return new CampElement(this._id, this._name, this._description, [...this._photos], this._link, {
      startDate: this._startDate,
      endDate: this._endDate,
      minAge: this._minAge,
      maxAge: this._maxAge,
      country: this._country,
      price: this._price,
      currency: this._currency,
      provider: this._provider,
      disability: [...this._disability],
    });
  }

  toJSON(): CampJSON {
    return {
      id: this._id,
      name: this._name,
      description: this._description,
      startDate: isoDay(this._startDate),
      endDate: isoDay(this._endDate),
      minAge: this._minAge,
      maxAge: this._maxAge,
      country: this._country,
      price: this._price,
      link: this._link,
      photos: this._photos,
      photoSources: this._photoSources,
      currency: this._currency,
      location: this._locationName,
      provider: this._provider,
      disability: this._disability,
    };
  }

  static fromJSON(j: CampJSON): Camp {
    return new Camp(
      j.id,
      j.name,
      j.description,
      parseLocalDay(j.startDate),
      parseLocalDay(j.endDate),
      j.minAge,
      j.maxAge,
      j.country,
      j.price,
      j.link,
      j.photos ?? [],
      j.photoSources ?? [],
      j.currency ?? 'EUR',
      j.location ?? '',
      j.provider ?? DEFAULT_PROVIDER,
      j.disability ?? [],
    );
  }
}

/** "2027-07-08" → local midnight (avoids the UTC off-by-one of `new Date("2027-07-08")`). */
export function parseLocalDay(value: string | Date): Date {
  if (value instanceof Date) return value;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return toDate(value);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

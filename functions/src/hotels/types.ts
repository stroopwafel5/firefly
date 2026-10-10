/** What `hotelsNear` returns (mirrors HotelJSON in src/models/Trip.ts). */
export interface HotelOut {
  id: string;
  name: string;
  description: string;
  photos: string[];
  photoSources: Array<{ url: string; sourcePage: string; credit: string }>;
  /** Lowest price per night for the requested dates and party, or null if unknown. */
  price: number | null;
  currency?: string;
  /** Where to book: Agoda (affiliate link), the hotel's own website, or a Booking.com search. */
  linkToBooking: string;
  bookingVia: 'agoda' | 'website' | 'booking.com';
  /** Booking.com search for the same hotel, dates and guests (always offered to compare). */
  linkToBookingCom: string;
  /** The page the hotel was found on (TripAdvisor listing), if any. */
  linkToListing: string;
  locLat: number;
  locLon: number;
  /** 0–5 */
  rating?: number;
  source: 'agoda' | 'google-hotels' | 'tripadvisor';
}

export interface Stay {
  checkIn: string;
  checkOut: string;
  adults: number;
  kids: number;
}

export type Lang = 'en' | 'he' | 'ru';

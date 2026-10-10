/**
 * Booking.com search pre-filled with this hotel, the dates and the party size.
 * Children's ages aren't known at planning time, so each child is sent as 10 years old;
 * travellers can change it on Booking.com before paying.
 */
export function bookingUrl(
  name: string,
  city: string,
  checkIn: string,
  checkOut: string,
  adults: number,
  kids: number,
  lang: 'en' | 'he' | 'ru',
  aid = '',
): string {
  const p = new URLSearchParams({
    ss: `${name}${city ? `, ${city}` : ''}`,
    checkin: checkIn,
    checkout: checkOut,
    group_adults: String(Math.max(1, adults)),
    group_children: String(kids),
    no_rooms: String(Math.max(1, Math.ceil((adults + kids) / 4))),
    lang: lang === 'en' ? 'en-gb' : lang,
  });
  for (let i = 0; i < kids; i++) p.append('age', '10');
  if (aid) p.set('aid', aid);
  return `https://www.booking.com/searchresults.html?${p}`;
}

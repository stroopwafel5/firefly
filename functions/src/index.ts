import { initializeApp } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2';

initializeApp();
// Europe-west1 (Belgium) is close to both Israel and the camp destinations.
setGlobalOptions({ region: 'europe-west1', maxInstances: 20 });

export { geocode, reverseGeocode, routeLine, travelMatrix } from './google';
export { attractionsNear, restaurantsNear, placeSearch, attractionDetails } from './tripadvisor';
export { hotelsNear } from './hotels';
export { attractionAccessibility } from './accessibility';
export { buildAttractionCache, refreshAttractionCache } from './attractions';
export { searchEvents } from './events/search';
export { refreshFallbackEvents, refreshFallbackNow } from './events/fallback';
export { createPaypalOrder, capturePaypalOrder } from './paypal';
export { createGrowPayment, growNotify } from './grow';
export { onBookingCreated, onBookingPaid } from './bookings';
export {
  sendFriendRequest,
  respondFriendRequest,
  setGoing,
  saveEvent,
  addTripPeople,
  onTripCreated,
} from './social';
export { kidify, reportPhoto, checkCampPages } from './misc';

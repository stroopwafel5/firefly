import { initializeApp } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2';

initializeApp();
// Europe-west1 (Belgium) is close to both Israel and the camp destinations.
// invoker 'public': the web functions (the upload page, the payment webhook) stay public on every
// deploy. The app's callable functions are made public by Firebase when they are first created; if
// one ever answers 401 "The access token could not be verified", delete it and deploy it again
// (HOW_TO_TEST.md §10). Each function still checks who is signed in itself.
setGlobalOptions({ region: 'europe-west1', maxInstances: 20, invoker: 'public' });

export { geocode, placeSuggest, reverseGeocode, routeLine, travelMatrix } from './google';
export { attractionsNear, restaurantsNear, placeSearch, attractionDetails } from './tripadvisor';
export { hotelsNear } from './hotels';
export { attractionAccessibility } from './accessibility';
export { buildAttractionCache, refreshAttractionCache } from './attractions';
export { searchEvents } from './events/search';
export { refreshFallbackEvents, refreshFallbackNow } from './events/fallback';
export { eventScout, scoutEventsNow } from './events/scout';
export { eventsAround } from './events/around';
export { eventsUpload, processEventsUpload } from './events/upload';
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

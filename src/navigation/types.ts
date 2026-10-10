import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootParams = {
  Tabs: undefined;
  CampPage: { campId: number };
  CampBooking: { campId: number };
  PayPal: { bookingId: string; approveUrl: string; orderId: string; camperName?: string };
  AddEvent: undefined;
  TripPlan: { tripId: string };
  Attraction: { id: string; tripId?: string };
  Chat: { uid: string; name: string };
  FindPeople: { addToTripId?: string } | undefined;
  Notifications: undefined;
  EditProfile: undefined;
  SignIn: undefined;
  Register: undefined;
  HealthForm: { bookingId: string };
  HealthForms: undefined;
  Grow: { bookingId: string; url: string };
};

export type TabParams = {
  HomeTab: undefined;
  CampsTab: undefined;
  WeekendTab: undefined;
  PlannerTab: undefined;
  MeTab: undefined;
};

export type RootScreen<K extends keyof RootParams> = NativeStackScreenProps<RootParams, K>;

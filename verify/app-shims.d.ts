/*
 * Verification-only type shims. The sandbox this was written in has no npm registry access,
 * so these stand in for @types/react, react-native, Expo, Firebase and React Navigation to
 * type-check Firefly's own code (props of our components, service signatures, models).
 * After `npm install`, run `npm run typecheck` against the real packages instead.
 */

declare module 'react' {
  namespace React {
    type ReactNode = any;
    type Key = string | number;
    type SetStateAction<S> = S | ((prev: S) => S);
    type Dispatch<A> = (value: A) => void;
    type Destructor = () => void;
    function useState<S>(initial: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
    function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>];
    function useEffect(effect: () => void | Destructor, deps?: readonly unknown[]): void;
    function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
    function useCallback<T extends (...args: any[]) => any>(fn: T, deps: readonly unknown[]): T;
    interface ErrorInfo { componentStack?: string | null }
    class Component<P = {}, S = {}> {
      constructor(props: P);
      props: Readonly<P>;
      state: Readonly<S>;
      setState(state: Partial<S> | ((prev: S) => Partial<S>)): void;
      render(): ReactNode;
    }
    interface MutableRefObject<T> { current: T }
    interface RefObject<T> { current: T | null }
    function useRef<T>(initial: T): MutableRefObject<T>;
    function useRef<T>(initial: T | null): RefObject<T>;
    interface Context<T> { Provider: any; _v?: T }
    function createContext<T>(value: T): Context<T>;
    function useContext<T>(c: Context<T>): T;
    function useSyncExternalStore<T>(subscribe: (onChange: () => void) => () => void, getSnapshot: () => T): T;
    type ComponentProps<T> = T extends (p: infer P) => any ? P : T extends new (p: infer P) => any ? P : any;
    type ComponentType<P = any> = (p: P) => any;
    type FC<P = {}> = (p: P) => any;
    const createElement: any;
    const Fragment: any;
    type Ref<T> = ((v: T | null) => void) | RefObject<T> | null;
    type ComponentRef<T> = any;
    function forwardRef<T, P = {}>(render: (props: P, ref: Ref<T>) => any): (props: P & { ref?: Ref<T> }) => any;
    function memo<P>(c: (props: P) => any): (props: P) => any;
  }
  export = React;
}
declare module 'react/jsx-runtime' {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
  export namespace JSX {
    type Element = any;
    interface ElementAttributesProperty { props: {} }
    interface ElementChildrenAttribute { children: {} }
    interface IntrinsicAttributes { key?: string | number }
    interface IntrinsicElements { [name: string]: any }
  }
}

declare module 'react-native' {
  export type StyleProp<T> = any;
  export type ViewStyle = any;
  export type TextStyle = any;
  export type TextInputProps = { [k: string]: any };
  export type TextProps = { [k: string]: any };
  export const View: any;
  export const Text: any;
  export const TextInput: any;
  export const Pressable: any;
  export const ScrollView: any;
  export const ActivityIndicator: any;
  export const Modal: any;
  export const KeyboardAvoidingView: any;
  export const RefreshControl: any;
  export class FlatList<T = any> {
    constructor(props: any);
    props: any;
    scrollToIndex(p: { index: number; animated?: boolean; viewOffset?: number }): void;
    scrollToEnd(p?: { animated?: boolean }): void;
    _t?: T;
  }
  export const StyleSheet: {
    create<T>(s: T): T;
    absoluteFill: any;
    absoluteFillObject: any;
    hairlineWidth: number;
    flatten(s: any): any;
  };
  export const I18nManager: { isRTL: boolean; allowRTL(b: boolean): void; forceRTL(b: boolean): void };
  export const DevSettings: { reload(): void };
  export const ToastAndroid: { show(message: string, duration: number): void; LONG: number; SHORT: number };
  export const Alert: { alert(title: string, message?: string, buttons?: Array<{ text: string; onPress?: () => void; style?: string }>, options?: { cancelable?: boolean; onDismiss?: () => void }): void };
  export const PanResponder: { create(config: any): { panHandlers: any } };
  export function useWindowDimensions(): { width: number; height: number };
  export const Animated: any;
  export const Easing: any;
  export const AccessibilityInfo: {
    isReduceMotionEnabled(): Promise<boolean>;
    addEventListener(e: 'reduceMotionChanged', cb: (v: boolean) => void): { remove(): void };
  };
}

declare module 'expo' { export function registerRootComponent(c: any): void; }
declare module 'expo/config' { export type ExpoConfig = Record<string, any>; }
declare module 'expo/config-plugins' { export function withGradleProperties<T>(config: T, action: (c: any) => any): T; }
declare module 'expo-constants' {
  const Constants: { expoConfig?: { extra?: Record<string, unknown> } | null };
  export default Constants;
}
declare module 'expo-localization' { export function getLocales(): Array<{ languageCode: string | null }>; }
declare module 'expo-updates' { export function reloadAsync(): Promise<void>; }
declare module 'expo-status-bar' { export const StatusBar: any; }
declare module 'expo-image' { export const Image: any; }
declare module 'expo-web-browser' { export function openBrowserAsync(url: string, opts?: object): Promise<unknown>; }
declare module 'expo-location' {
  export const Accuracy: { Balanced: number; High: number };
  export function requestForegroundPermissionsAsync(): Promise<{ status: string }>;
  interface Pos { coords: { latitude: number; longitude: number } }
  export function getLastKnownPositionAsync(o?: { maxAge?: number; requiredAccuracy?: number }): Promise<Pos | null>;
  export function getCurrentPositionAsync(o?: object): Promise<Pos>;
}
declare module 'expo-image-picker' {
  export function launchImageLibraryAsync(o?: object): Promise<{ canceled: boolean; assets?: Array<{ uri: string; fileSize?: number; mimeType?: string; width: number; height: number }> | null }>;
}
declare module 'expo-document-picker' {
  export function getDocumentAsync(o?: object): Promise<{ canceled: boolean; assets?: Array<{ uri: string; name: string; mimeType?: string }> | null }>;
}
declare module '@expo/vector-icons' { export const MaterialCommunityIcons: any; }
declare module '@react-native-async-storage/async-storage' {
  const AsyncStorage: { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void>; removeItem(k: string): Promise<void> };
  export default AsyncStorage;
}
declare module '@react-native-community/slider' { const Slider: any; export default Slider; }
declare module 'react-native-svg' {
  const Svg: any;
  export const Path: any, Circle: any, Line: any, Defs: any, LinearGradient: any, Stop: any;
  export default Svg;
}
declare module 'react-native-webview' { export const WebView: any; }
declare module 'react-native-safe-area-context' {
  export const SafeAreaProvider: any;
  export function useSafeAreaInsets(): { top: number; bottom: number; left: number; right: number };
}
declare module 'react-native-gesture-handler' { export const GestureHandlerRootView: any; }
declare module 'react-native-reorderable-list' {
  const ReorderableList: any;
  export function useReorderableDrag(): () => void;
  export default ReorderableList;
}
declare module 'react-native-maps' {
  export interface Region { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }
  export const PROVIDER_GOOGLE: string;
  export const Marker: any;
  export const Callout: any;
  export const Polyline: any;
  export default class MapView {
    constructor(props: any);
    props: any;
    animateToRegion(r: Region, ms?: number): void;
  }
}

declare module '@react-navigation/native' {
  export const NavigationContainer: any;
  export const DefaultTheme: { colors: Record<string, string> };
  export function useNavigation<T = any>(): T;
}
declare module '@react-navigation/native-stack' {
  export interface StackNav<P> {
    navigate<R extends keyof P>(name: R, params?: P[R]): void;
    replace<R extends keyof P>(name: R, params?: P[R]): void;
    goBack(): void;
    canGoBack(): boolean;
    addListener(type: 'focus' | 'blur', cb: () => void): () => void;
    popToTop(): void;
    setOptions(o: object): void;
  }
  export type NativeStackNavigationProp<P> = StackNav<P>;
  export type NativeStackScreenProps<P, K extends keyof P> = { route: { params: P[K] }; navigation: StackNav<P> };
  export function createNativeStackNavigator<P>(): { Navigator: any; Screen: any; Group: any; _p?: P };
}
declare module '@react-navigation/bottom-tabs' {
  export function createBottomTabNavigator<P>(): { Navigator: any; Screen: any; _p?: P };
}

declare module 'firebase/app' {
  export function initializeApp(cfg: object): any;
  export function getApp(): any;
  export function getApps(): any[];
}
declare module 'firebase/auth' {
  export type Auth = any;
  export type Persistence = any;
  export interface User {
    uid: string;
    email: string | null;
    isAnonymous: boolean;
    displayName: string | null;
    getIdTokenResult(): Promise<{ claims: Record<string, unknown> }>;
    delete(): Promise<void>;
  }
  export function initializeAuth(app: any, deps?: object): Auth;
  export function getAuth(app?: any): Auth;
  export function connectAuthEmulator(a: Auth, url: string, o?: object): void;
  export function onAuthStateChanged(a: Auth, cb: (u: User | null) => void): () => void;
  export function signInAnonymously(a: Auth): Promise<unknown>;
  export function createUserWithEmailAndPassword(a: Auth, e: string, p: string): Promise<{ user: User }>;
  export function signInWithEmailAndPassword(a: Auth, e: string, p: string): Promise<{ user: User }>;
  export function signOut(a: Auth): Promise<void>;
  export function sendPasswordResetEmail(a: Auth, email: string): Promise<void>;
  export function updateProfile(u: User, p: { displayName?: string }): Promise<void>;
}
declare module 'firebase/firestore' {
  export interface DocumentData { [k: string]: any }
  export interface DocumentReference { id: string; path: string }
  export interface CollectionReference { id: string }
  export interface Query { _q?: true }
  export interface DocumentSnapshot { id: string; exists(): boolean; data(): DocumentData | undefined; metadata: { hasPendingWrites: boolean; fromCache: boolean } }
  export interface QueryDocumentSnapshot { id: string; data(): DocumentData }
  export interface QuerySnapshot { docs: QueryDocumentSnapshot[]; empty: boolean; size: number }
  export type Firestore = any;
  export function initializeFirestore(app: any, o: object): Firestore;
  export function connectFirestoreEmulator(db: Firestore, host: string, port: number): void;
  export function doc(db: any, ...path: string[]): DocumentReference;
  export function doc(c: CollectionReference): DocumentReference;
  export function collection(db: any, ...path: string[]): CollectionReference;
  export function getDoc(r: DocumentReference): Promise<DocumentSnapshot>;
  export function getDocs(q: Query | CollectionReference): Promise<QuerySnapshot>;
  export function setDoc(r: DocumentReference, data: object, o?: object): Promise<void>;
  export function updateDoc(r: DocumentReference, data: object): Promise<void>;
  export function addDoc(c: CollectionReference, data: object): Promise<DocumentReference>;
  export function deleteDoc(r: DocumentReference): Promise<void>;
  export function onSnapshot(r: DocumentReference, cb: (s: DocumentSnapshot) => void, err?: (e: Error) => void): () => void;
  export function onSnapshot(q: Query, cb: (s: QuerySnapshot) => void, err?: (e: Error) => void): () => void;
  export function query(c: CollectionReference, ...constraints: unknown[]): Query;
  export function where(f: string, op: string, v: unknown): unknown;
  export function orderBy(f: string, d?: string): unknown;
  export function limit(n: number): unknown;
  export function arrayUnion(...v: unknown[]): unknown;
  export function arrayRemove(...v: unknown[]): unknown;
  export function serverTimestamp(): unknown;
  export interface Transaction {
    get(r: DocumentReference): Promise<DocumentSnapshot>;
    set(r: DocumentReference, data: object): Transaction;
  }
  export function runTransaction<T>(db: any, fn: (tx: Transaction) => Promise<T>): Promise<T>;
}
declare module 'firebase/functions' {
  export type Functions = any;
  export function getFunctions(app: any, region?: string): Functions;
  export function connectFunctionsEmulator(f: Functions, host: string, port: number): void;
  export function httpsCallable<Req = unknown, Res = unknown>(f: Functions, name: string, o?: { timeout?: number }): (data: Req) => Promise<{ data: Res }>;
}
declare module 'firebase/storage' {
  export type FirebaseStorage = any;
  export interface StorageReference { fullPath: string }
  export function getStorage(app?: any): FirebaseStorage;
  export function connectStorageEmulator(s: FirebaseStorage, host: string, port: number): void;
  export function ref(s: FirebaseStorage, path: string): StorageReference;
  export function uploadBytes(r: StorageReference, data: Blob, meta?: object): Promise<unknown>;
  export function getDownloadURL(r: StorageReference): Promise<string>;
}

declare module '@expo-google-fonts/inter' {
  export const Inter_300Light: number, Inter_400Regular: number, Inter_500Medium: number, Inter_600SemiBold: number, Inter_700Bold: number, Inter_800ExtraBold: number;
}
declare module '@expo-google-fonts/rubik' {
  export const Rubik_300Light: number, Rubik_400Regular: number, Rubik_500Medium: number, Rubik_600SemiBold: number, Rubik_700Bold: number, Rubik_800ExtraBold: number;
  export function useFonts(map: Record<string, number>): [boolean, Error | null];
}
declare module 'expo-print' {
  export function printAsync(o: { html: string }): Promise<void>;
  export function printToFileAsync(o: { html: string; base64?: boolean }): Promise<{ uri: string }>;
}
declare module 'expo-sharing' {
  export function isAvailableAsync(): Promise<boolean>;
  export function shareAsync(url: string, o?: { mimeType?: string; dialogTitle?: string; UTI?: string }): Promise<void>;
}
declare module 'react-native-reanimated' {
  const Animated: any;
  export default Animated;
  export function useSharedValue<T>(v: T): { value: T };
  export function useAnimatedStyle(f: () => any, deps?: unknown[]): any;
  export function withTiming(v: number, c?: { duration?: number; easing?: any }): number;
  export function withSpring(v: number, c?: object): number;
  export const Easing: any;
  export function useReducedMotion(): boolean;
}

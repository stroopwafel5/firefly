// Minimal type shims so the Cloud Functions can be type-checked without node_modules
// (the sandbox has no npm registry access). Real types come from the packages after `npm install`.
declare module 'firebase-admin/app' { export function initializeApp(...a: any[]): any; }
declare module 'firebase-admin/firestore' { export function getFirestore(): any; export const FieldValue: any; }
declare module 'firebase-admin/storage' { export function getStorage(): any; }
declare module 'firebase-functions/v2' {
  export const logger: { info(...a: any[]): void; warn(...a: any[]): void; error(...a: any[]): void };
  export function setGlobalOptions(o: object): void;
}
declare module 'firebase-functions/v2/https' {
  export class HttpsError extends Error { constructor(code: string, msg: string); }
  export interface CallableRequest<T = unknown> { data: T; auth?: { uid: string; token: Record<string, any> }; }
  export function onCall<T = unknown>(handler: (req: CallableRequest<T>) => any): any;
  export function onCall<T = unknown>(opts: object, handler: (req: CallableRequest<T>) => any): any;
  export interface Request { headers: Record<string, string | string[] | undefined>; body: unknown; rawBody?: Buffer; method: string; ip?: string }
  export interface Response { status(code: number): Response; send(body?: unknown): void; json(body: unknown): void; set(field: string, value: string): Response }
  export function onRequest(opts: object, handler: (req: Request, res: Response) => any): any;
}
declare module 'firebase-functions/v2/firestore' {
  export function onDocumentCreated(opts: object | string, h: (e: any) => any): any;
  export function onDocumentUpdated(opts: object | string, h: (e: any) => any): any;
}
declare module 'firebase-functions/v2/scheduler' { export function onSchedule(opts: object, h: (e: any) => any): any; }
declare module 'firebase-functions/params' {
  export function defineSecret(n: string): { value(): string };
  export function defineString(n: string, o?: object): { value(): string };
}
declare module 'nodemailer' { const n: any; export default n; }

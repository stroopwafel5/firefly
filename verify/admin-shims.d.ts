// Extra firebase-admin members used only by the admin scripts (the real package has them).
declare module 'firebase-admin/app' { export function applicationDefault(): any; }
declare module 'firebase-admin/auth' { export function getAuth(): any; }

/**
 * Makes a user an admin (can add events, see photo reports, run the fallback refresh).
 *
 *   (uses service-account.json from the project folder)
 *   npx tsx scripts/setAdmin.ts someone@example.com
 * The user must sign out and in again for the claim to take effect.
 */
import { initAdmin } from './adminInit';
import { getAuth } from 'firebase-admin/auth';

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error('Usage: tsx scripts/setAdmin.ts <email>');
  initAdmin(!!process.env.FIREBASE_AUTH_EMULATOR_HOST);
  const user = await getAuth().getUserByEmail(email);
  await getAuth().setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), admin: true });
  console.log(`${email} (${user.uid}) is now an admin.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

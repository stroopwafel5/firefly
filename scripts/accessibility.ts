/**
 * Records what a disability or tourism organisation confirms about a place, so the trip planner
 * and attraction pages can use it (Firestore `accessibility/{tripadvisorId}`). Use only
 * organisations that assess or certify sites, and link the page that shows the result, e.g.:
 *   Access Israel (aisrael.org) · Israel Nature and Parks Authority accessible sites (parks.org.il)
 *   Tourisme & Handicap (France) · Reisen für Alle (Germany) · IBCCES Certified Autism Centers
 *   (autismtravel.com) · AccessAble and Euan's Guide (UK) · the venue's own accessibility page.
 *
 *   npm run accessibility -- add <tripadvisorId> <need> "<organisation>" <url>
 *       need: blind | hearing | autism | physical
 *   npm run accessibility -- list
 *   npm run accessibility -- remove <tripadvisorId> [need]
 */
import { getFirestore } from 'firebase-admin/firestore';
import { initAdmin } from './adminInit';

const NEEDS = ['blind', 'hearing', 'autism', 'physical'];

async function main() {
  initAdmin(!!process.env.FIRESTORE_EMULATOR_HOST);
  const db = getFirestore();
  const [cmd, id, need, org, url] = process.argv.slice(2);
  if (cmd === 'add') {
    if (!id || !NEEDS.includes(need) || !org || !/^https?:\/\//.test(url ?? '')) {
      throw new Error('Usage: npm run accessibility -- add <tripadvisorId> <blind|hearing|autism|physical> "<organisation>" <url>');
    }
    const ref = db.collection('accessibility').doc(id);
    const sources = ((await ref.get()).data()?.sources ?? []) as Array<{ need: string; org: string; url: string; checkedAt: number }>;
    const next = [...sources.filter((s) => !(s.need === need && s.url === url)), { need, org, url, checkedAt: Date.now() }];
    await ref.set({ sources: next, needs: [...new Set(next.map((s) => s.need))] });
    console.log(`✔ ${id}: ${need} confirmed by ${org}`);
  } else if (cmd === 'remove') {
    if (!id) throw new Error('Usage: npm run accessibility -- remove <tripadvisorId> [need]');
    const ref = db.collection('accessibility').doc(id);
    if (!need) {
      await ref.delete();
      console.log(`✔ ${id}: removed`);
    } else {
      const sources = (((await ref.get()).data()?.sources ?? []) as Array<{ need: string }>).filter((s) => s.need !== need);
      await ref.set({ sources, needs: [...new Set(sources.map((s) => s.need))] });
      console.log(`✔ ${id}: ${need} removed`);
    }
  } else {
    const snap = await db.collection('accessibility').get();
    for (const d of snap.docs) {
      for (const s of (d.data().sources ?? []) as Array<{ need: string; org: string; url: string }>) console.log(`${d.id}\t${s.need}\t${s.org}\t${s.url}`);
    }
    console.log(`${snap.size} places`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

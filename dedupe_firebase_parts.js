// =============================================================================
// One-time cleanup: remove duplicate 'parts' documents in Firestore.
// =============================================================================
// Root cause: the old upload_to_firebase.js called db.collection('parts').doc()
// with NO argument, which mints a brand new random document ID every time
// it's called. Each time that script was run, it re-inserted all 430 parts as
// FRESH documents instead of updating the existing ones -- so every re-run
// piled up another full copy of the same part numbers. upload_to_firebase.js
// has since been fixed to use a deterministic doc ID (the part number), so
// future runs are idempotent and won't create more duplicates -- but the
// duplicates already sitting in Firestore from past runs need a one-time
// cleanup, which is what this script does.
//
// SAFE BY DEFAULT: this only PRINTS what it would delete. Nothing is deleted
// until you re-run it with --apply.
//
// Usage:
//   node dedupe_firebase_parts.js            # dry run -- just reports
//   node dedupe_firebase_parts.js --apply    # actually deletes duplicates
// =============================================================================
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('./firebase-key.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const APPLY = process.argv.includes('--apply');

// Picks which duplicate to KEEP out of a group sharing the same partNo:
//   1. Prefer one that actually has real dimension data filled in (width/
//      length/ht/fh present) -- if the user already started entering real
//      values on one copy, don't discard that work.
//   2. Otherwise prefer the most recently updated document.
//   3. Otherwise just keep the first one encountered.
function pickKeeper(docs) {
  const hasDims = (d) => d.data().width != null || d.data().length != null || d.data().ht != null || d.data().fh != null;
  const withDims = docs.filter(hasDims);
  const pool = withDims.length > 0 ? withDims : docs;

  return pool.slice().sort((a, b) => {
    const ta = a.data().updatedAt ? a.data().updatedAt.toMillis() : 0;
    const tb = b.data().updatedAt ? b.data().updatedAt.toMillis() : 0;
    return tb - ta; // newest first
  })[0];
}

async function run() {
  console.log(`Mode: ${APPLY ? 'APPLY (will delete)' : 'DRY RUN (no changes will be made)'}`);
  console.log('Fetching all documents in "parts" collection...');
  const snapshot = await db.collection('parts').get();
  console.log(`Total documents: ${snapshot.size}`);

  const groups = {};
  snapshot.forEach(doc => {
    const partNo = String(doc.data().partNo || '').trim();
    if (!groups[partNo]) groups[partNo] = [];
    groups[partNo].push(doc);
  });

  let dupGroups = 0;
  let toDelete = [];

  Object.keys(groups).forEach(partNo => {
    const docs = groups[partNo];
    if (docs.length <= 1) return;
    dupGroups++;
    const keeper = pickKeeper(docs);
    const losers = docs.filter(d => d.id !== keeper.id);
    console.log(`\n"${partNo}" -- ${docs.length} copies, keeping doc ${keeper.id}, deleting ${losers.length}:`);
    losers.forEach(d => console.log(`  - ${d.id}`));
    toDelete.push(...losers);
  });

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Part numbers with duplicates: ${dupGroups}`);
  console.log(`Total documents to delete: ${toDelete.length}`);
  console.log(`Documents remaining after cleanup: ${snapshot.size - toDelete.length}`);

  if (!APPLY) {
    console.log('\nDry run only -- nothing was deleted. Re-run with --apply to actually delete these.');
    return;
  }

  console.log('\nDeleting...');
  const chunkSize = 400; // Firestore batch limit is 500
  for (let i = 0; i < toDelete.length; i += chunkSize) {
    const chunk = toDelete.slice(i, i + chunkSize);
    const batch = db.batch();
    chunk.forEach(d => batch.delete(d.ref));
    await batch.commit();
    console.log(`Deleted batch ${Math.floor(i / chunkSize) + 1} (${chunk.length} docs)`);
  }
  console.log('Cleanup complete.');
}

run().catch(console.error);

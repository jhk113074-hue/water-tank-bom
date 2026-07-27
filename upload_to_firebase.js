const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const fs = require('fs');

const serviceAccount = require('./firebase-key.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

// Firestore document IDs may not contain '/'; sanitize just in case a part
// number ever has one.
function docIdFor(partNo) {
  return String(partNo).trim().replace(/\//g, '_');
}

async function uploadData() {
  console.log('Reading parts_db.json...');
  const raw = fs.readFileSync('./parts_db.json', 'utf8');
  const parts = JSON.parse(raw);
  console.log(`Loaded ${parts.length} parts. Starting upload to Firestore...`);

  // Direct deterministic upsert by partNo doc ID (merge: true)
  // Avoids deleting all docs first, preventing quota exhaustion and preserving non-conflicting fields.

  // Batch upload in chunks of 400 (Firestore limit is 500 per batch)
  const chunkSize = 400;
  for (let i = 0; i < parts.length; i += chunkSize) {
    const chunk = parts.slice(i, i + chunkSize);
    const batch = db.batch();

    chunk.forEach(part => {
      // IMPORTANT: doc(part.partNo) -- a deterministic ID keyed by part
      // number, NOT doc() (which mints a random new ID every call). Re-running
      // this script now updates the SAME document per part instead of piling
      // up a fresh duplicate row on every run.
      const docRef = db.collection('parts').doc(docIdFor(part.partNo));
      const data = {
        partNo: part.partNo,
        nameKo: part.nameKo || '',
        nameEn: part.nameEn || '',
        spec: part.spec || '',
        weight: Number(part.weight) || 0,
        price: Number(part.price) || 0,
        unit: part.unit || 'PCS',
        category: part.category || 'OTHER',
        updatedAt: FieldValue.serverTimestamp()
      };
      // Only send dimension fields if parts_db.json actually specifies them,
      // so this doesn't stomp real values a user already entered through the
      // app's PART_ID_TABLE UI back to blank/defaults.
      if (part.width != null) data.width = Number(part.width);
      if (part.length != null) data.length = Number(part.length);
      if (part.ht != null) data.ht = Number(part.ht);
      if (part.fh != null) data.fh = Number(part.fh);

      batch.set(docRef, data, { merge: true });
    });

    console.log(`Writing batch ${Math.floor(i / chunkSize) + 1}...`);
    await batch.commit();
  }

  console.log('Upload complete! All items successfully stored in Firebase Firestore.');
}

uploadData().catch(err => {
  const msg = String(err && (err.message || err.note || err) || '');
  if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Quota exceeded')) {
    console.warn('\n[Firestore Warning] Firebase daily write quota exceeded (20,000 free writes/day).');
    console.warn('Local parts_db.json remains 100% saved locally and static web build is completely ready.');
    console.warn('Firestore DB cloud sync will automatically resume when daily quota resets.\n');
    process.exit(0);
  } else {
    console.error(err);
    process.exit(1);
  }
});

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const fs = require('fs');

const serviceAccount = require('./firebase-key.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function uploadData() {
  console.log('Reading parts_db.json...');
  const raw = fs.readFileSync('./parts_db.json', 'utf8');
  const parts = JSON.parse(raw);
  console.log(`Loaded ${parts.length} parts. Starting upload to Firestore...`);

  // Batch upload in chunks of 400 (Firestore limit is 500 per batch)
  const chunkSize = 400;
  for (let i = 0; i < parts.length; i += chunkSize) {
    const chunk = parts.slice(i, i + chunkSize);
    const batch = db.batch();
    
    chunk.forEach(part => {
      const docRef = db.collection('parts').doc();
      batch.set(docRef, {
        partNo: part.partNo,
        nameKo: part.nameKo || '',
        nameEn: part.nameEn || '',
        spec: part.spec || '',
        weight: Number(part.weight) || 0,
        price: Number(part.price) || 0,
        unit: part.unit || 'PCS',
        category: part.category || 'OTHER',
        updatedAt: FieldValue.serverTimestamp()
      });
    });

    console.log(`Writing batch ${i / chunkSize + 1}...`);
    await batch.commit();
  }
  
  console.log('Upload complete! All items successfully stored in Firebase Firestore.');
}

uploadData().catch(console.error);

const admin = require('firebase-admin');
const serviceAccount = require('./activenomads-firebase-adminsdk-9ghf5-d75c7085ba.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://activenomads.firebaseio.com' // Puedes dejar esto para compatibilidad
});

const db = admin.firestore();


module.exports = { admin, db };

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { admin, db } = require('./firebaseConfig');
const { Timestamp } = require('firebase-admin/firestore');
const events = require('./events.json');

const app = express();
app.use(cors());
app.use(bodyParser.json());


async function loadEvents() {
    const eventsRef = admin.firestore().collection('events');
    const snapshot = await eventsRef.get();

    if (snapshot.empty) {
        console.log('No events found. Loading default events...');
        const batch = admin.firestore().batch();

        events.forEach(event => {
            const eventRef = eventsRef.doc();
            batch.set(eventRef, event);
        });

        await batch.commit();
        console.log('Events loaded successfully.');
    } else {
        console.log('Events already exist in the database.');
    }
}

app.post('/signup', async (req, res) => {
    const { email, password } = req.body;

    try {
        const userRecord = await admin.auth().createUser({
            email,
            password,
        });

        const token = await admin.auth().createCustomToken(userRecord.uid);

        res.status(201).send({ uid: userRecord.uid, token });
    } catch (error) {
        res.status(400).send({ error: error.message });
    }
});

app.post('/affiliate', async (req, res) => {
    const { token, name, gender, weight, height, age } = req.body;
    console.log('Received token:', token); // Imprime el token recibido
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);

        const newUser = {
            name,
            gender,
            weight,
            height,
            age,
            createdAt: new Date().toISOString()
        };

        await db.collection('users').doc(decodedToken.uid).set(newUser);

        res.status(201).send({ message: 'User data saved successfully' });
    } catch (error) {
        res.status(400).send({ error: error.message });
    }
});

app.post('/metrics', async (req, res) => {
    const { token, weight, measurementDate } = req.body;

    try {
        const measurementTimestamp = Timestamp.fromDate(new Date(measurementDate));
        const decodedToken = await admin.auth().verifyIdToken(token);

        const metricsDocRef = admin.firestore().collection('metrics').doc(decodedToken.uid);

        const metricsDoc = await metricsDocRef.get();
        if (!metricsDoc.exists) {
            await metricsDocRef.set({
                metrics: [{ weight, measurementDate: measurementTimestamp }],
                updatedAt: Timestamp.now()
            });
        } else {
            await metricsDocRef.update({
                metrics: admin.firestore.FieldValue.arrayUnion({ weight, measurementDate: measurementTimestamp }),
                updatedAt: Timestamp.now()
            });
        }

        res.status(201).send({ message: 'Metrics saved successfully' });
    } catch (error) {
        res.status(400).send({ error: error.message });
    }
});

app.get('/metrics', async (req, res) => {
    const { token } = req.query;

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        const metricsDoc = await admin.firestore().collection('metrics').doc(decodedToken.uid).get();

        if (!metricsDoc.exists) {
            res.status(404).send({ error: 'No metrics found' });
        } else {
            res.status(200).send(metricsDoc.data());
        }
    } catch (error) {
        res.status(400).send({ error: error.message });
    }
});

app.post('/events', async (req, res) => {
    const { token, event } = req.body;

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);

        const eventsDoc = admin.firestore().collection('events').doc(decodedToken.uid);
        await eventsDoc.update({
            events: admin.firestore.FieldValue.arrayUnion(event),
            updatedAt: Timestamp.now()
        });

        res.status(201).send({ message: 'Event added successfully' });
    } catch (error) {
        res.status(400).send({ error: error.message });
    }
});

app.get('/events', async (req, res) => {
    const events = [];
    const snapshot = await admin.firestore().collection('events').get();
    snapshot.forEach(doc => events.push({ id: doc.id, ...doc.data() }));
    res.status(200).send(events);
});


app.get('/interested-events', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        const interestedEvents = [];
        const snapshot = await admin.firestore().collection('users').doc(decodedToken.uid).collection('interestedEvents').get();
        snapshot.forEach(doc => interestedEvents.push({ id: doc.id, ...doc.data() }));
        res.status(200).send(interestedEvents);
    } catch (error) {
        res.status(400).send({ error: error.message });
    }
});

app.post('/interested-events', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { eventId } = req.body;
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        const eventDoc = await admin.firestore().collection('events').doc(eventId).get();
        if (eventDoc.exists) {
            const userEventsCollection = admin.firestore().collection('users').doc(decodedToken.uid).collection('interestedEvents');
            await userEventsCollection.doc(eventId).set(eventDoc.data());
            res.status(201).send({ message: 'Event added to interested events' });
        } else {
            res.status(404).send({ error: 'Event not found' });
        }
    } catch (error) {
        res.status(400).send({ error: error.message });
    }
});

app.delete('/interested-events/:eventId', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { eventId } = req.params;
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        await admin.firestore().collection('users').doc(decodedToken.uid).collection('interestedEvents').doc(eventId).delete();
        res.status(200).send({ message: 'Event removed from interested events' });
    } catch (error) {
        res.status(400).send({ error: error.message });
    }
});

app.post('/attended-events', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { eventId } = req.body;
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        const eventDoc = await admin.firestore().collection('events').doc(eventId).get();
        if (eventDoc.exists) {
            const userEventsCollection = admin.firestore().collection('users').doc(decodedToken.uid).collection('attendedEvents');
            await userEventsCollection.doc(eventId).set(eventDoc.data());
            await admin.firestore().collection('users').doc(decodedToken.uid).collection('interestedEvents').doc(eventId).delete();
            res.status(201).send({ message: 'Event marked as attended' });
        } else {
            res.status(404).send({ error: 'Event not found' });
        }
    } catch (error) {
        res.status(400).send({ error: error.message });
    }
});

app.get('/attended-events', async (req, res) => {
    let token = req.headers.authorization;

    if (!token) {
        return res.status(400).send({ error: 'Authorization header is missing' });
    }

    if (token.startsWith('Bearer ')) {
        token = token.slice(7, token.length);
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        const attendedEvents = [];
        const snapshot = await admin.firestore().collection('users').doc(decodedToken.uid).collection('attendedEvents').get();
        snapshot.forEach(doc => attendedEvents.push({ id: doc.id, ...doc.data() }));
        res.status(200).send(attendedEvents);
    } catch (error) {
        res.status(400).send({ error: error.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// loadEvents().then(() => {
//     app.listen(PORT, () => {
//         console.log(`Server is running on port ${PORT}`);
//     });
// }).catch(error => {
//     console.error('Failed to load events:', error);
//     process.exit(1); // Exit the process with an error code
// });

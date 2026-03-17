const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const DEFAULT_ADMIN = {
  enabled: process.env.ENABLE_DEFAULT_ADMIN_BOOTSTRAP === 'true',
  firstName: process.env.DEFAULT_ADMIN_FIRST_NAME || 'System',
  lastName: process.env.DEFAULT_ADMIN_LAST_NAME || 'Admin',
  username: process.env.DEFAULT_ADMIN_USERNAME || 'admin',
  password: process.env.DEFAULT_ADMIN_PASSWORD || 'admin12345',
};

// Initialize Firebase Admin
let db = null;
try {
  const serviceAccount = require('./firebase-service-account.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  db = admin.firestore();
} catch (err) {
  console.warn('⚠️  Firebase service account JSON not found. Database features disabled.');
  console.warn('Download it from Firebase Console: Project Settings → Service Accounts → Generate Private Key');
}

const ensureDefaultAdmin = async () => {
  if (!DEFAULT_ADMIN.enabled || !db) {
    return;
  }

  const adminsSnapshot = await db.collection('users').where('role', '==', 'admin').limit(1).get();
  if (!adminsSnapshot.empty) {
    return;
  }

  const existingUsernameSnapshot = await db
    .collection('users')
    .where('username', '==', DEFAULT_ADMIN.username)
    .limit(1)
    .get();

  const username = existingUsernameSnapshot.empty
    ? DEFAULT_ADMIN.username
    : `${DEFAULT_ADMIN.username}-${Date.now().toString().slice(-6)}`;

  const userId = db.collection('users').doc().id;
  const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN.password, 10);

  await db.collection('users').doc(userId).set({
    userId,
    firstName: DEFAULT_ADMIN.firstName,
    lastName: DEFAULT_ADMIN.lastName,
    username,
    password: hashedPassword,
    role: 'admin',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`[BOOTSTRAP] Default admin created. username=${username}`);
};

// Middleware to verify JWT
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied' });
  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    res.status(400).json({ error: 'Invalid token' });
  }
};

// Middleware to check database connection
const requireDB = (req, res, next) => {
  if (!db) return res.status(503).json({ error: 'Database not configured. Upload firebase-service-account.json to backend folder.' });
  next();
};

// Routes
app.post('/login', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not configured. Upload firebase-service-account.json to backend folder.' });
  const { username, password } = req.body;
  try {
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('username', '==', username).get();
    if (snapshot.empty) return res.status(400).json({ error: 'User not found' });
    const user = snapshot.docs[0].data();
    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) return res.status(400).json({ error: 'Invalid password' });
    const token = jwt.sign({ userId: user.userId, role: user.role }, process.env.JWT_SECRET);
    res.json({ token, user: { userId: user.userId, firstName: user.firstName, lastName: user.lastName, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/students', verifyToken, requireDB, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
  const { firstName, lastName } = req.body;
  const username = `user-${lastName}`;
  const password = `pass-${lastName}`;
  const hashedPassword = await bcrypt.hash(password, 10);
  const userId = db.collection('users').doc().id;
  await db.collection('users').doc(userId).set({
    userId,
    firstName,
    lastName,
    username,
    password: hashedPassword,
    role: 'student',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  res.json({ userId, username, password });
});

app.get('/students', verifyToken, requireDB, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
  const snapshot = await db.collection('users').where('role', '==', 'student').get();
  const students = snapshot.docs.map(doc => doc.data());
  res.json(students);
});

app.put('/students/:id', verifyToken, requireDB, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
  const { firstName, lastName, resetPassword } = req.body;
  const updateData = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  if (firstName) updateData.firstName = firstName;
  if (lastName) updateData.lastName = lastName;
  if (resetPassword) {
    const userDoc = await db.collection('users').doc(req.params.id).get();
    const user = userDoc.data();
    const password = `pass-${user.lastName}`;
    updateData.password = await bcrypt.hash(password, 10);
  }
  await db.collection('users').doc(req.params.id).update(updateData);
  res.json({ message: 'Student updated' });
});

app.delete('/students/:id', verifyToken, requireDB, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
  await db.collection('users').doc(req.params.id).delete();
  res.json({ message: 'Student deleted' });
});

app.post('/dtr', verifyToken, requireDB, async (req, res) => {
  const { action } = req.body; // 'timeIn' or 'timeOut'
  const studentId = req.user.userId;
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toISOString();

  const dtrRef = db.collection('dtr_records').where('studentId', '==', studentId).where('date', '==', date);
  const snapshot = await dtrRef.get();
  let dtrDoc;
  if (snapshot.empty) {
    const dtrId = db.collection('dtr_records').doc().id;
    dtrDoc = {
      dtrId,
      studentId,
      date,
      timeIn: [],
      timeOut: [],
      status: 'pending',
      editedByAdmin: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('dtr_records').doc(dtrId).set(dtrDoc);
  } else {
    dtrDoc = snapshot.docs[0].data();
  }

  if (action === 'timeIn') {
    if (dtrDoc.timeIn.length > dtrDoc.timeOut.length) return res.status(400).json({ error: 'Already timed in' });
    dtrDoc.timeIn.push(time);
  } else if (action === 'timeOut') {
    if (dtrDoc.timeIn.length === dtrDoc.timeOut.length) return res.status(400).json({ error: 'Not timed in' });
    dtrDoc.timeOut.push(time);
  }

  await db.collection('dtr_records').doc(dtrDoc.dtrId).update({
    timeIn: dtrDoc.timeIn,
    timeOut: dtrDoc.timeOut,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  res.json({ message: 'DTR updated' });
});

app.get('/dtr/:studentId', verifyToken, requireDB, async (req, res) => {
  const { studentId } = req.params;
  if (req.user.role !== 'admin' && req.user.userId !== studentId) return res.status(403).json({ error: 'Access denied' });
  const snapshot = await db.collection('dtr_records').where('studentId', '==', studentId).get();
  const records = snapshot.docs.map(doc => doc.data());
  res.json(records);
});

app.put('/dtr/:dtrId', verifyToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
  const { status, timeIn, timeOut } = req.body;
  const updateData = { status, editedByAdmin: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  if (timeIn) updateData.timeIn = timeIn;
  if (timeOut) updateData.timeOut = timeOut;
  await db.collection('dtr_records').doc(req.params.dtrId).update(updateData);
  res.json({ message: 'DTR updated' });
});

app.delete('/dtr/:dtrId', verifyToken, async (req, res) => {
  const dtrDoc = await db.collection('dtr_records').doc(req.params.dtrId).get();
  const dtr = dtrDoc.data();
  if (req.user.role !== 'admin' && (req.user.userId !== dtr.studentId || dtr.status !== 'pending')) return res.status(403).json({ error: 'Access denied' });
  await db.collection('dtr_records').doc(req.params.dtrId).delete();
  res.json({ message: 'DTR deleted' });
});

app.get('/notifications/:userId', verifyToken, async (req, res) => {
  const { userId } = req.params;
  if (req.user.userId !== userId) return res.status(403).json({ error: 'Access denied' });
  const snapshot = await db.collection('notifications').where('userId', '==', userId).get();
  const notifications = snapshot.docs.map(doc => doc.data());
  res.json(notifications);
});

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await ensureDefaultAdmin();
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
};

startServer();
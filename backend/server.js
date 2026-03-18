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

const parseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  if (value && typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return null;
};

const isValidSessionState = (record) => {
  const inLen = Array.isArray(record.timeIn) ? record.timeIn.length : 0;
  const outLen = Array.isArray(record.timeOut) ? record.timeOut.length : 0;
  return inLen === outLen || inLen === outLen + 1;
};

const createNotification = async (userId, payload) => {
  if (!db || !userId) return null;
  const notificationId = db.collection('notifications').doc().id;
  const record = {
    notificationId,
    userId,
    title: payload.title || 'DTR Update',
    message: payload.message || '',
    type: payload.type || 'info',
    relatedDtrId: payload.relatedDtrId || null,
    relatedDate: payload.relatedDate || null,
    read: false,
    isValid: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await db.collection('notifications').doc(notificationId).set(record);
  return record;
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
    res.json({
      token,
      user: {
        userId: user.userId,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        role: user.role,
      },
      mustRelogin: !!user.mustRelogin,
    });
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
  const { firstName, lastName, resetPassword, resetCredentials } = req.body;
  const updateData = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  if (firstName) updateData.firstName = firstName;
  if (lastName) updateData.lastName = lastName;
  if (resetPassword || resetCredentials) {
    const userDoc = await db.collection('users').doc(req.params.id).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'Student not found' });
    const user = userDoc.data();
    const surname = lastName || user.lastName;
    const username = `user-${surname}`;
    const password = `pass-${surname}`;
    if (resetCredentials) {
      updateData.username = username;
    }
    updateData.password = await bcrypt.hash(password, 10);
    updateData.mustRelogin = true;
  }
  await db.collection('users').doc(req.params.id).update(updateData);
  res.json({ message: 'Student updated', forceRelogin: !!(resetPassword || resetCredentials) });
});

app.put('/me/credentials', verifyToken, requireDB, async (req, res) => {
  const { username, currentPassword, newPassword } = req.body;

  if (req.user.role !== 'student') {
    return res.status(403).json({ error: 'Only students can update their own credentials here' });
  }

  if (!username && !newPassword) {
    return res.status(400).json({ error: 'No credential changes provided' });
  }

  const userDocRef = db.collection('users').doc(req.user.userId);
  const userDoc = await userDocRef.get();
  if (!userDoc.exists) return res.status(404).json({ error: 'User not found' });

  const user = userDoc.data();
  const updateData = { updatedAt: admin.firestore.FieldValue.serverTimestamp(), mustRelogin: true };

  if (username) {
    const usernameExists = await db
      .collection('users')
      .where('username', '==', username)
      .limit(1)
      .get();

    if (!usernameExists.empty && usernameExists.docs[0].id !== req.user.userId) {
      return res.status(400).json({ error: 'Username is already taken' });
    }
    updateData.username = username;
  }

  if (newPassword) {
    if (!currentPassword) {
      return res.status(400).json({ error: 'Current password is required' });
    }
    const validPass = await bcrypt.compare(currentPassword, user.password);
    if (!validPass) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    updateData.password = await bcrypt.hash(newPassword, 10);
  }

  await userDocRef.update(updateData);
  res.json({ message: 'Credentials updated. Please login again.', forceRelogin: true });
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

  if (!isValidSessionState(dtrDoc)) {
    return res.status(400).json({ error: 'Invalid DTR state. Contact admin.' });
  }

  const latestTimeIn = dtrDoc.timeIn[dtrDoc.timeIn.length - 1];
  const latestTimeOut = dtrDoc.timeOut[dtrDoc.timeOut.length - 1];

  if (action === 'timeIn') {
    if (dtrDoc.timeIn.length > dtrDoc.timeOut.length) return res.status(400).json({ error: 'Already timed in' });
    dtrDoc.timeIn.push(time);
  } else if (action === 'timeOut') {
    if (dtrDoc.timeIn.length === dtrDoc.timeOut.length) return res.status(400).json({ error: 'Not timed in' });
    const lastTimeInDate = parseDate(latestTimeIn);
    const nowDate = parseDate(time);
    if (lastTimeInDate && nowDate && nowDate.getTime() - lastTimeInDate.getTime() < 60000) {
      return res.status(400).json({ error: 'Minimum 1 minute between time in and time out' });
    }
    if (latestTimeOut && parseDate(latestTimeOut)?.getTime() > parseDate(latestTimeIn)?.getTime()) {
      return res.status(400).json({ error: 'Already timed out' });
    }
    dtrDoc.timeOut.push(time);
  } else {
    return res.status(400).json({ error: 'Invalid action' });
  }

  await db.collection('dtr_records').doc(dtrDoc.dtrId).update({
    timeIn: dtrDoc.timeIn,
    timeOut: dtrDoc.timeOut,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await createNotification(studentId, {
    title: action === 'timeIn' ? 'Time In Successful' : 'Time Out Successful',
    message: `${action === 'timeIn' ? 'You timed in' : 'You timed out'} on ${date}`,
    type: action === 'timeIn' ? 'time-in' : 'time-out',
    relatedDtrId: dtrDoc.dtrId,
    relatedDate: date,
  });

  res.json({ message: 'DTR updated' });
});

app.get('/dtr/:studentId', verifyToken, requireDB, async (req, res) => {
  const { studentId } = req.params;
  if (req.user.role !== 'admin' && req.user.userId !== studentId) return res.status(403).json({ error: 'Access denied' });

  const { month, limit = '50', cursor } = req.query;
  const pageSize = Math.min(Number(limit) || 50, 100);

  let queryRef = db.collection('dtr_records').where('studentId', '==', studentId).orderBy('date', 'desc');
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    queryRef = queryRef.where('date', '>=', `${month}-01`).where('date', '<=', `${month}-31`);
  }
  if (cursor) {
    queryRef = queryRef.startAfter(cursor);
  }

  const snapshot = await queryRef.limit(pageSize).get();
  const records = snapshot.docs.map(doc => doc.data());

  if (month || cursor || req.query.limit) {
    return res.json({
      records,
      nextCursor: records.length === pageSize ? records[records.length - 1]?.date : null,
    });
  }

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

  const notifSnapshot = await db.collection('notifications').where('relatedDtrId', '==', req.params.dtrId).get();
  const batch = db.batch();
  notifSnapshot.docs.forEach((doc) => {
    batch.update(doc.ref, {
      isValid: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      message: `${doc.data().message || 'DTR notification'} (invalidated due to record deletion)`,
    });
  });
  if (!notifSnapshot.empty) {
    await batch.commit();
  }

  res.json({ message: 'DTR deleted' });
});

app.get('/notifications/:userId', verifyToken, requireDB, async (req, res) => {
  const { userId } = req.params;
  if (req.user.userId !== userId) return res.status(403).json({ error: 'Access denied' });

  const { limit = '20', cursor } = req.query;
  const pageSize = Math.min(Number(limit) || 20, 100);
  let queryRef = db
    .collection('notifications')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc');

  if (cursor && /^\d+$/.test(cursor)) {
    const cursorDate = new Date(Number(cursor));
    queryRef = queryRef.startAfter(cursorDate);
  }

  const snapshot = await queryRef.limit(pageSize).get();
  const notifications = snapshot.docs
    .map(doc => doc.data())
    .filter(item => item.isValid !== false);

  if (req.query.limit || cursor) {
    const lastCreatedAt = notifications[notifications.length - 1]?.createdAt;
    const lastDate = parseDate(lastCreatedAt);
    return res.json({
      notifications,
      nextCursor: notifications.length === pageSize && lastDate ? String(lastDate.getTime()) : null,
    });
  }

  res.json(notifications);
});

app.patch('/notifications/:notificationId/read', verifyToken, requireDB, async (req, res) => {
  const { notificationId } = req.params;
  const notificationRef = db.collection('notifications').doc(notificationId);
  const notificationDoc = await notificationRef.get();

  if (!notificationDoc.exists) {
    return res.status(404).json({ error: 'Notification not found' });
  }

  const notification = notificationDoc.data();
  if (req.user.userId !== notification.userId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  await notificationRef.update({
    read: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  res.json({ message: 'Notification marked as read' });
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
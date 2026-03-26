const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.disable('x-powered-by');

const parseAllowedOrigins = () => {
  const fromEnv = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (fromEnv.length) return fromEnv;

  return [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:19006',
    'http://127.0.0.1:19006',
    'exp://localhost:19000',
    'exp://127.0.0.1:19000',
  ];
};

const isPrivateNetworkOrigin = (origin) => {
  if (!origin) return false;
  return /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/i.test(origin);
};

const isExpoOrigin = (origin) => {
  if (!origin) return false;
  return /^exp:\/\/.+/i.test(origin);
};

const allowedOrigins = parseAllowedOrigins();
app.use(cors({
  origin(origin, callback) {
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    if (
      !origin ||
      origin === 'null' ||
      allowedOrigins.includes(origin) ||
      isPrivateNetworkOrigin(origin) ||
      isExpoOrigin(origin)
    ) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: false,
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

app.use(express.json({ limit: '200kb' }));

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

const normalizeDateKey = (value) => {
  if (!value) return '';
  const dateValue = String(value).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return dateValue;
  const parsed = parseDate(value);
  if (!parsed || Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
};

const sameUserId = (a, b) => String(a ?? '') === String(b ?? '');
const MAX_PAGE_SIZE = 10;

const isValidSessionState = (record) => {
  const inLen = Array.isArray(record.timeIn) ? record.timeIn.length : 0;
  const outLen = Array.isArray(record.timeOut) ? record.timeOut.length : 0;
  return inLen === outLen || inLen === outLen + 1;
};

const getShiftStatusCounts = (timeIn = [], timeOut = [], shiftStatuses = [], fallbackStatus = 'pending') => {
  const maxLen = Math.max(Array.isArray(timeIn) ? timeIn.length : 0, Array.isArray(timeOut) ? timeOut.length : 0);
  const counts = { approved: 0, pending: 0, declined: 0 };
  for (let i = 0; i < maxLen; i += 1) {
    const status = shiftStatuses[i] || fallbackStatus || 'pending';
    if (status === 'approved') counts.approved += 1;
    else if (status === 'declined') counts.declined += 1;
    else counts.pending += 1;
  }
  return counts;
};

const clampText = (value, maxLen) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1)).trim()}...`;
};

const createNotification = async (userId, payload) => {
  if (!db || !userId) return null;
  const notificationId = db.collection('notifications').doc().id;
  const record = {
    notificationId,
    userId,
    title: clampText(payload.title || 'DTR Update', 70),
    message: clampText(payload.message || '', 180),
    type: payload.type || 'info',
    relatedDtrId: payload.relatedDtrId || null,
    relatedDate: payload.relatedDate || null,
    read: false,
    isRead: false,
    isValid: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await db.collection('notifications').doc(notificationId).set(record);
  return record;
};

const notifyAdmins = async (payload, options = {}) => {
  if (!db) return;
  const excludeUserId = options.excludeUserId ? String(options.excludeUserId) : null;

  const adminsSnapshot = await db.collection('users').where('role', '==', 'admin').get();
  if (adminsSnapshot.empty) return;

  const jobs = adminsSnapshot.docs
    .map((doc) => doc.data())
    .filter((adminUser) => adminUser?.userId && String(adminUser.userId) !== excludeUserId)
    .map((adminUser) => createNotification(adminUser.userId, payload));

  if (jobs.length) {
    await Promise.all(jobs);
  }
};

const getUserDisplayName = (user, fallback = 'User') => {
  if (!user) return fallback;
  const full = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  return full || user.username || user.userId || fallback;
};

// Routes
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'dtr-backend' });
});

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
  try {
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

    const studentName = `${firstName || ''} ${lastName || ''}`.trim() || username || userId;

    // Student-facing notification: confirms account provisioning by admin.
    try {
      await createNotification(userId, {
        title: 'Account Created',
        message: `Your account was created by an administrator. Username: ${username}.`,
        type: 'account-created',
      });
    } catch (notifErr) {
      console.warn('Failed to create student account notification:', notifErr.message);
    }

    // Admin activity feed notification.
    try {
      await notifyAdmins({
        title: 'Student Account Created',
        message: `${studentName} was added by an administrator.`,
        type: 'admin-student-create',
      });
    } catch (adminNotifErr) {
      console.warn('Failed to create admin student-create notification:', adminNotifErr.message);
    }

    res.json({ userId, username, password });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to create student' });
  }
});

app.get('/students', verifyToken, requireDB, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
  const snapshot = await db.collection('users').where('role', '==', 'student').get();
  const students = snapshot.docs.map(doc => doc.data());
  res.json(students);
});

app.put('/students/:id', verifyToken, requireDB, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
  try {
    const { firstName, lastName, resetPassword, resetCredentials } = req.body;
    const studentRef = db.collection('users').doc(req.params.id);
    const studentDoc = await studentRef.get();
    if (!studentDoc.exists) return res.status(404).json({ error: 'Student not found' });

    const currentStudent = studentDoc.data();
    const updateData = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };

    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;

    let resetUsername = null;
    if (resetPassword || resetCredentials) {
      const surname = lastName || currentStudent.lastName;
      resetUsername = `user-${surname}`;
      const password = `pass-${surname}`;
      if (resetCredentials) {
        updateData.username = resetUsername;
      }
      updateData.password = await bcrypt.hash(password, 10);
      updateData.mustRelogin = true;
    }

    await studentRef.update(updateData);

    const nextStudent = {
      ...currentStudent,
      ...updateData,
      userId: req.params.id,
    };
    const studentName = getUserDisplayName(nextStudent, req.params.id);

    try {
      const message = resetCredentials
        ? `Your account credentials were reset by an administrator. New username: ${resetUsername}.`
        : resetPassword
          ? 'Your account password was reset by an administrator.'
          : 'Your account profile was updated by an administrator.';

      await createNotification(req.params.id, {
        title: resetCredentials || resetPassword ? 'Account Credentials Updated' : 'Account Updated',
        message,
        type: resetCredentials || resetPassword ? 'account-credentials-reset' : 'account-updated',
      });
    } catch (notifErr) {
      console.warn('Failed to create student-update notification:', notifErr.message);
    }

    try {
      const actionLabel = resetCredentials
        ? 'reset student credentials for'
        : resetPassword
          ? 'reset student password for'
          : 'updated student profile for';

      await notifyAdmins({
        title: 'Student Account Updated',
        message: `An administrator ${actionLabel} ${studentName}.`,
        type: 'admin-student-update',
      });
    } catch (adminNotifErr) {
      console.warn('Failed to create admin student-update notification:', adminNotifErr.message);
    }

    res.json({ message: 'Student updated', forceRelogin: !!(resetPassword || resetCredentials) });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to update student' });
  }
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
  try {
    const studentRef = db.collection('users').doc(req.params.id);
    const studentDoc = await studentRef.get();
    if (!studentDoc.exists) return res.status(404).json({ error: 'Student not found' });

    const student = studentDoc.data();
    const studentName = getUserDisplayName(student, req.params.id);

    await studentRef.delete();

    try {
      await notifyAdmins({
        title: 'Student Account Deleted',
        message: `${studentName} was removed by an administrator.`,
        type: 'admin-student-delete',
      });
    } catch (adminNotifErr) {
      console.warn('Failed to create admin student-delete notification:', adminNotifErr.message);
    }

    res.json({ message: 'Student deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to delete student' });
  }
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

  try {
    const studentDoc = await db.collection('users').doc(studentId).get();
    const studentData = studentDoc.exists ? studentDoc.data() : null;
    const studentName = studentData
      ? `${studentData.firstName || ''} ${studentData.lastName || ''}`.trim() || studentData.username || studentId
      : studentId;

    await notifyAdmins({
      title: action === 'timeIn' ? 'Student Time In Logged' : 'Student Time Out Logged',
      message: `${studentName} ${action === 'timeIn' ? 'timed in' : 'timed out'} on ${date}.`,
      type: action === 'timeIn' ? 'admin-student-time-in' : 'admin-student-time-out',
      relatedDtrId: dtrDoc.dtrId,
      relatedDate: date,
    });
  } catch (adminNotifErr) {
    console.warn('Failed to create admin DTR activity notification:', adminNotifErr.message);
  }

  res.json({ message: 'DTR updated' });
});

app.get('/dtr/:studentId', verifyToken, requireDB, async (req, res) => {
  try {
    const { studentId } = req.params;
    if (req.user.role !== 'admin' && !sameUserId(req.user.userId, studentId)) return res.status(403).json({ error: 'Access denied' });

    const { month, cursor, limit = String(MAX_PAGE_SIZE) } = req.query;
    const requestedLimit = Number(limit) || MAX_PAGE_SIZE;
    const pageSize = Math.min(Math.max(requestedLimit, 1), MAX_PAGE_SIZE);

    // Keep query index-friendly: fetch by student only, then filter month in memory.
    // Do not apply a low Firestore limit here; it can hide today's record and desync UI state.
    const snapshot = await db.collection('dtr_records').where('studentId', '==', studentId).get();
    let records = snapshot.docs.map(doc => doc.data());

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      records = records.filter((r) => (r.date || '').startsWith(month));
    }

    const cursorDateKey = normalizeDateKey(cursor);
    if (cursorDateKey) {
      records = records.filter((r) => normalizeDateKey(r.date) < cursorDateKey);
    }

    // Sort by date descending on the server side to avoid composite index requirements.
    records = records
      .sort((a, b) => {
        const dateA = parseDate(a.date);
        const dateB = parseDate(b.date);
        return dateB - dateA;
      })
      .slice(0, pageSize);

    const lastDateKey = normalizeDateKey(records[records.length - 1]?.date);
    const nextCursor = records.length === pageSize && lastDateKey ? lastDateKey : null;

    if (month || req.query.limit) {
      return res.json({
        records,
        nextCursor,
      });
    }

    res.json(records);
  } catch (err) {
    console.error('Failed to fetch DTR records:', err.message);
    res.status(500).json({ error: 'Failed to fetch DTR records' });
  }
});

app.get('/dtr/detail/:dtrId', verifyToken, requireDB, async (req, res) => {
  try {
    const dtrDoc = await db.collection('dtr_records').doc(req.params.dtrId).get();
    if (!dtrDoc.exists) return res.status(404).json({ error: 'DTR not found' });

    const dtr = dtrDoc.data();
    if (req.user.role !== 'admin' && !sameUserId(req.user.userId, dtr.studentId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    return res.json(dtr);
  } catch (err) {
    console.error('Failed to fetch DTR detail:', err.message);
    return res.status(500).json({ error: 'Failed to fetch DTR detail' });
  }
});

app.put('/dtr/:dtrId', verifyToken, requireDB, async (req, res) => {
  const { status, timeIn, timeOut, shiftStatuses } = req.body;
  const dtrRef = db.collection('dtr_records').doc(req.params.dtrId);
  const dtrDoc = await dtrRef.get();
  if (!dtrDoc.exists) return res.status(404).json({ error: 'DTR not found' });

  const dtr = dtrDoc.data();

  if (req.user.role === 'admin') {
    const prevStatus = dtr.status || 'pending';
    const prevCounts = getShiftStatusCounts(dtr.timeIn, dtr.timeOut, dtr.shiftStatuses || [], prevStatus);
    const updateData = { editedByAdmin: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() };

    if (typeof status === 'string' && status.trim()) updateData.status = status;
    if (Array.isArray(timeIn)) updateData.timeIn = timeIn;
    if (Array.isArray(timeOut)) updateData.timeOut = timeOut;
    if (Array.isArray(shiftStatuses)) {
      const expectedLen = Math.max(
        Array.isArray(updateData.timeIn) ? updateData.timeIn.length : (dtr.timeIn || []).length,
        Array.isArray(updateData.timeOut) ? updateData.timeOut.length : (dtr.timeOut || []).length
      );
      if (shiftStatuses.length !== expectedLen) {
        return res.status(400).json({ error: 'shiftStatuses length must match time session count' });
      }
      updateData.shiftStatuses = shiftStatuses;
    }

    await dtrRef.update(updateData);

    const nextStatus = typeof updateData.status === 'string' ? updateData.status : prevStatus;
    const nextCounts = getShiftStatusCounts(
      Array.isArray(updateData.timeIn) ? updateData.timeIn : dtr.timeIn,
      Array.isArray(updateData.timeOut) ? updateData.timeOut : dtr.timeOut,
      Array.isArray(updateData.shiftStatuses) ? updateData.shiftStatuses : (dtr.shiftStatuses || []),
      nextStatus
    );

    const statusChanged = nextStatus !== prevStatus;
    const countsChanged =
      nextCounts.approved !== prevCounts.approved ||
      nextCounts.pending !== prevCounts.pending ||
      nextCounts.declined !== prevCounts.declined;

    if (statusChanged || countsChanged) {
      let title = 'DTR Ticket Updated';
      let type = 'dtr-update';
      if (statusChanged && nextStatus === 'approved') {
        title = 'DTR Ticket Approved';
        type = 'dtr-approved';
      } else if (statusChanged && nextStatus === 'declined') {
        title = 'DTR Ticket Declined';
        type = 'dtr-declined';
      } else if (statusChanged && nextStatus === 'pending') {
        title = 'DTR Ticket Returned to Pending';
        type = 'dtr-pending';
      }

      const message = statusChanged
        ? `Your DTR ticket for ${dtr.date} is now ${nextStatus}. Approved shifts: ${nextCounts.approved}, pending: ${nextCounts.pending}, declined: ${nextCounts.declined}.`
        : `Your DTR shift review for ${dtr.date} was updated. Approved: ${nextCounts.approved}, pending: ${nextCounts.pending}, declined: ${nextCounts.declined}.`;

      try {
        await createNotification(dtr.studentId, {
          title,
          message,
          type,
          relatedDtrId: dtr.dtrId,
          relatedDate: dtr.date,
        });
      } catch (notifErr) {
        console.warn('Failed to create DTR review notification:', notifErr.message);
      }
    }

    return res.json({ message: 'DTR updated' });
  }

  // Student can only update own pending record and only time arrays.
  if (!sameUserId(req.user.userId, dtr.studentId)) return res.status(403).json({ error: 'Access denied' });
  if (dtr.status !== 'pending') return res.status(403).json({ error: 'Only pending records can be edited' });
  if (!Array.isArray(timeIn) || !Array.isArray(timeOut)) {
    return res.status(400).json({ error: 'timeIn and timeOut arrays are required' });
  }
  if (timeIn.length < timeOut.length || timeIn.length > timeOut.length + 1) {
    return res.status(400).json({ error: 'Invalid time session sequence' });
  }

  await dtrRef.update({
    timeIn,
    timeOut,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  res.json({ message: 'Pending DTR sessions updated' });
});

app.delete('/dtr/:dtrId', verifyToken, requireDB, async (req, res) => {
  const dtrDoc = await db.collection('dtr_records').doc(req.params.dtrId).get();
  if (!dtrDoc.exists) return res.status(404).json({ error: 'DTR not found' });
  const dtr = dtrDoc.data();
  if (req.user.role !== 'admin' && (!sameUserId(req.user.userId, dtr.studentId) || dtr.status !== 'pending')) return res.status(403).json({ error: 'Access denied' });
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

  if (req.user.role !== 'admin') {
    try {
      const studentDoc = await db.collection('users').doc(dtr.studentId).get();
      const studentData = studentDoc.exists ? studentDoc.data() : null;
      const studentName = studentData
        ? `${studentData.firstName || ''} ${studentData.lastName || ''}`.trim() || studentData.username || dtr.studentId
        : dtr.studentId;

      await notifyAdmins({
        title: 'Pending DTR Deleted by Student',
        message: `${studentName} deleted a pending DTR record for ${dtr.date}.`,
        type: 'admin-dtr-delete',
        relatedDtrId: dtr.dtrId,
        relatedDate: dtr.date,
      });
    } catch (adminNotifErr) {
      console.warn('Failed to create admin delete notification:', adminNotifErr.message);
    }
  }

  res.json({ message: 'DTR deleted' });
});

app.get('/notifications/:userId', verifyToken, requireDB, async (req, res) => {
  try {
    const { userId } = req.params;
    const targetUserId = req.user.role === 'admin' ? userId : req.user.userId;

    const { limit = String(MAX_PAGE_SIZE), cursor } = req.query;
    const requestedLimit = Number(limit) || MAX_PAGE_SIZE;
    const pageSize = Math.min(Math.max(requestedLimit, 1), MAX_PAGE_SIZE);
    const snapshot = await db
      .collection('notifications')
      .where('userId', '==', String(targetUserId))
      .get();

    let notifications = snapshot.docs
      .map(doc => doc.data())
      .filter(item => item.isValid !== false)
      .sort((a, b) => {
        const aMs = parseDate(a.createdAt)?.getTime() || 0;
        const bMs = parseDate(b.createdAt)?.getTime() || 0;
        return bMs - aMs;
      });

    if (cursor && /^\d+$/.test(cursor)) {
      const cursorMs = Number(cursor);
      notifications = notifications.filter((item) => {
        const createdMs = parseDate(item.createdAt)?.getTime() || 0;
        return createdMs < cursorMs;
      });
    }

    notifications = notifications.slice(0, pageSize);

    if (req.query.limit || cursor) {
      const lastCreatedAt = notifications[notifications.length - 1]?.createdAt;
      const lastDate = parseDate(lastCreatedAt);
      return res.json({
        notifications,
        nextCursor: notifications.length === pageSize && lastDate ? String(lastDate.getTime()) : null,
      });
    }

    res.json(notifications);
  } catch (err) {
    console.error('Failed to fetch notifications:', err.message);
    return res.status(500).json({
      error: 'Failed to fetch notifications',
      ...(process.env.NODE_ENV !== 'production' ? { details: err.message } : {}),
    });
  }
});

app.patch('/notifications/:notificationId/read', verifyToken, requireDB, async (req, res) => {
  try {
    const { notificationId } = req.params;
    const notificationRef = db.collection('notifications').doc(notificationId);
    const notificationDoc = await notificationRef.get();

    if (!notificationDoc.exists) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const notification = notificationDoc.data();
    if (!sameUserId(req.user.userId, notification.userId) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    await notificationRef.update({
      read: true,
      isRead: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('Failed to mark notification as read:', err.message);
    return res.status(500).json({ error: 'Failed to update notification' });
  }
});

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim().length < 16) {
      throw new Error('JWT_SECRET is missing or too short. Set a strong JWT secret in backend/.env before starting the API.');
    }
    await ensureDefaultAdmin();

    const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    server.on('error', (err) => {
      if (err?.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Stop the other backend process or set PORT in backend/.env.`);
        process.exit(1);
      }
      console.error('Server error:', err.message || err);
      process.exit(1);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
};

startServer();
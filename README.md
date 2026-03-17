# DTR Tracking System

A complete Daily Time Record (DTR) monitoring and tracking system with React Native mobile app for students, React.js web admin panel, and Node.js backend API using Firebase Firestore.

## Project Structure

- `backend/` - Node.js API server
- `mobile/` - React Native Expo app for students
- `web/` - React.js admin panel
- `firebase/` - Firebase configuration
- `docs/screenshots/` - UI screenshot assets and references

## Setup Instructions

### 1. Firebase Setup

1. Create a new Firebase project at https://console.firebase.google.com/
2. Enable Firestore Database
3. Create a service account and download the JSON key file
4. Place the JSON file as `backend/firebase-service-account.json`
5. Update `firebase/firebaseConfig.js` with your project config

### 2. Backend Setup

```bash
cd backend
npm install
# Update .env with your JWT secret
npm start
```

### 3. Mobile App Setup

```bash
cd mobile
npm install
expo start
```

### 4. Web Admin Setup

```bash
cd web
npm install
npm start
```

## Features

- Student time-in/time-out via mobile app
- Admin management of students and DTR records
- Real-time notifications
- Calendar view with color-coded statuses
- Role-based access control

## Database Rules

Ensure Firestore rules allow read/write for authenticated users as per your security requirements.

## Deployment

- Backend: Deploy to Heroku, Vercel, or similar
- Mobile: Build with Expo and submit to app stores
- Web: Deploy to Netlify, Vercel, or Firebase Hosting

## Default Admin Credentials

Create an admin user manually in Firestore or add a setup script.

## Notes

- System designed for local group use
- No third-party services beyond Firebase
- JWT for authentication
- Bcrypt for password hashing
import React, { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View, Alert } from 'react-native';
import { ActivityIndicator, Badge, Button, Card, IconButton, Snackbar, Text } from 'react-native-paper';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { getApiBaseUrl } from '../utils/api';

const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value === 'string') return new Date(value).getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  return 0;
};

const formatDate = (value) => {
  const ms = toMillis(value);
  if (!ms) return 'Unknown date';
  return new Date(ms).toLocaleString();
};

const parseDate = (value) => {
  const ms = toMillis(value);
  return ms ? new Date(ms) : null;
};

const pairTimes = (record) => {
  const inArr = record?.timeIn || [];
  const outArr = record?.timeOut || [];
  return inArr.map((entry, index) => ({
    timeIn: entry,
    timeOut: outArr[index] || null,
  }));
};

export default function DashboardScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [isTimedIn, setIsTimedIn] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [nextAction, setNextAction] = useState('timeIn');
  const [lastActionLabel, setLastActionLabel] = useState('No logs yet for today.');
  const lastNotificationIdRef = useRef(null);

  useEffect(() => {
    let unsubscribe = () => {};
    const boot = async () => {
      const userData = await AsyncStorage.getItem('user');
      const parsedUser = JSON.parse(userData || '{}');
      setUser(parsedUser);

      if (parsedUser?.userId) {
        const q = query(
          collection(db, 'notifications'),
          where('userId', '==', parsedUser.userId),
          limit(200)
        );

        unsubscribe = onSnapshot(
          q,
          (snap) => {
            const rows = snap.docs
              .map((doc) => ({ ...doc.data(), __id: doc.id }))
              .filter((item) => item.isValid !== false)
              .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
            const top5 = rows.slice(0, 5);
            setNotifications(top5);
            setLoadingNotifications(false);

            if (top5[0] && top5[0].notificationId !== lastNotificationIdRef.current) {
              if (lastNotificationIdRef.current) {
                setMessage(top5[0].title || 'New notification');
              }
              lastNotificationIdRef.current = top5[0].notificationId;
            }
          },
          () => {
            setLoadingNotifications(false);
          }
        );
      }

      await refreshSessionStatus(parsedUser?.userId);
    };

    boot();

    return () => unsubscribe();
  }, []);

  const refreshSessionStatus = async (userIdParam) => {
    try {
      setLoadingStatus(true);
      const token = await AsyncStorage.getItem('token');
      const activeUserId = userIdParam || user?.userId;
      if (!token || !activeUserId) {
        setIsTimedIn(false);
        return;
      }

      const currentMonth = new Date().toISOString().slice(0, 7);
      const apiBaseUrl = await getApiBaseUrl();
      const response = await axios.get(`${apiBaseUrl}/dtr/${activeUserId}?month=${currentMonth}&limit=60`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const records = Array.isArray(response.data) ? response.data : response.data.records || [];
      const today = new Date().toISOString().slice(0, 10);
      const todayRecord = records.find((r) => r.date === today);

      if (!todayRecord) {
        setIsTimedIn(false);
        setNextAction('timeIn');
        setLastActionLabel('No logs yet for today.');
      } else {
        const inLen = Array.isArray(todayRecord.timeIn) ? todayRecord.timeIn.length : 0;
        const outLen = Array.isArray(todayRecord.timeOut) ? todayRecord.timeOut.length : 0;
        const currentlyTimedIn = inLen > outLen;
        setIsTimedIn(currentlyTimedIn);
        setNextAction(currentlyTimedIn ? 'timeOut' : 'timeIn');

        const lastIn = inLen ? parseDate(todayRecord.timeIn[inLen - 1]) : null;
        const lastOut = outLen ? parseDate(todayRecord.timeOut[outLen - 1]) : null;
        const latest = [lastIn, lastOut].filter(Boolean).sort((a, b) => b.getTime() - a.getTime())[0];

        if (latest) {
          setLastActionLabel(`Last log: ${latest.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
        } else {
          setLastActionLabel('No logs yet for today.');
        }
      }
    } catch (err) {
      setIsTimedIn(false);
      setNextAction('timeIn');
      setLastActionLabel('Unable to verify current session.');
    } finally {
      setLoadingStatus(false);
    }
  };

  const handleTimeInOut = async (action) => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const apiBaseUrl = await getApiBaseUrl();
      await axios.post(`${apiBaseUrl}/dtr`, { action }, { headers: { Authorization: `Bearer ${token}` } });
      setMessage(`${action === 'timeIn' ? 'Timed In' : 'Timed Out'} successfully`);
      await refreshSessionStatus();
    } catch (err) {
      setMessage(err.response?.data?.error || 'Action failed');
      // Re-sync local status so UI reflects backend truth after any action error.
      await refreshSessionStatus();
    }
    setLoading(false);
  };

  const confirmAction = (action) => {
    const actionLabel = action === 'timeIn' ? 'Time In' : 'Time Out';
    Alert.alert(
      `${actionLabel} Confirmation`,
      `Are you sure you want to ${actionLabel.toLowerCase()} now?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'OK', onPress: () => handleTimeInOut(action) },
      ]
    );
  };

  const statusText = loadingStatus ? 'Checking status...' : isTimedIn ? 'Currently Timed In' : 'Currently Timed Out';
  const statusStyle = isTimedIn ? styles.statusIn : styles.statusOut;
  const quickActionLabel = nextAction === 'timeIn' ? 'Time In Now' : 'Time Out Now';
  const quickActionHelp = isTimedIn
    ? 'You are currently timed in. Tap below when you are ready to end your session.'
    : 'You are currently timed out. Tap below to start your session.';

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View />
        <IconButton icon="account-circle" size={34} onPress={() => navigation.navigate('Profile')} />
      </View>

      <Text style={styles.title}>Welcome, {user?.firstName || 'User'}</Text>

      <View style={styles.statusRow}>
        <Badge style={[styles.statusBadge, statusStyle]}>{isTimedIn ? 'IN' : 'OUT'}</Badge>
        <Text style={styles.statusLabel}>{statusText}</Text>
        {loadingStatus && <ActivityIndicator size="small" style={styles.statusLoader} />}
      </View>

      <Card style={styles.quickActionCard}>
        <Card.Content>
          <Text style={styles.quickActionTitle}>Quick Action</Text>
          <Text style={styles.quickActionDesc}>{quickActionHelp}</Text>
          <Text style={styles.quickActionMeta}>{lastActionLabel}</Text>
          <Button
            mode="contained"
            disabled={loading || loadingStatus}
            loading={loading}
            onPress={() => confirmAction(nextAction)}
          >
            {quickActionLabel}
          </Button>
        </Card.Content>
      </Card>

      <Text style={styles.sectionTitle}>Main Actions</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carouselContainer}>
        <Card style={styles.actionCard}>
          <Card.Content>
            <Text style={styles.actionTitle}>Time In</Text>
            <Text style={styles.actionDesc}>Start your active session.</Text>
            <Button mode="contained" disabled={isTimedIn || loading || loadingStatus} onPress={() => confirmAction('timeIn')}>
              Time In
            </Button>
          </Card.Content>
        </Card>

        <Card style={styles.actionCard}>
          <Card.Content>
            <Text style={styles.actionTitle}>Time Out</Text>
            <Text style={styles.actionDesc}>End your active session.</Text>
            <Button mode="contained" disabled={!isTimedIn || loading || loadingStatus} onPress={() => confirmAction('timeOut')}>
              Time Out
            </Button>
          </Card.Content>
        </Card>

        <Card style={styles.actionCard}>
          <Card.Content>
            <Text style={styles.actionTitle}>My Records</Text>
            <Text style={styles.actionDesc}>Calendar and history views.</Text>
            <Button mode="contained-tonal" onPress={() => navigation.navigate('History')}>
              My Records
            </Button>
          </Card.Content>
        </Card>
      </ScrollView>

      <View style={styles.notificationHeader}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Notifications')}>
          <Text style={styles.viewAll}>View All</Text>
        </TouchableOpacity>
      </View>

      <Card style={styles.notificationCard}>
        <Card.Content>
          {loadingNotifications ? (
            <ActivityIndicator />
          ) : notifications.length === 0 ? (
            <Text style={styles.emptyText}>No notifications available</Text>
          ) : (
            notifications.map((item, idx) => (
              <TouchableOpacity key={item.notificationId || item.__id || String(idx)} style={styles.notificationRow} onPress={() => setSelectedNotification(item)}>
                <Text style={styles.notificationTitle}>{item.title || 'Notification'}</Text>
                <Text numberOfLines={1} style={styles.notificationBody}>{item.message || 'Tap to view details'}</Text>
                <Text style={styles.notificationMeta}>{formatDate(item.createdAt)}</Text>
              </TouchableOpacity>
            ))
          )}
        </Card.Content>
      </Card>

      <Modal visible={!!selectedNotification} transparent animationType="slide" onRequestClose={() => setSelectedNotification(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{selectedNotification?.title || 'Notification'}</Text>
            <Text style={styles.modalBody}>{selectedNotification?.message || '-'}</Text>
            <Text style={styles.modalMeta}>Related DTR: {selectedNotification?.relatedDtrId || '-'}</Text>
            <Text style={styles.modalMeta}>Timestamp: {formatDate(selectedNotification?.createdAt)}</Text>
            <Button mode="contained" onPress={() => setSelectedNotification(null)}>
              Close
            </Button>
          </View>
        </View>
      </Modal>

      <Snackbar visible={!!message} onDismiss={() => setMessage('')} duration={3000}>
        {message}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f6f8fc',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1b2840',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1b2840',
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  statusBadge: {
    marginRight: 8,
    color: '#ffffff',
  },
  statusIn: {
    backgroundColor: '#2e7d32',
  },
  statusOut: {
    backgroundColor: '#c62828',
  },
  statusLabel: {
    fontWeight: '600',
    color: '#45506a',
  },
  statusLoader: {
    marginLeft: 8,
  },
  quickActionCard: {
    borderRadius: 12,
    marginBottom: 12,
  },
  quickActionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  quickActionDesc: {
    fontSize: 13,
    color: '#63708a',
    marginBottom: 8,
  },
  quickActionMeta: {
    fontSize: 12,
    color: '#4f5e7a',
    marginBottom: 10,
  },
  carouselContainer: {
    paddingBottom: 6,
  },
  actionCard: {
    width: 250,
    marginRight: 12,
    borderRadius: 12,
  },
  actionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  actionDesc: {
    fontSize: 13,
    color: '#63708a',
    marginBottom: 10,
  },
  notificationHeader: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  viewAll: {
    color: '#246bce',
    fontWeight: '700',
  },
  notificationCard: {
    flex: 1,
    borderRadius: 12,
  },
  notificationRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#edf1f7',
  },
  notificationTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  notificationBody: {
    color: '#5d6a84',
    marginTop: 2,
  },
  notificationMeta: {
    marginTop: 3,
    color: '#7d889d',
    fontSize: 12,
  },
  emptyText: {
    textAlign: 'center',
    color: '#677287',
    paddingVertical: 10,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
  },
  modalTitle: {
    fontWeight: '700',
    fontSize: 18,
    marginBottom: 8,
  },
  modalBody: {
    fontSize: 14,
    color: '#43516b',
    marginBottom: 10,
  },
  modalMeta: {
    fontSize: 13,
    color: '#63708a',
    marginBottom: 4,
  },
});
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, RefreshControl, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ActivityIndicator, Button, Card, Snackbar, Text } from 'react-native-paper';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../firebaseConfig';
import axios from 'axios';
import { getApiBaseUrl } from '../utils/api';

const PAGE_SIZE = 15;

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

const sortNotifications = (list = []) => {
  return [...list].sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
};

export default function NotificationsScreen() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  const fetchFromBackend = async ({ silent = false } = {}) => {
    try {
      const userRaw = await AsyncStorage.getItem('user');
      const token = await AsyncStorage.getItem('token');
      const user = JSON.parse(userRaw || '{}');
      if (!user?.userId || !token) {
        if (!silent) setToast('No active user session. Please login again.');
        setItems([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const apiBaseUrl = await getApiBaseUrl();
      const response = await axios.get(`${apiBaseUrl}/notifications/${user.userId}?limit=300`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const next = Array.isArray(response.data)
        ? response.data
        : (response.data.notifications || []);

      setItems(sortNotifications(next.filter((item) => item.isValid !== false)));
      setCurrentPage(1);
      setLoading(false);
      setRefreshing(false);
    } catch (err) {
      setLoading(false);
      setRefreshing(false);
      if (!silent) setToast('Unable to load notifications.');
    }
  };

  const markAsRead = async (item) => {
    const notificationId = item?.notificationId || item?.__id;
    if (!notificationId) return;

    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      const apiBaseUrl = await getApiBaseUrl();
      await axios.patch(
        `${apiBaseUrl}/notifications/${notificationId}/read`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setItems((prev) =>
        prev.map((row) =>
          (row.notificationId || row.__id) === notificationId
            ? { ...row, read: true, isRead: true }
            : row
        )
      );
    } catch (err) {
      // Keep UX non-blocking if read update fails.
    }
  };

  useEffect(() => {
    let unsubscribe = () => {};

    const start = async () => {
      setLoading(true);
      try {
        const userRaw = await AsyncStorage.getItem('user');
        const user = JSON.parse(userRaw || '{}');

        if (!user?.userId) {
          setItems([]);
          setToast('No active user session. Please login again.');
          setLoading(false);
          return;
        }

        const idCandidates = [...new Set([
          user.userId,
          String(user.userId),
          Number.isNaN(Number(user.userId)) ? null : Number(user.userId),
        ].filter((v) => v !== null && v !== undefined && v !== ''))];

        const q = query(
          collection(db, 'notifications'),
          where('userId', 'in', idCandidates),
          limit(300)
        );

        unsubscribe = onSnapshot(
          q,
          (snap) => {
            const next = snap.docs
              .map((doc) => ({ ...doc.data(), __id: doc.id }))
              .filter((item) => item.isValid !== false)
              .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
            setItems(next);
            setCurrentPage(1);
            setRefreshing(false);
            setLoading(false);
          },
          () => {
            fetchFromBackend();
          }
        );
      } catch (error) {
        fetchFromBackend();
      }
    };

    start();
    return () => unsubscribe();
  }, [reloadToken]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchFromBackend({ silent: true });
    setReloadToken((prev) => prev + 1);
  };

  const onRetry = () => {
    setLoading(true);
    fetchFromBackend();
    setReloadToken((prev) => prev + 1);
  };

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const visibleItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  }, [items, safePage]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Notifications</Text>
        <Button compact mode="text" onPress={onRetry}>Retry</Button>
      </View>
      {loading ? (
        <ActivityIndicator style={styles.loader} />
      ) : items.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.empty}>No notifications available yet.</Text>
          <Text style={styles.emptyHint}>Notifications from approvals and updates will appear here in real time.</Text>
          <Button mode="outlined" onPress={onRetry}>Refresh Inbox</Button>
        </View>
      ) : (
        <>
          <FlatList
            data={visibleItems}
            keyExtractor={(item, index) => item.notificationId || item.__id || String(index)}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => {
                  setSelected(item);
                  markAsRead(item);
                }}
              >
                <Card style={styles.card}>
                  <Card.Content>
                    <Text style={styles.cardTitle}>
                      {item.title || 'Notification'} {item.read || item.isRead ? '' : '(New)'}
                    </Text>
                    <Text numberOfLines={2} style={styles.cardBody}>{item.message || 'Tap to view details'}</Text>
                    <Text style={styles.meta}>{formatDate(item.createdAt)}</Text>
                  </Card.Content>
                </Card>
              </TouchableOpacity>
            )}
          />
          <View style={styles.paginationRow}>
            <Button mode="outlined" disabled={safePage <= 1} onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}>
              Prev
            </Button>
            <Text style={styles.pageText}>Page {safePage} / {totalPages}</Text>
            <Button mode="outlined" disabled={safePage >= totalPages} onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>
              Next
            </Button>
          </View>
        </>
      )}

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{selected?.title || 'Notification'}</Text>
            <Text style={styles.modalBody}>{selected?.message || '-'}</Text>
            <Text style={styles.modalMeta}>Related DTR: {selected?.relatedDtrId || '-'}</Text>
            <Text style={styles.modalMeta}>Date: {selected?.relatedDate || '-'}</Text>
            <Text style={styles.modalMeta}>Timestamp: {formatDate(selected?.createdAt)}</Text>
            <Button style={styles.closeBtn} mode="contained" onPress={() => setSelected(null)}>
              Close
            </Button>
          </View>
        </View>
      </Modal>

      <Snackbar visible={!!toast} onDismiss={() => setToast('')} duration={2400}>
        {toast}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f8fc',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1c2640',
  },
  headerRow: {
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  loader: {
    marginTop: 25,
  },
  emptyWrap: {
    marginTop: 20,
    alignItems: 'center',
    gap: 10,
  },
  empty: {
    textAlign: 'center',
    color: '#667188',
  },
  emptyHint: {
    textAlign: 'center',
    color: '#7b869d',
    marginBottom: 4,
  },
  listContent: {
    paddingBottom: 10,
  },
  paginationRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pageText: {
    color: '#5f6f86',
    fontWeight: '600',
  },
  card: {
    marginBottom: 10,
    borderRadius: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  cardBody: {
    color: '#4f5d77',
  },
  meta: {
    marginTop: 6,
    color: '#6b7488',
    fontSize: 12,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalBody: {
    fontSize: 14,
    color: '#3f4a61',
    marginBottom: 12,
  },
  modalMeta: {
    fontSize: 13,
    marginBottom: 4,
    color: '#5b677f',
  },
  closeBtn: {
    marginTop: 10,
  },
});

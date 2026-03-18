import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ActivityIndicator, Button, Card, Snackbar, Text } from 'react-native-paper';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../firebaseConfig';

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

export default function NotificationsScreen() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    let unsubscribe = () => {};

    const start = async () => {
      const userRaw = await AsyncStorage.getItem('user');
      const user = JSON.parse(userRaw || '{}');
      if (!user?.userId) {
        setLoading(false);
        return;
      }

      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', user.userId),
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
          setLoading(false);
        },
        () => {
          setLoading(false);
          setToast('Unable to load notifications');
        }
      );
    };

    start();
    return () => unsubscribe();
  }, []);

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
  const canLoadMore = visibleCount < items.length;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Notifications</Text>
      {loading ? (
        <ActivityIndicator style={styles.loader} />
      ) : items.length === 0 ? (
        <Text style={styles.empty}>No notifications available</Text>
      ) : (
        <>
          <FlatList
            data={visibleItems}
            keyExtractor={(item, index) => item.notificationId || item.__id || String(index)}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => setSelected(item)}>
                <Card style={styles.card}>
                  <Card.Content>
                    <Text style={styles.cardTitle}>{item.title || 'Notification'}</Text>
                    <Text numberOfLines={2} style={styles.cardBody}>{item.message || 'Tap to view details'}</Text>
                    <Text style={styles.meta}>{formatDate(item.createdAt)}</Text>
                  </Card.Content>
                </Card>
              </TouchableOpacity>
            )}
          />
          {canLoadMore && (
            <Button mode="outlined" onPress={() => setVisibleCount((prev) => prev + PAGE_SIZE)}>
              Load More
            </Button>
          )}
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
    marginBottom: 10,
  },
  loader: {
    marginTop: 25,
  },
  empty: {
    marginTop: 20,
    textAlign: 'center',
    color: '#667188',
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

import React, { useState, useEffect } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Card, Text } from 'react-native-paper';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrl } from '../utils/api';

const PAGE_SIZE = 20;

const formatTime = (value) => {
  if (!value || value === '-') return '--:--';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export default function CalendarScreen() {
  const [records, setRecords] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');

  const getData = async ({ reset = false } = {}) => {
    try {
      setLoading(true);
      const userData = await AsyncStorage.getItem('user');
      const parsedUser = JSON.parse(userData || '{}');
      const token = await AsyncStorage.getItem('token');
      if (!parsedUser?.userId || !token) {
        setMessage('Login required');
        return;
      }

      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (!reset && cursor) params.set('cursor', cursor);

      const apiBaseUrl = await getApiBaseUrl();
      const response = await axios.get(`${apiBaseUrl}/dtr/${parsedUser.userId}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const payload = Array.isArray(response.data)
        ? { records: response.data, nextCursor: null }
        : response.data;

      const nextRecords = payload.records || [];
      setRecords((prev) => (reset ? nextRecords : [...prev, ...nextRecords]));
      setCursor(payload.nextCursor || null);
      setHasMore(!!payload.nextCursor);
    } catch (err) {
      setMessage(err.response?.data?.error || 'Failed to fetch records');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    getData({ reset: true });
  }, []);

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved': return 'green';
      case 'pending': return 'yellow';
      case 'declined': return 'red';
      default: return 'gray';
    }
  };

  const renderItem = (item) => (
    <Card style={[styles.card, { borderColor: getStatusColor(item.status) }]}>
      <Card.Content>
        <Text>Date: {item.date}</Text>
        <Text>Time In: {(item.timeIn || []).map((t) => formatTime(t)).join(', ') || '--'}</Text>
        <Text>Time Out: {(item.timeOut || []).map((t) => formatTime(t)).join(', ') || '--'}</Text>
        <Text>Status: {item.status}</Text>
      </Card.Content>
    </Card>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>DTR Calendar</Text>

      {loading && records.length === 0 ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <>
          <View style={styles.listWrap}>
            <ScrollView
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
                setRefreshing(true);
                getData({ reset: true });
              }} />}
              contentContainerStyle={styles.scrollContent}
            >
              {records.map((item) => (
                <View key={item.dtrId}>{renderItem(item)}</View>
              ))}
            </ScrollView>
          </View>

          <View style={styles.paginationRow}>
            <Button mode="outlined" onPress={() => {
              setRefreshing(true);
              getData({ reset: true });
            }}>
              Refresh
            </Button>
            {hasMore && (
              <Button mode="contained" onPress={() => getData({ reset: false })} loading={loading}>
                Next Page
              </Button>
            )}
          </View>
          {message ? <Text style={styles.message}>{message}</Text> : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f6f8fc' },
  title: { fontSize: 24, textAlign: 'center', marginBottom: 12, fontWeight: '700', color: '#1b2840' },
  loader: { marginTop: 18 },
  listWrap: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 10,
  },
  card: { marginBottom: 10, borderWidth: 2, borderRadius: 12 },
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 8,
  },
  message: {
    marginTop: 6,
    textAlign: 'center',
    color: '#ad4a4a',
  },
});
import React, { useState, useEffect } from 'react';
import { Alert, FlatList, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Button, Card, Chip, SegmentedButtons, Snackbar, Text } from 'react-native-paper';
import { Calendar } from 'react-native-calendars';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
const PAGE_SIZE = 40;

const getStatusColor = (status) => {
  switch (status) {
    case 'approved':
      return '#2e7d32';
    case 'pending':
      return '#f9a825';
    case 'declined':
      return '#c62828';
    default:
      return '#607d8b';
  }
};

const pairTimes = (record) => {
  const inArr = record?.timeIn || [];
  const outArr = record?.timeOut || [];
  return inArr.map((entry, index) => ({
    index: index + 1,
    timeIn: entry,
    timeOut: outArr[index] || '-',
  }));
};

export default function HistoryScreen() {
  const [records, setRecords] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [filterMode, setFilterMode] = useState('month');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [viewMode, setViewMode] = useState('calendar');
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedRecord, setSelectedRecord] = useState(null);

  const fetchRecords = async ({ reset = false, explicitMonth = month } = {}) => {
    try {
      setLoading(true);
      const userData = await AsyncStorage.getItem('user');
      const user = JSON.parse(userData || '{}');
      const token = await AsyncStorage.getItem('token');
      if (!user?.userId || !token) {
        setMessage('Login required');
        return;
      }

      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));

      if (filterMode === 'month') {
        params.set('month', explicitMonth);
      }

      if (!reset && cursor) {
        params.set('cursor', cursor);
      }

      const response = await axios.get(`${API_URL}/dtr/${user.userId}?${params.toString()}`, {
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
    }
  };

  useEffect(() => {
    fetchRecords({ reset: true });
  }, [filterMode]);

  useEffect(() => {
    if (filterMode === 'month') {
      fetchRecords({ reset: true, explicitMonth: month });
    }
  }, [month]);

  const changeMonth = (delta) => {
    const [year, mon] = month.split('-').map(Number);
    const d = new Date(year, mon - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const toDayDate = (value) => {
    const d = new Date(value);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const isSameWeek = (dateString, refDateString) => {
    const date = toDayDate(dateString);
    const ref = toDayDate(refDateString);
    const day = ref.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const weekStart = new Date(ref);
    weekStart.setDate(ref.getDate() + mondayOffset);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return date >= weekStart && date <= weekEnd;
  };

  const filteredRecords = records.filter((record) => {
    if (filterMode === 'month') {
      return (record.date || '').startsWith(month);
    }
    if (filterMode === 'week') {
      return isSameWeek(record.date, selectedDate);
    }
    if (filterMode === 'year') {
      return (record.date || '').startsWith(month.slice(0, 4));
    }
    return true;
  });

  const selectedDateRecords = filteredRecords.filter((record) => record.date === selectedDate);

  const markedDates = filteredRecords.reduce((acc, record) => {
    acc[record.date] = {
      marked: true,
      dotColor: getStatusColor(record.status),
    };
    return acc;
  }, {});

  markedDates[selectedDate] = {
    ...(markedDates[selectedDate] || {}),
    selected: true,
    selectedColor: '#1f6feb',
  };

  const renderRecordCard = ({ item }) => (
    <TouchableOpacity onPress={() => setSelectedRecord(item)}>
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <Text style={styles.cardDate}>{item.date}</Text>
            <Chip compact style={{ backgroundColor: getStatusColor(item.status) }} textStyle={{ color: '#fff' }}>
              {item.status}
            </Chip>
          </View>
          {pairTimes(item).map((pair) => (
            <Text key={`${item.dtrId}-${pair.index}`} style={styles.pairRow}>
              Time In {pair.index}: {pair.timeIn} -> Time Out {pair.index}: {pair.timeOut}
            </Text>
          ))}
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );

  const handleDelete = async (record) => {
    try {
      const token = await AsyncStorage.getItem('token');
      await axios.delete(`${API_URL}/dtr/${record.dtrId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRecords((prev) => prev.filter((r) => r.dtrId !== record.dtrId));
      setSelectedRecord(null);
      setMessage('Pending record deleted');
    } catch (err) {
      setMessage(err.response?.data?.error || 'Delete failed');
    }
  };

  const confirmDelete = (record) => {
    Alert.alert('Confirm Delete', 'Delete this pending DTR record?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => handleDelete(record) },
    ]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Records</Text>

      <SegmentedButtons
        value={viewMode}
        onValueChange={setViewMode}
        style={styles.viewMode}
        buttons={[
          { value: 'calendar', label: 'Calendar View' },
          { value: 'list', label: 'List View' },
        ]}
      />

      <SegmentedButtons
        value={filterMode}
        onValueChange={setFilterMode}
        style={styles.viewMode}
        buttons={[
          { value: 'month', label: 'Month' },
          { value: 'week', label: 'Week' },
          { value: 'year', label: 'Year' },
        ]}
      />

      {filterMode === 'month' && (
        <View style={styles.monthControls}>
          <Button compact onPress={() => changeMonth(-1)}>Prev</Button>
          <Text style={styles.monthLabel}>{month}</Text>
          <Button compact onPress={() => changeMonth(1)}>Next</Button>
        </View>
      )}

      {viewMode === 'calendar' ? (
        <>
          <Card style={styles.calendarCard}>
            <Card.Content>
              <Calendar
                current={`${month}-01`}
                markedDates={markedDates}
                onDayPress={(day) => setSelectedDate(day.dateString)}
                theme={{
                  todayTextColor: '#1f6feb',
                  selectedDayBackgroundColor: '#1f6feb',
                  arrowColor: '#1f6feb',
                }}
              />
            </Card.Content>
          </Card>
          <Text style={styles.subTitle}>Records on {selectedDate}</Text>
          {selectedDateRecords.length === 0 ? (
            <Text style={styles.emptyState}>No records yet</Text>
          ) : (
            <FlatList
              data={selectedDateRecords}
              renderItem={renderRecordCard}
              keyExtractor={(item) => item.dtrId}
              contentContainerStyle={{ paddingBottom: 10 }}
            />
          )}
        </>
      ) : (
          <FlatList
            data={filteredRecords}
          renderItem={renderRecordCard}
          keyExtractor={(item) => item.dtrId}
          ListEmptyComponent={<Text style={styles.emptyState}>No records yet</Text>}
          ListFooterComponent={
            hasMore ? (
              <Button mode="outlined" onPress={() => fetchRecords({ reset: false })} style={styles.loadMore}>
                Load More
              </Button>
            ) : null
          }
        />
      )}

      <Modal visible={!!selectedRecord} transparent animationType="slide" onRequestClose={() => setSelectedRecord(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>DTR Detail</Text>
            <Text style={styles.modalInfo}>Date: {selectedRecord?.date || '-'}</Text>
            <Text style={styles.modalInfo}>Status: {selectedRecord?.status || '-'}</Text>
            {pairTimes(selectedRecord || {}).map((pair) => (
              <Text key={`modal-${pair.index}`} style={styles.modalInfo}>
                Time In {pair.index}: {pair.timeIn} -> Time Out {pair.index}: {pair.timeOut}
              </Text>
            ))}
            {selectedRecord?.status === 'pending' && (
              <Button mode="outlined" style={styles.deleteBtn} onPress={() => confirmDelete(selectedRecord)}>
                Delete Pending Record
              </Button>
            )}
            <Button mode="contained" onPress={() => setSelectedRecord(null)}>Close</Button>
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
    backgroundColor: '#f6f8fc',
    padding: 14,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1c2640',
    marginBottom: 10,
  },
  viewMode: {
    marginBottom: 8,
  },
  monthControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  monthLabel: {
    fontWeight: '700',
  },
  calendarCard: {
    borderRadius: 12,
    marginBottom: 10,
  },
  subTitle: {
    fontWeight: '700',
    marginBottom: 6,
  },
  card: {
    marginBottom: 10,
    borderRadius: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardDate: {
    fontSize: 15,
    fontWeight: '700',
  },
  pairRow: {
    color: '#4d5974',
    marginBottom: 3,
  },
  emptyState: {
    textAlign: 'center',
    color: '#667188',
    marginVertical: 18,
  },
  loadMore: {
    marginBottom: 12,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalInfo: {
    marginBottom: 4,
    color: '#4f5d77',
  },
  deleteBtn: {
    marginTop: 8,
    marginBottom: 8,
  },
});
import React, { useState, useEffect } from 'react';
import { Alert, Modal, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ActivityIndicator, Button, Card, Chip, SegmentedButtons, Snackbar, Text } from 'react-native-paper';
import { Calendar } from 'react-native-calendars';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { getApiBaseUrl } from '../utils/api';
const PAGE_SIZE = 40;
const LIST_PAGE_SIZE = 10;

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
  const maxLen = Math.max(inArr.length, outArr.length);
  return Array.from({ length: maxLen }).map((_, index) => ({
    index: index + 1,
    timeIn: inArr[index] || '-',
    timeOut: outArr[index] || '-',
  }));
};

const formatTimeValue = (value) => {
  if (!value || value === '-') return '--:--';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const getPairMinutes = (timeIn, timeOut) => {
  if (!timeIn || !timeOut || timeIn === '-' || timeOut === '-') return 0;
  const inMs = new Date(timeIn).getTime();
  const outMs = new Date(timeOut).getTime();
  if (Number.isNaN(inMs) || Number.isNaN(outMs) || outMs <= inMs) return 0;
  return Math.round((outMs - inMs) / 60000);
};

const formatMinutes = (mins) => {
  const safe = Math.max(0, mins || 0);
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h}h ${m}m`;
};

export default function HistoryScreen() {
  const [records, setRecords] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [viewMode, setViewMode] = useState('calendar');
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [listPage, setListPage] = useState(1);
  const [message, setMessage] = useState('');
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [reviewRows, setReviewRows] = useState([]);
  const [reviewOverallMinutes, setReviewOverallMinutes] = useState(0);

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
      params.set('month', explicitMonth);

      if (!reset && cursor) {
        params.set('cursor', cursor);
      }

      const apiBaseUrl = await getApiBaseUrl();
      const response = await axios.get(`${apiBaseUrl}/dtr/${user.userId}?${params.toString()}`, {
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
    fetchRecords({ reset: true, explicitMonth: month });
  }, [month]);

  useEffect(() => {
    setListPage(1);
  }, [month, selectedDate, records.length]);

  const changeMonth = (delta) => {
    const [year, mon] = month.split('-').map(Number);
    const d = new Date(year, mon - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const fetchAllMonthRecords = async (monthValue) => {
    const userData = await AsyncStorage.getItem('user');
    const user = JSON.parse(userData || '{}');
    const token = await AsyncStorage.getItem('token');

    if (!user?.userId || !token) {
      throw new Error('Login required');
    }

    const apiBaseUrl = await getApiBaseUrl();
    const collected = [];
    let nextCursor = null;

    do {
      const params = new URLSearchParams();
      params.set('limit', '500');
      params.set('month', monthValue);
      if (nextCursor) params.set('cursor', nextCursor);

      const response = await axios.get(`${apiBaseUrl}/dtr/${user.userId}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const payload = Array.isArray(response.data)
        ? { records: response.data, nextCursor: null }
        : response.data;

      const nextRecords = payload.records || [];
      collected.push(...nextRecords);
      nextCursor = payload.nextCursor || null;
    } while (nextCursor);

    return collected;
  };

  const formatStatus = (value) => {
    if (!value) return 'Pending';
    return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
  };

  const formatExcelDate = (dateValue) => {
    if (!dateValue) return '-';
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return String(dateValue);
    return d.toISOString().slice(0, 10);
  };

  const buildMonthlySheetRows = (monthRecords) => {
    const byDate = new Map();

    monthRecords.forEach((record) => {
      const dayKey = record.date || 'Unknown Date';
      const paired = pairTimes(record);
      const dayEntry = byDate.get(dayKey) || {
        date: dayKey,
        statuses: new Set(),
        timeIn: [],
        timeOut: [],
        totalMinutes: 0,
      };

      dayEntry.statuses.add(formatStatus(record.status));
      paired.forEach((pair) => {
        dayEntry.timeIn.push(formatTimeValue(pair.timeIn));
        dayEntry.timeOut.push(formatTimeValue(pair.timeOut));
        dayEntry.totalMinutes += getPairMinutes(pair.timeIn, pair.timeOut);
      });

      byDate.set(dayKey, dayEntry);
    });

    const dayRows = Array.from(byDate.values())
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((entry) => {
        const normalizedDate = formatExcelDate(entry.date);
        const dayNumber = /^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)
          ? String(Number(normalizedDate.slice(8, 10)))
          : '-';

        return {
          dayNumber,
          date: normalizedDate,
          timeIn: entry.timeIn.join(' | ') || '--:--',
          timeOut: entry.timeOut.join(' | ') || '--:--',
          status: Array.from(entry.statuses).join(', ') || 'Pending',
          totalHours: formatMinutes(entry.totalMinutes),
          totalMinutes: entry.totalMinutes,
        };
      });

    const monthTotalMinutes = dayRows.reduce((sum, entry) => sum + entry.totalMinutes, 0);

    return {
      rows: dayRows,
      monthTotalMinutes,
    };
  };

  const writeExcelFile = async (rows, monthLabel, monthTotalMinutes) => {
    const exportRows = [
      ...rows.map((row) => ({
        'Day #': row.dayNumber,
        Date: row.date,
        'Time In': row.timeIn,
        'Time Out': row.timeOut,
        Status: row.status,
        'Total Hours': row.totalHours,
      })),
      {
        'Day #': '',
        Date: 'MONTH TOTAL',
        'Time In': '',
        'Time Out': '',
        Status: '',
        'Total Hours': formatMinutes(monthTotalMinutes),
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Monthly DTR');

    const wbBase64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
    const outputPath = `${FileSystem.cacheDirectory}dtr-${monthLabel}.xlsx`;

    await FileSystem.writeAsStringAsync(outputPath, wbBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(outputPath, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: `Download DTR Excel (${monthLabel})`,
        UTI: 'org.openxmlformats.spreadsheetml.sheet',
      });
      setMessage(`Monthly Excel ready: ${monthLabel}`);
    } else {
      setMessage(`Excel generated at: ${outputPath}`);
    }
  };

  const openReviewBeforeDownload = async () => {
    try {
      setExporting(true);
      const monthRecords = await fetchAllMonthRecords(month);

      if (!monthRecords.length) {
        setMessage(`No records found for ${month}.`);
        return;
      }

      const { rows, monthTotalMinutes } = buildMonthlySheetRows(monthRecords);
      setReviewRows(rows);
      setReviewOverallMinutes(monthTotalMinutes);
      setReviewVisible(true);
    } catch (err) {
      setMessage(err.message || 'Failed to create monthly Excel file');
    } finally {
      setExporting(false);
    }
  };

  const confirmDownloadFromReview = async () => {
    try {
      setExporting(true);
      await writeExcelFile(reviewRows, month, reviewOverallMinutes);
      setReviewVisible(false);
    } catch (err) {
      setMessage(err.message || 'Failed to download monthly Excel');
    } finally {
      setExporting(false);
    }
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

  const filteredRecords = records.filter((record) => (record.date || '').startsWith(month));

  const selectedDateRecords = filteredRecords.filter((record) => record.date === selectedDate);
  const totalListPages = Math.max(1, Math.ceil(filteredRecords.length / LIST_PAGE_SIZE));
  const safeListPage = Math.min(listPage, totalListPages);
  const pagedListRecords = filteredRecords.slice((safeListPage - 1) * LIST_PAGE_SIZE, safeListPage * LIST_PAGE_SIZE);

  const dayMinutes = selectedDateRecords.reduce((acc, record) => {
    return acc + pairTimes(record).reduce((sum, pair) => sum + getPairMinutes(pair.timeIn, pair.timeOut), 0);
  }, 0);

  const weekMinutes = records
    .filter((record) => isSameWeek(record.date, selectedDate))
    .reduce((acc, record) => acc + pairTimes(record).reduce((sum, pair) => sum + getPairMinutes(pair.timeIn, pair.timeOut), 0), 0);

  const monthMinutes = records
    .filter((record) => (record.date || '').startsWith(month))
    .reduce((acc, record) => acc + pairTimes(record).reduce((sum, pair) => sum + getPairMinutes(pair.timeIn, pair.timeOut), 0), 0);

  const statusSummary = filteredRecords.reduce(
    (acc, item) => {
      const key = item.status || 'unknown';
      if (acc[key] === undefined) acc[key] = 0;
      acc[key] += 1;
      return acc;
    },
    { approved: 0, pending: 0, declined: 0 }
  );

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

  const openRecordDetail = async (item) => {
    setSelectedRecord(item);
    setDetailLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const apiBaseUrl = await getApiBaseUrl();
      const response = await axios.get(`${apiBaseUrl}/dtr/detail/${item.dtrId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSelectedRecord(response.data || item);
    } catch (err) {
      setMessage('Unable to fetch latest DTR details. Showing local copy.');
      setSelectedRecord(item);
    } finally {
      setDetailLoading(false);
    }
  };

  const renderRecordCard = (item) => (
    <TouchableOpacity key={item.dtrId} onPress={() => openRecordDetail(item)}>
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <Text style={styles.cardDate}>{item.date}</Text>
            <Chip compact style={{ backgroundColor: getStatusColor(item.status) }} textStyle={{ color: '#fff' }}>
              {item.status}
            </Chip>
          </View>
          <Text style={styles.sessionCount}>{pairTimes(item).length} session(s)</Text>
          {pairTimes(item).map((pair) => (
            <Text key={`${item.dtrId}-${pair.index}`} style={styles.pairRow}>
              #{pair.index}: {formatTimeValue(pair.timeIn)} {'->'} {formatTimeValue(pair.timeOut)}
            </Text>
          ))}
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRecords({ reset: true, explicitMonth: month });
    setRefreshing(false);
  };

  const handleDelete = async (record) => {
    try {
      const token = await AsyncStorage.getItem('token');
      const apiBaseUrl = await getApiBaseUrl();
      await axios.delete(`${apiBaseUrl}/dtr/${record.dtrId}`, {
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

  const persistRecordSessions = async (record, nextTimeIn, nextTimeOut, successMsg) => {
    try {
      const token = await AsyncStorage.getItem('token');
      const apiBaseUrl = await getApiBaseUrl();
      await axios.put(
        `${apiBaseUrl}/dtr/${record.dtrId}`,
        { timeIn: nextTimeIn, timeOut: nextTimeOut },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setRecords((prev) =>
        prev.map((r) => (r.dtrId === record.dtrId ? { ...r, timeIn: nextTimeIn, timeOut: nextTimeOut } : r))
      );

      setSelectedRecord((prev) => (prev ? { ...prev, timeIn: nextTimeIn, timeOut: nextTimeOut } : prev));
      setMessage(successMsg);
    } catch (err) {
      setMessage(err.response?.data?.error || 'Update failed');
    }
  };

  const deletePair = async (record, pairIdx) => {
    const nextTimeIn = [...(record.timeIn || [])];
    const nextTimeOut = [...(record.timeOut || [])];

    if (pairIdx < nextTimeIn.length) nextTimeIn.splice(pairIdx, 1);
    if (pairIdx < nextTimeOut.length) nextTimeOut.splice(pairIdx, 1);

    if (nextTimeIn.length === 0) {
      await handleDelete(record);
      return;
    }

    await persistRecordSessions(record, nextTimeIn, nextTimeOut, 'Session deleted');
  };

  const confirmDeletePair = (record, pairIdx) => {
    Alert.alert('Delete Session', `Delete Time In/Out #${pairIdx + 1} from this day?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deletePair(record, pairIdx) },
    ]);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.pageScrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
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

      <Card style={styles.overallTimeCard}>
        <Card.Content>
          <Text style={styles.overallTitle}>Overall Time Summary</Text>
          <View style={styles.overallGrid}>
            <View style={styles.overallItem}>
              <Text style={styles.overallLabel}>Day ({selectedDate})</Text>
              <Text style={styles.overallValue}>{formatMinutes(dayMinutes)}</Text>
            </View>
            <View style={styles.overallItem}>
              <Text style={styles.overallLabel}>Week</Text>
              <Text style={styles.overallValue}>{formatMinutes(weekMinutes)}</Text>
            </View>
            <View style={styles.overallItem}>
              <Text style={styles.overallLabel}>Month ({month})</Text>
              <Text style={styles.overallValue}>{formatMinutes(monthMinutes)}</Text>
            </View>
          </View>
        </Card.Content>
      </Card>

      <View style={styles.summaryRow}>
        <Chip compact icon="check-circle" style={styles.approvedChip}>Approved: {statusSummary.approved || 0}</Chip>
        <Chip compact icon="clock-outline" style={styles.pendingChip}>Pending: {statusSummary.pending || 0}</Chip>
        <Chip compact icon="close-circle" style={styles.declinedChip}>Declined: {statusSummary.declined || 0}</Chip>
      </View>

      <View style={styles.monthControls}>
        <Button compact onPress={() => changeMonth(-1)}>Prev</Button>
        <Text style={styles.monthLabel}>{month}</Text>
        <Button compact onPress={() => changeMonth(1)}>Next</Button>
      </View>

      <Button
        mode="contained"
        icon="download"
        style={styles.exportButton}
        loading={exporting}
        disabled={exporting}
        onPress={openReviewBeforeDownload}
      >
        {exporting ? 'Preparing Review...' : `Review ${month} Download`}
      </Button>

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
          {loading ? (
            <ActivityIndicator style={styles.loader} />
          ) : selectedDateRecords.length === 0 ? (
            <Text style={styles.emptyState}>No records yet</Text>
          ) : (
            <View style={styles.recordsWrap}>
              {selectedDateRecords.map((item) => renderRecordCard(item))}
            </View>
          )}
        </>
      ) : (
        <View style={styles.listSection}>
          {pagedListRecords.length === 0 ? (
            <Text style={styles.emptyState}>No records yet</Text>
          ) : (
            <View style={styles.recordsWrap}>
              {pagedListRecords.map((item) => renderRecordCard(item))}
            </View>
          )}
          <View style={styles.footerWrap}>
            <View style={styles.paginationRow}>
              <Button mode="outlined" disabled={safeListPage <= 1} onPress={() => setListPage((p) => Math.max(1, p - 1))}>
                Prev
              </Button>
              <Text style={styles.paginationText}>Page {safeListPage} / {totalListPages}</Text>
              <Button mode="outlined" disabled={safeListPage >= totalListPages} onPress={() => setListPage((p) => Math.min(totalListPages, p + 1))}>
                Next
              </Button>
            </View>
            {hasMore ? (
              <Button mode="contained" onPress={() => fetchRecords({ reset: false })} style={styles.loadMore}>
                Load More Data
              </Button>
            ) : null}
          </View>
        </View>
      )}
      </ScrollView>

      <Modal visible={!!selectedRecord} transparent animationType="slide" onRequestClose={() => setSelectedRecord(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView contentContainerStyle={styles.modalScrollContent}>
            <Text style={styles.modalTitle}>DTR Detail</Text>
            {detailLoading && <ActivityIndicator style={styles.loaderInline} />}
            <Text style={styles.modalInfo}>Date: {selectedRecord?.date || '-'}</Text>
            <Text style={styles.modalInfo}>Status: {selectedRecord?.status || '-'}</Text>
            {pairTimes(selectedRecord || {}).map((pair) => (
              <View key={`modal-${pair.index}`} style={styles.sessionBlock}>
                <Text style={styles.modalInfo}>Time In {pair.index}: {formatTimeValue(pair.timeIn)}</Text>
                <Text style={styles.modalInfo}>Time Out {pair.index}: {formatTimeValue(pair.timeOut)}</Text>
                {selectedRecord?.status === 'pending' && (
                  <View style={styles.sessionActionRow}>
                    <Button compact mode="outlined" onPress={() => confirmDeletePair(selectedRecord, pair.index - 1)}>
                      Delete Session {pair.index}
                    </Button>
                  </View>
                )}
              </View>
            ))}
            {selectedRecord?.status === 'pending' && (
              <Button mode="outlined" style={styles.deleteBtn} onPress={() => confirmDelete(selectedRecord)}>
                Delete Pending Record
              </Button>
            )}
            <Button mode="contained" onPress={() => setSelectedRecord(null)}>Close</Button>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={reviewVisible} transparent animationType="slide" onRequestClose={() => setReviewVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Review Monthly Download ({month})</Text>
            <Text style={styles.modalInfo}>Check the table before downloading.</Text>
            <ScrollView horizontal style={styles.reviewTableWrap}>
              <View>
                <View style={[styles.tableRow, styles.tableHeaderRow]}>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, styles.colDay]}>Day #</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, styles.colTime]}>Time In</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, styles.colTime]}>Time Out</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, styles.colStatus]}>Status</Text>
                  <Text style={[styles.tableCell, styles.tableHeaderCell, styles.colTotal]}>Total Hours</Text>
                </View>
                <ScrollView style={styles.reviewRowsWrap} contentContainerStyle={styles.reviewTableContent}>
                  {reviewRows.map((row, idx) => (
                    <View key={`review-${idx}`} style={styles.tableRow}>
                      <Text style={[styles.tableCell, styles.colDay]}>{row.dayNumber}</Text>
                      <Text style={[styles.tableCell, styles.colTime]}>{row.timeIn}</Text>
                      <Text style={[styles.tableCell, styles.colTime]}>{row.timeOut}</Text>
                      <Text style={[styles.tableCell, styles.colStatus]}>{row.status}</Text>
                      <Text style={[styles.tableCell, styles.colTotal]}>{row.totalHours}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            </ScrollView>
            <View style={styles.monthTotalBox}>
              <Text style={styles.monthTotalLabel}>Overall Total Hours ({month})</Text>
              <Text style={styles.monthTotalValue}>{formatMinutes(reviewOverallMinutes)}</Text>
            </View>
            <View style={styles.reviewActions}>
              <Button mode="outlined" onPress={() => setReviewVisible(false)}>
                Cancel
              </Button>
              <Button mode="contained" loading={exporting} disabled={exporting || reviewRows.length === 0} onPress={confirmDownloadFromReview}>
                Download Excel
              </Button>
            </View>
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
  pageScrollContent: {
    paddingBottom: 16,
  },
  overallTimeCard: {
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#f0f6ff',
  },
  overallTitle: {
    fontWeight: '700',
    fontSize: 15,
    color: '#1f3f64',
    marginBottom: 8,
  },
  overallGrid: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  overallItem: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d5e4f8',
    borderRadius: 10,
    padding: 8,
    minWidth: 120,
    flex: 1,
  },
  overallLabel: {
    color: '#60708c',
    fontSize: 11,
  },
  overallValue: {
    color: '#173b63',
    fontWeight: '700',
    fontSize: 16,
    marginTop: 3,
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
  exportButton: {
    marginBottom: 10,
    borderRadius: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  approvedChip: {
    backgroundColor: '#e7f6ec',
  },
  pendingChip: {
    backgroundColor: '#fff5de',
  },
  declinedChip: {
    backgroundColor: '#ffe9e8',
  },
  calendarCard: {
    borderRadius: 12,
    marginBottom: 10,
  },
  loader: {
    marginTop: 12,
  },
  subTitle: {
    fontWeight: '700',
    marginBottom: 6,
  },
  card: {
    marginBottom: 10,
    borderRadius: 12,
  },
  recordsWrap: {
    paddingBottom: 8,
  },
  listSection: {
    paddingBottom: 10,
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
  sessionCount: {
    color: '#60708c',
    marginBottom: 4,
    fontSize: 12,
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
  footerWrap: {
    gap: 8,
  },
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  paginationText: {
    color: '#60708c',
    fontWeight: '600',
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
    maxHeight: '85%',
  },
  modalScrollContent: {
    paddingBottom: 6,
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
  loaderInline: {
    marginBottom: 8,
  },
  sessionBlock: {
    borderWidth: 1,
    borderColor: '#e8edf6',
    borderRadius: 10,
    padding: 8,
    marginBottom: 8,
  },
  sessionActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  deleteBtn: {
    marginTop: 8,
    marginBottom: 8,
  },
  reviewTableWrap: {
    marginTop: 8,
  },
  reviewRowsWrap: {
    maxHeight: 280,
  },
  reviewTableContent: {
    paddingBottom: 8,
  },
  tableRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#e8edf6',
    borderTopWidth: 0,
    backgroundColor: '#fff',
  },
  tableHeaderRow: {
    borderTopWidth: 1,
    backgroundColor: '#edf3fd',
  },
  tableCell: {
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderColor: '#e8edf6',
    color: '#2d3b54',
    fontSize: 12,
  },
  tableHeaderCell: {
    fontWeight: '700',
    color: '#1b2f4f',
  },
  colDay: {
    width: 62,
  },
  colTime: {
    width: 150,
  },
  colStatus: {
    width: 130,
  },
  colTotal: {
    width: 110,
    borderRightWidth: 0,
  },
  monthTotalBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#f1f6ff',
    borderWidth: 1,
    borderColor: '#d7e5fb',
  },
  monthTotalLabel: {
    color: '#39557a',
    fontSize: 12,
  },
  monthTotalValue: {
    marginTop: 2,
    color: '#173b63',
    fontSize: 16,
    fontWeight: '700',
  },
  reviewActions: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
});
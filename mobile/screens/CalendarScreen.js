import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Text, Card, Button } from 'react-native-paper';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrl } from '../utils/api';

export default function CalendarScreen() {
  const [records, setRecords] = useState([]);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const getData = async () => {
      const userData = await AsyncStorage.getItem('user');
      setUser(JSON.parse(userData));
      const token = await AsyncStorage.getItem('token');
      const apiBaseUrl = await getApiBaseUrl();
      const response = await axios.get(`${apiBaseUrl}/dtr/${JSON.parse(userData).userId}`, { headers: { Authorization: `Bearer ${token}` } });
      setRecords(response.data);
    };
    getData();
  }, []);

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved': return 'green';
      case 'pending': return 'yellow';
      case 'declined': return 'red';
      default: return 'gray';
    }
  };

  const renderItem = ({ item }) => (
    <Card style={[styles.card, { borderColor: getStatusColor(item.status) }]}>
      <Card.Content>
        <Text>Date: {item.date}</Text>
        <Text>Time In: {item.timeIn.join(', ')}</Text>
        <Text>Time Out: {item.timeOut.join(', ')}</Text>
        <Text>Status: {item.status}</Text>
      </Card.Content>
    </Card>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>DTR Calendar</Text>
      <FlatList
        data={records}
        renderItem={renderItem}
        keyExtractor={(item) => item.dtrId}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 24, textAlign: 'center', marginBottom: 20 },
  card: { marginBottom: 10, borderWidth: 2 },
});
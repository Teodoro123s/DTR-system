import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, Alert } from 'react-native';
import { Text, Card, Button } from 'react-native-paper';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export default function HistoryScreen() {
  const [records, setRecords] = useState([]);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const getData = async () => {
      const userData = await AsyncStorage.getItem('user');
      setUser(JSON.parse(userData));
      const token = await AsyncStorage.getItem('token');
      const response = await axios.get(`${API_URL}/dtr/${JSON.parse(userData).userId}`, { headers: { Authorization: `Bearer ${token}` } });
      setRecords(response.data);
    };
    getData();
  }, []);

  const deleteRecord = async (dtrId) => {
    try {
      const token = await AsyncStorage.getItem('token');
      await axios.delete(`${API_URL}/dtr/${dtrId}`, { headers: { Authorization: `Bearer ${token}` } });
      setRecords(records.filter(r => r.dtrId !== dtrId));
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Delete failed');
    }
  };

  const confirmDelete = (dtrId) => {
    Alert.alert('Confirm', 'Delete this pending record?', [
      { text: 'Cancel' },
      { text: 'Delete', onPress: () => deleteRecord(dtrId) },
    ]);
  };

  const renderItem = ({ item }) => (
    <Card style={styles.card}>
      <Card.Content>
        <Text>Date: {item.date}</Text>
        <Text>Time In: {item.timeIn.join(', ')}</Text>
        <Text>Time Out: {item.timeOut.join(', ')}</Text>
        <Text>Status: {item.status}</Text>
        {item.status === 'pending' && (
          <Button onPress={() => confirmDelete(item.dtrId)}>Delete</Button>
        )}
      </Card.Content>
    </Card>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>DTR History</Text>
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
  card: { marginBottom: 10 },
});
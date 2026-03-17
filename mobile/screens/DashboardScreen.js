import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Button, Text, Card, Snackbar } from 'react-native-paper';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export default function DashboardScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const getUser = async () => {
      const userData = await AsyncStorage.getItem('user');
      setUser(JSON.parse(userData));
    };
    getUser();
  }, []);

  const handleTimeInOut = async (action) => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      await axios.post(`${API_URL}/dtr`, { action }, { headers: { Authorization: `Bearer ${token}` } });
      setMessage(`${action === 'timeIn' ? 'Timed In' : 'Timed Out'} successfully`);
    } catch (err) {
      setMessage(err.response?.data?.error || 'Action failed');
    }
    setLoading(false);
  };

  const confirmAction = (action) => {
    Alert.alert(
      'Confirm',
      `Are you sure you want to ${action}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'OK', onPress: () => handleTimeInOut(action) },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome, {user?.firstName} {user?.lastName}</Text>
      <Card style={styles.card}>
        <Card.Content>
          <Button mode="contained" onPress={() => confirmAction('timeIn')} loading={loading} style={styles.button}>
            Time In
          </Button>
          <Button mode="contained" onPress={() => confirmAction('timeOut')} loading={loading} style={styles.button}>
            Time Out
          </Button>
        </Card.Content>
      </Card>
      <Button mode="outlined" onPress={() => navigation.navigate('Calendar')} style={styles.button}>
        View Calendar
      </Button>
      <Button mode="outlined" onPress={() => navigation.navigate('History')} style={styles.button}>
        View History
      </Button>
      <Snackbar visible={!!message} onDismiss={() => setMessage('')} duration={3000}>
        {message}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 24, textAlign: 'center', marginBottom: 20 },
  card: { marginBottom: 20 },
  button: { marginVertical: 5 },
});
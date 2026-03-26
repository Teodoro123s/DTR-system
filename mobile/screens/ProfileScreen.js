import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Text, TextInput, Snackbar } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { getApiBaseUrl } from '../utils/api';

export default function ProfileScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [username, setUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadUser = async () => {
      const userData = await AsyncStorage.getItem('user');
      const parsed = JSON.parse(userData || '{}');
      setUser(parsed);
      setUsername(parsed?.username || '');
    };
    loadUser();
  }, []);

  const handleUpdateCredentials = async () => {
    if (user?.role !== 'student') {
      setMessage('Only students can update username/password here.');
      return;
    }

    if (!username && !newPassword) {
      setMessage('Enter at least one change.');
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const apiBaseUrl = await getApiBaseUrl();
      await axios.put(
        `${apiBaseUrl}/me/credentials`,
        { username, currentPassword, newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      await AsyncStorage.multiRemove(['token', 'user']);
      setMessage('Credentials updated. Please login again.');
      setTimeout(() => navigation.replace('Login'), 500);
    } catch (err) {
      setMessage(err.response?.data?.error || 'Failed to update credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.multiRemove(['token', 'user']);
    navigation.replace('Login');
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Profile</Text>
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.label}>First Name</Text>
            <Text style={styles.value}>{user?.firstName || '-'}</Text>
            <Text style={styles.label}>Last Name</Text>
            <Text style={styles.value}>{user?.lastName || '-'}</Text>
            <Text style={styles.label}>Role</Text>
            <Text style={styles.value}>{user?.role || '-'}</Text>
            <Text style={styles.helper}>First name and last name can only be edited by Admin.</Text>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Account Credentials</Text>
            <TextInput label="Username" value={username} onChangeText={setUsername} style={styles.input} />
            <TextInput
              label="Current Password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              style={styles.input}
            />
            <TextInput
              label="New Password"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              style={styles.input}
            />
            <Button mode="contained" onPress={handleUpdateCredentials} loading={loading}>
              Update Credentials
            </Button>
            <Button
              mode="text"
              style={styles.clearBtn}
              onPress={() => {
                setCurrentPassword('');
                setNewPassword('');
              }}
            >
              Clear Password Fields
            </Button>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Quick Access</Text>
            <View style={styles.quickRow}>
              <Button mode="outlined" onPress={() => navigation.navigate('History')}>My Records</Button>
              <Button mode="outlined" onPress={() => navigation.navigate('Notifications')}>Notifications</Button>
            </View>
          </Card.Content>
        </Card>

        <Button mode="outlined" onPress={handleLogout} style={styles.logoutButton}>
          Logout
        </Button>
      </ScrollView>

      <Snackbar visible={!!message} onDismiss={() => setMessage('')} duration={2600}>
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
  scrollContent: {
    paddingBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 10,
    color: '#1c2640',
  },
  card: {
    marginBottom: 12,
    borderRadius: 12,
  },
  label: {
    marginTop: 8,
    fontSize: 12,
    color: '#6b7488',
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1d2a45',
  },
  helper: {
    marginTop: 8,
    color: '#6b7488',
  },
  sectionTitle: {
    marginBottom: 8,
    fontSize: 16,
    fontWeight: '700',
  },
  input: {
    marginBottom: 8,
  },
  clearBtn: {
    marginTop: 4,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  logoutButton: {
    marginTop: 6,
  },
});

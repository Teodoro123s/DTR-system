import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import './AdminNotifications.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const PAGE_SIZE = 10;
const API_PAGE_SIZE = 10;

const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value === 'string') return new Date(value).getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  return 0;
};

const formatDate = (value) => {
  const ms = toMillis(value);
  if (!ms) return '';
  return new Date(ms).toLocaleString();
};

const getDateKey = (value) => {
  const ms = toMillis(value);
  if (!ms) return '';
  return new Date(ms).toISOString().slice(0, 10);
};

const truncateText = (value, maxLen) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1)).trim()}...`;
};

function AdminNotifications() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState(1);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setNotice('');

      const token = localStorage.getItem('token');
      const rawUser = localStorage.getItem('user');
      const user = JSON.parse(rawUser || '{}');
      const userId = String(user?.userId || '').trim();
      if (!token || !userId) {
        setItems([]);
        setNotice('Missing session. Please login again.');
        return;
      }

      const rows = [];
      let nextCursor = null;

      do {
        const params = new URLSearchParams();
        params.set('limit', String(API_PAGE_SIZE));
        if (nextCursor) params.set('cursor', nextCursor);

        const response = await axios.get(`${API_URL}/notifications/${userId}?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const payload = Array.isArray(response.data)
          ? { notifications: response.data, nextCursor: null }
          : response.data;

        rows.push(...(payload.notifications || []));
        nextCursor = payload.nextCursor || null;
      } while (nextCursor);

      const next = rows
        .filter((row) => row.isValid !== false)
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

      setItems(next);
      setPage(1);
    } catch (error) {
      setNotice(error.response?.data?.error || 'Unable to fetch notifications.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const timer = setInterval(fetchNotifications, 20000);
    return () => clearInterval(timer);
  }, [fetchNotifications]);

  const markRead = async (notificationId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.patch(
        `${API_URL}/notifications/${notificationId}/read`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setItems((prev) =>
        prev.map((row) =>
          row.notificationId === notificationId ? { ...row, read: true, isRead: true } : row
        )
      );
    } catch (error) {
      setNotice('Unable to mark notification as read.');
    }
  };

  const unreadCount = useMemo(
    () => items.filter((item) => !item.read && !item.isRead).length,
    [items]
  );

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="admin-notifications">
      <div className="admin-notifications-head">
        <div>
          <h3>Admin Notifications</h3>
          <p>Important activity updates for attendance records and student actions.</p>
        </div>
        <div className="admin-notifications-actions">
          <span className="admin-unread-chip">Unread: {unreadCount}</span>
          <button className="admin-refresh-btn" onClick={fetchNotifications} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {notice && <p className="admin-notice">{notice}</p>}

      <div className="admin-notification-list">
        {visible.map((item) => (
          <article key={item.notificationId} className={`admin-notification-item ${(item.read || item.isRead) ? 'read' : 'unread'}`}>
            {(() => {
              const createdAtLabel = formatDate(item.createdAt);
              const createdDateKey = getDateKey(item.createdAt);
              const relatedDate = String(item.relatedDate || '').trim();
              const showRelatedDate = relatedDate && relatedDate !== createdDateKey;
              return (
                <>
                  <div className="admin-notification-main">
                    <h4>{truncateText(item.title || 'Notification', 52)}</h4>
                    <p>{truncateText(item.message || 'No details available.', 120)}</p>
                    <div className="admin-notification-meta">
                      {createdAtLabel ? <span>{createdAtLabel}</span> : null}
                      {showRelatedDate ? <span>Date: {relatedDate}</span> : null}
                    </div>
                  </div>
                  {!item.read && !item.isRead ? (
                    <button className="admin-mark-read" onClick={() => markRead(item.notificationId)}>
                      Mark Read
                    </button>
                  ) : (
                    <span className="admin-read-badge">Read</span>
                  )}
                </>
              );
            })()}
          </article>
        ))}

        {!loading && visible.length === 0 ? (
          <p className="admin-empty">No admin notifications yet.</p>
        ) : null}
      </div>

      <div className="admin-pager">
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>Prev</button>
        <span>Page {safePage} / {totalPages}</span>
        <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}>Next</button>
      </div>
    </div>
  );
}

export default AdminNotifications;

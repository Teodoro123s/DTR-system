import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import './DTRManagement.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

function DTRManagement({ lockedStatus }) {
  const [records, setRecords] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeType, setNoticeType] = useState('info');
  const [editingRecord, setEditingRecord] = useState(null);
  const [editTimeIn, setEditTimeIn] = useState('');
  const [editTimeOut, setEditTimeOut] = useState('');
  
  // Custom Filters for neat report display
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedStatus, setSelectedStatus] = useState(lockedStatus || 'all');

  useEffect(() => {
    if (lockedStatus) setSelectedStatus(lockedStatus);
  }, [lockedStatus]);

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/students`, { headers: { Authorization: `Bearer ${token}` } });
      setStudents(response.data);
    } catch (err) {
      console.error('Error fetching students:', err);
      setNoticeType('error');
      setNotice('Unable to load students.');
    }
  };

  const fetchDTR = useCallback(async (studentId) => {
    if (!studentId) {
      setRecords([]);
      return;
    }
    try {
      setLoading(true);
      setSelectedStudent(studentId);
      const token = localStorage.getItem('token');
      
      const queryParams = new URLSearchParams({ limit: '1000' });
      if (selectedMonth) queryParams.set('month', selectedMonth);

      const response = await axios.get(`${API_URL}/dtr/${studentId}?${queryParams.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      setRecords(response.data.records || response.data || []);
    } catch (err) {
      console.error('Error fetching DTR records:', err);
      setNoticeType('error');
      setNotice('Failed to fetch DTR records.');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  const getShiftsForRecord = (rec) => {
    const inArr = rec.timeIn || [];
    const outArr = rec.timeOut || [];
    const stats = rec.shiftStatuses || [];
    const maxLen = Math.max(inArr.length, outArr.length);
    const output = [];
    for (let i = 0; i < maxLen; i++) {
      output.push({
        parentRecord: rec,
        dtrId: rec.dtrId,
        date: rec.date,
        index: i,
        timeIn: inArr[i] || null,
        timeOut: outArr[i] || null,
        status: stats[i] || rec.status || 'pending'
      });
    }
    return output;
  };

  const updateShiftStatus = async (shift, status) => {
    try {
      const rec = shift.parentRecord;
      const tLen = Math.max(rec.timeIn?.length || 0, rec.timeOut?.length || 0);
      const newStatuses = [...(rec.shiftStatuses || Array(tLen).fill(rec.status || 'pending'))];
      newStatuses[shift.index] = status;
      
      const token = localStorage.getItem('token');
      await axios.put(`${API_URL}/dtr/${rec.dtrId}`, { shiftStatuses: newStatuses }, { headers: { Authorization: `Bearer ${token}` } });
      setNoticeType('success');
      setNotice(`Shift ${shift.index + 1} marked as ${status}.`);
      if (selectedStudent) fetchDTR(selectedStudent);
    } catch (err) {
      console.error('Error updating status:', err);
      setNoticeType('error');
      setNotice('Failed to update status.');
    }
  };

  const deleteShift = async (shift) => {
    if (!window.confirm('Are you sure you want to delete this specific shift?')) return;
    try {
      const rec = shift.parentRecord;
      const newTimeIn = [...(rec.timeIn || [])];
      const newTimeOut = [...(rec.timeOut || [])];
      const newStatuses = [...(rec.shiftStatuses || Array(Math.max(newTimeIn.length, newTimeOut.length)).fill(rec.status || 'pending'))];
      
      newTimeIn.splice(shift.index, 1);
      newTimeOut.splice(shift.index, 1);
      newStatuses.splice(shift.index, 1);

      const token = localStorage.getItem('token');
      if (newTimeIn.length === 0 && newTimeOut.length === 0) {
        await axios.delete(`${API_URL}/dtr/${rec.dtrId}`, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        await axios.put(`${API_URL}/dtr/${rec.dtrId}`, { timeIn: newTimeIn, timeOut: newTimeOut, shiftStatuses: newStatuses }, { headers: { Authorization: `Bearer ${token}` } });
      }
      setNoticeType('success');
      setNotice('Shift deleted successfully.');
      if (selectedStudent) fetchDTR(selectedStudent);
    } catch (err) {
      console.error('Error deleting shift:', err);
      setNoticeType('error');
      setNotice('Failed to delete shift.');
    }
  };

  const startEditing = (shift) => {
    setEditingRecord(`${shift.dtrId}-${shift.index}`);
    if (shift.timeIn && shift.timeIn !== '-') {
      const d = new Date(shift.timeIn);
      setEditTimeIn(d.toTimeString().slice(0, 5));
    } else setEditTimeIn('');
    
    if (shift.timeOut && shift.timeOut !== '-') {
      const d = new Date(shift.timeOut);
      setEditTimeOut(d.toTimeString().slice(0, 5));
    } else setEditTimeOut('');
  };

  const saveEdit = async (shift) => {
    try {
      const rec = shift.parentRecord;
      const token = localStorage.getItem('token');
      const inDate = editTimeIn ? new Date(`${rec.date}T${editTimeIn}:00`) : null;
      const outDate = editTimeOut ? new Date(`${rec.date}T${editTimeOut}:00`) : null;
      
      const newTimeIn = [...(rec.timeIn || [])];
      const newTimeOut = [...(rec.timeOut || [])];
      
      if (inDate && !isNaN(inDate.getTime())) newTimeIn[shift.index] = inDate.toISOString();
      else if (!editTimeIn) newTimeIn[shift.index] = '-';

      if (outDate && !isNaN(outDate.getTime())) newTimeOut[shift.index] = outDate.toISOString();
      else if (!editTimeOut) newTimeOut[shift.index] = '-';

      await axios.put(`${API_URL}/dtr/${rec.dtrId}`, { timeIn: newTimeIn, timeOut: newTimeOut }, { headers: { Authorization: `Bearer ${token}` } });
      setEditingRecord(null);
      setNoticeType('success');
      setNotice('Shift time updated.');
      if (selectedStudent) fetchDTR(selectedStudent);
    } catch (err) {
      console.error('Error editing shift:', err);
      setNoticeType('error');
      setNotice('Failed to edit shift record.');
    }
  };

  const getStatusLabel = (status) => {
    const labels = {
      approved: 'Approved',
      declined: 'Declined',
      pending: 'Pending'
    };
    return labels[status] || status;
  };

  // Fetch DTR whenever month filter changes
  useEffect(() => {
    if (selectedStudent) {
      fetchDTR(selectedStudent);
    }
  }, [fetchDTR, selectedMonth, selectedStudent]);

  const onStudentChange = (e) => {
    setSelectedStudent(e.target.value);
    fetchDTR(e.target.value);
  };

  const flattenedShifts = records.flatMap((record) => getShiftsForRecord(record));
  const visibleShiftCount = flattenedShifts.filter((shift) => selectedStatus === 'all' || shift.status === selectedStatus).length;

  return (
    <div className="dtr-management">
      {notice && <p className={`notice-banner notice-${noticeType}`}>{notice}</p>}

      <div className="student-select-section">
        <div className="filter-grid">
          <div className="filter-field">
            <h3>Select Student</h3>
            <select value={selectedStudent} onChange={onStudentChange} className="student-select">
              <option value="">-- Choose a student --</option>
              {students.map(student => (
                <option key={student.userId} value={student.userId}>
                  {student.firstName} {student.lastName} ({student.username})
                </option>
              ))}
            </select>
          </div>
          <div className="filter-field">
            <h3>Filter by Month</h3>
            <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="student-select" />
          </div>
          {!lockedStatus && (
            <div className="filter-field">
              <h3>Filter by Status</h3>
              <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)} className="student-select">
                <option value="all">All Records</option>
                <option value="approved">Approved Only</option>
                <option value="pending">Pending Only</option>
                <option value="declined">Declined Only</option>
              </select>
            </div>
          )}
        </div>

        <button
          className="btn-refresh"
          onClick={() => selectedStudent && fetchDTR(selectedStudent)}
          disabled={!selectedStudent || loading}
        >
          {loading ? 'Refreshing...' : 'Refresh Results'}
        </button>
      </div>

      {selectedStudent && (
        <div className="dtr-records-section">
          <div className="records-header">
            <h3>Match Results</h3>
            <p>{visibleShiftCount} shift(s) match the active filters.</p>
          </div>

          {loading ? (
            <p className="loading">Loading records...</p>
          ) : records.length === 0 ? (
            <p className="empty">No active DTR records found matching these filters.</p>
          ) : (
            <div className="gc-list">
              {records.map(record => {
                const visibleShifts = getShiftsForRecord(record).filter(shift => 
                  selectedStatus === 'all' || shift.status === selectedStatus
                );
                
                if (visibleShifts.length === 0) return null;

                return (
                  <div key={record.dtrId} className="gc-day-group">
                    <div className="gc-day-header">
                      <span>{record.date}</span>
                    </div>
                    
                    <div className="gc-shifts">
                      {visibleShifts.map(shift => (
                      <div key={`${shift.dtrId}-${shift.index}`} className="gc-shift-item">
                        <div className="gc-shift-icon">
                          <span>Shift</span>
                        </div>
                        <div className="gc-shift-content">
                          <div className="gc-shift-title">Shift {shift.index + 1}</div>
                          <div className="gc-shift-details">
                            {shift.timeIn && shift.timeIn !== '-' ? new Date(shift.timeIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                            {' - '}
                            {shift.timeOut && shift.timeOut !== '-' ? new Date(shift.timeOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                          </div>
                        </div>

                        <div className="gc-shift-status">
                          <span className={`status-badge status-${shift.status}`}>
                            {getStatusLabel(shift.status)}
                          </span>
                        </div>

                        <div className="gc-shift-actions">
                          {editingRecord === `${shift.dtrId}-${shift.index}` ? (
                            <div className="edit-form flex-horizontal">
                              <input type="time" value={editTimeIn} onChange={e => setEditTimeIn(e.target.value)} />
                              <span>to</span>
                              <input type="time" value={editTimeOut} onChange={e => setEditTimeOut(e.target.value)} />
                              <button onClick={() => saveEdit(shift)} className="btn-approve" title="Save">Save</button>
                              <button onClick={() => setEditingRecord(null)} className="btn-delete" title="Cancel">Cancel</button>
                            </div>
                          ) : (
                            <>
                              <button onClick={() => updateShiftStatus(shift, 'approved')} className="btn-approve" title="Approve">Approve</button>
                              <button onClick={() => updateShiftStatus(shift, 'declined')} className="btn-decline" title="Decline">Decline</button>
                              <button onClick={() => startEditing(shift)} className="btn-edit" title="Edit">Edit</button>
                              <button onClick={() => deleteShift(shift)} className="btn-delete" title="Delete">Delete</button>
                            </>
                          )}
                        </div>
                      </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default DTRManagement;
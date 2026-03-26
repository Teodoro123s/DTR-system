import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import './DTRReports.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const API_PAGE_SIZE = 10;

const toMillis = (value) => {
  if (!value || value === '-') return 0;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

const toDateKey = (date) => date.toISOString().slice(0, 10);

const normalizeDateKey = (value) => {
  if (!value) return '';
  if (typeof value === 'string') {
    const direct = value.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return toDateKey(parsed);
};

const getHourLabel = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${String(parsed.getHours()).padStart(2, '0')}:00`;
};

const getDayHourLabels = () => Array.from({ length: 24 }).map((_, hour) => `${String(hour).padStart(2, '0')}:00`);

const getMonthDateKeys = (month) => {
  const [year, mon] = month.split('-').map(Number);
  const start = new Date(year, mon - 1, 1);
  const end = new Date(year, mon, 0);
  const days = end.getDate();
  return Array.from({ length: days }).map((_, idx) => {
    const d = new Date(start);
    d.setDate(start.getDate() + idx);
    return toDateKey(d);
  });
};

const getWeekStartDateKey = (dateKey) => {
  const normalized = normalizeDateKey(dateKey) || toDateKey(new Date());
  const date = new Date(`${normalized}T00:00:00`);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  return toDateKey(date);
};

const getWeekDateKeysFromDate = (dateKey) => {
  const startKey = getWeekStartDateKey(dateKey);
  const startDate = new Date(`${startKey}T00:00:00`);
  return Array.from({ length: 7 }).map((_, idx) => {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + idx);
    return toDateKey(d);
  });
};

const getWeekDisplayLabel = (dateKey) => {
  const d = new Date(`${dateKey}T00:00:00`);
  const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
  return `${weekday} ${dateKey.slice(5)}`;
};

const buildLinePath = (points, width, height, maxY, offsetX = 0, offsetY = 0) => {
  if (!points.length) return '';
  const safeMax = maxY <= 0 ? 1 : maxY;
  return points
    .map((pt, idx) => {
      const x = offsetX + (points.length === 1 ? width / 2 : (idx / (points.length - 1)) * width);
      const y = offsetY + (height - (pt.value / safeMax) * height);
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
};

const getYAxisScale = (maxValue) => {
  const safeMax = Math.max(0, Number(maxValue) || 0);
  const defaultTop = 4;

  // For low-frequency data, keep a predictable 0..4 axis.
  if (safeMax <= defaultTop) {
    const ticks = [4, 3, 2, 1, 0];
    return { top: defaultTop, ticks };
  }

  // For larger values, pick a "nice" step so labels are readable.
  const roughStep = safeMax / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / magnitude;

  let niceNormalized;
  if (normalized <= 1) niceNormalized = 1;
  else if (normalized <= 2) niceNormalized = 2;
  else if (normalized <= 5) niceNormalized = 5;
  else niceNormalized = 10;

  const step = niceNormalized * magnitude;
  const top = Math.ceil(safeMax / step) * step;
  const tickCount = Math.max(4, Math.round(top / step));
  const ticks = Array.from({ length: tickCount + 1 }, (_, idx) => top - idx * step);

  return { top, ticks };
};

function ReportLineChart({ title, points, color }) {
  const svgWidth = 640;
  const svgHeight = 210;
  const plotWidth = 580;
  const plotHeight = 150;
  const offsetX = 44;
  const offsetY = 24;

  const sourcePoints = points.length ? points : [{ label: '--', value: 0 }];
  // Keep line appearance in day mode where only one point exists.
  const plotPoints = sourcePoints.length === 1
    ? [{ ...sourcePoints[0], label: `${sourcePoints[0].label}-start` }, { ...sourcePoints[0], label: `${sourcePoints[0].label}-end` }]
    : sourcePoints;

  const dataPeak = Math.max(...sourcePoints.map((pt) => pt.value), 0);
  const yAxis = getYAxisScale(dataPeak);
  const yMax = yAxis.top;
  const linePath = buildLinePath(plotPoints, plotWidth, plotHeight, yMax, offsetX, offsetY);

  return (
    <div className="line-chart-card">
      <div className="line-chart-head">
        <h4>{title}</h4>
        <span>Peak: {dataPeak} shifts</span>
      </div>
      <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="line-chart-svg" role="img" aria-label={title}>
        <rect x={offsetX} y={offsetY} width={plotWidth} height={plotHeight} className="line-chart-bg" />
        {yAxis.ticks.map((tickValue) => {
          const y = offsetY + ((yMax - tickValue) / yMax) * plotHeight;
          return <line key={`grid-${tickValue}`} x1={offsetX} x2={offsetX + plotWidth} y1={y} y2={y} className="line-chart-grid" />;
        })}

        {plotPoints.map((pt, idx) => {
          const x = plotPoints.length === 1 ? offsetX + plotWidth / 2 : offsetX + (idx / (plotPoints.length - 1)) * plotWidth;
          const y = offsetY + (yMax ? plotHeight - (pt.value / yMax) * plotHeight : plotHeight);
          return <circle key={`${pt.label}-${idx}`} cx={x} cy={y} r="3" fill={color} />;
        })}

        <path d={`M ${offsetX} ${offsetY + plotHeight} L ${offsetX + plotWidth} ${offsetY + plotHeight}`} className="line-chart-axis" />
        <path d={`M ${offsetX} ${offsetY} L ${offsetX} ${offsetY + plotHeight}`} className="line-chart-axis" />

        {yAxis.ticks.map((tickValue) => {
          const y = offsetY + ((yMax - tickValue) / yMax) * plotHeight;
          return (
            <text
              key={`y-${tickValue}`}
              x={offsetX - 8}
              y={y + 3}
              textAnchor="end"
              className="line-chart-y-label"
            >
              {tickValue}
            </text>
          );
        })}

        <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" />

        {sourcePoints.length > 0 && (
          <>
            {sourcePoints.length === 1 ? (
              <text x={offsetX + plotWidth / 2} y={offsetY + plotHeight + 18} textAnchor="middle" className="line-chart-label">
                {sourcePoints[0].label}
              </text>
            ) : (
              <>
                <text x={offsetX} y={offsetY + plotHeight + 18} className="line-chart-label">{sourcePoints[0].label}</text>
                <text x={offsetX + plotWidth / 2} y={offsetY + plotHeight + 18} textAnchor="middle" className="line-chart-label">
                  {sourcePoints[Math.floor((sourcePoints.length - 1) / 2)].label}
                </text>
                <text x={offsetX + plotWidth} y={offsetY + plotHeight + 18} textAnchor="end" className="line-chart-label">
                  {sourcePoints[sourcePoints.length - 1].label}
                </text>
              </>
            )}
          </>
        )}
      </svg>
    </div>
  );
}

function DTRReports() {
  const [students, setStudents] = useState([]);
  const [rows, setRows] = useState([]);
  const [trendRows, setTrendRows] = useState([]);
  const [periodType, setPeriodType] = useState('month');
  const [mode, setMode] = useState('current');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');

  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const effectiveDate = mode === 'current' ? todayKey : selectedDate;
  const effectiveMonth = mode === 'current' ? todayKey.slice(0, 7) : month;
  const weekDateKeys = useMemo(() => getWeekDateKeysFromDate(effectiveDate), [effectiveDate]);

  useEffect(() => {
    const loadStudents = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API_URL}/students`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setStudents(response.data || []);
      } catch (error) {
        setNotice('Unable to load students for reports.');
      }
    };

    loadStudents();
  }, []);

  const fetchReports = useCallback(async () => {
    if (!students.length) {
      setRows([]);
      return;
    }

    try {
      setLoading(true);
      setNotice('');
      const token = localStorage.getItem('token');
      const requiredMonths = new Set();
      if (periodType === 'month') {
        requiredMonths.add(effectiveMonth);
      } else if (periodType === 'day') {
        requiredMonths.add(effectiveDate.slice(0, 7));
      } else {
        weekDateKeys.forEach((dateKey) => requiredMonths.add(dateKey.slice(0, 7)));
      }

      const fetchMonthRecords = async (studentId, monthKey) => {
        const records = [];
        let nextCursor = null;

        do {
          const params = new URLSearchParams({ limit: String(API_PAGE_SIZE) });
          params.set('month', monthKey);
          if (nextCursor) params.set('cursor', nextCursor);

          const response = await axios.get(`${API_URL}/dtr/${studentId}?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          const payload = Array.isArray(response.data)
            ? { records: response.data, nextCursor: null }
            : response.data;

          const pageRecords = payload.records || [];
          records.push(...pageRecords);
          nextCursor = payload.nextCursor || null;
        } while (nextCursor);

        return records;
      };

      const all = await Promise.all(
        students.map(async (student) => {
          const monthFetches = await Promise.all(
            Array.from(requiredMonths).map((monthKey) => fetchMonthRecords(student.userId, monthKey))
          );
          const seenRecordKeys = new Set();
          const records = monthFetches
            .flat()
            .filter((record) => {
              const key = record.dtrId || `${record.studentId || student.userId}-${record.date || ''}`;
              if (seenRecordKeys.has(key)) return false;
              seenRecordKeys.add(key);
              return true;
            });

          let scopedRecords = records;
          if (periodType === 'day') {
            scopedRecords = records.filter((record) => normalizeDateKey(record.date) === effectiveDate);
          } else if (periodType === 'week') {
            const weekSet = new Set(weekDateKeys);
            scopedRecords = records.filter((record) => weekSet.has(normalizeDateKey(record.date)));
          } else {
            scopedRecords = records.filter((record) => normalizeDateKey(record.date).startsWith(effectiveMonth));
          }

          let totalMinutes = 0;
          let approvedShifts = 0;
          let pendingShifts = 0;
          let declinedShifts = 0;
          const perDay = {};
          const perHour = {};

          scopedRecords.forEach((record) => {
            const dateKey = normalizeDateKey(record.date);
            if (!dateKey) return;

            const inArr = record.timeIn || [];
            const outArr = record.timeOut || [];
            const statuses = record.shiftStatuses || [];
            const maxLen = Math.max(inArr.length, outArr.length);

            if (!perDay[dateKey]) {
              perDay[dateKey] = { date: dateKey, minutes: 0, approved: 0, pending: 0, declined: 0 };
            }

            for (let i = 0; i < maxLen; i += 1) {
              const timeInMs = toMillis(inArr[i]);
              const timeOutMs = toMillis(outArr[i]);
              if (timeInMs && timeOutMs && timeOutMs > timeInMs) {
                const mins = Math.round((timeOutMs - timeInMs) / 60000);
                totalMinutes += mins;
                perDay[dateKey].minutes += mins;
              }

              const status = statuses[i] || record.status || 'pending';
              if (status === 'approved') {
                approvedShifts += 1;
                perDay[dateKey].approved += 1;
              } else if (status === 'declined') {
                declinedShifts += 1;
                perDay[dateKey].declined += 1;
              } else {
                pendingShifts += 1;
                perDay[dateKey].pending += 1;
              }

              if (periodType === 'day') {
                const hourLabel = getHourLabel(inArr[i]) || getHourLabel(outArr[i]);
                if (hourLabel) {
                  if (!perHour[hourLabel]) {
                    perHour[hourLabel] = { label: hourLabel, approved: 0, pending: 0, declined: 0 };
                  }
                  if (status === 'approved') perHour[hourLabel].approved += 1;
                  else if (status === 'declined') perHour[hourLabel].declined += 1;
                  else perHour[hourLabel].pending += 1;
                }
              }
            }
          });

          const totalShifts = approvedShifts + pendingShifts + declinedShifts;
          const progressPct = totalShifts ? Math.round((approvedShifts / totalShifts) * 100) : 0;

          return {
            userId: student.userId,
            studentName: `${student.firstName} ${student.lastName}`,
            username: student.username,
            recordsCount: scopedRecords.length,
            approvedShifts,
            pendingShifts,
            declinedShifts,
            totalMinutes,
            progressPct,
            perDay,
            perHour,
          };
        })
      );

      const periodKeys = periodType === 'month' ? getMonthDateKeys(effectiveMonth) : [];
      const mergedByDate = {};
      const mergedByHour = {};
      all.forEach((entry) => {
        Object.values(entry.perDay || {}).forEach((dayRow) => {
          if (!mergedByDate[dayRow.date]) {
            mergedByDate[dayRow.date] = { date: dayRow.date, minutes: 0, approved: 0, pending: 0, declined: 0 };
          }
          mergedByDate[dayRow.date].minutes += dayRow.minutes;
          mergedByDate[dayRow.date].approved += dayRow.approved;
          mergedByDate[dayRow.date].pending += dayRow.pending;
          mergedByDate[dayRow.date].declined += dayRow.declined;
        });

        Object.values(entry.perHour || {}).forEach((hourRow) => {
          const key = hourRow.label;
          if (!mergedByHour[key]) {
            mergedByHour[key] = { label: key, approved: 0, pending: 0, declined: 0 };
          }
          mergedByHour[key].approved += hourRow.approved;
          mergedByHour[key].pending += hourRow.pending;
          mergedByHour[key].declined += hourRow.declined;
        });
      });

      let mergedRows = [];
      if (periodType === 'day') {
        const hourLabels = getDayHourLabels();
        mergedRows = hourLabels.map((hourLabel) => {
          const row = mergedByHour[hourLabel] || {
            label: hourLabel,
            approved: 0,
            pending: 0,
            declined: 0,
          };
          return { ...row, label: hourLabel };
        });
      } else if (periodType === 'week') {
        mergedRows = weekDateKeys.map((dateKey) => {
          const row = mergedByDate[dateKey] || {
            date: dateKey,
            minutes: 0,
            approved: 0,
            pending: 0,
            declined: 0,
          };
          return {
            label: getWeekDisplayLabel(dateKey),
            ...row,
          };
        });
      } else {
        mergedRows = periodKeys.map((dateKey) => mergedByDate[dateKey] || {
          label: dateKey,
          minutes: 0,
          approved: 0,
          pending: 0,
          declined: 0,
        });
      }

      setTrendRows(mergedRows);
      setRows(all.map(({ perDay, perHour, ...rest }) => rest).sort((a, b) => b.totalMinutes - a.totalMinutes));
    } catch (error) {
      setNotice('Unable to generate reports for this period.');
    } finally {
      setLoading(false);
    }
  }, [students, periodType, effectiveMonth, effectiveDate, weekDateKeys]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.students += 1;
        acc.minutes += row.totalMinutes;
        acc.records += row.recordsCount;
        acc.approved += row.approvedShifts;
        acc.pending += row.pendingShifts;
        return acc;
      },
      { students: 0, minutes: 0, records: 0, approved: 0, pending: 0 }
    );
  }, [rows]);

  const formatMinutes = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  };

  const getRowLabel = (row) => {
    const baseLabel = row?.label || row?.date || '';
    if (!baseLabel) return '--';
    if (periodType === 'week') return baseLabel;
    if (periodType === 'day') return baseLabel;
    return baseLabel.includes('-') ? baseLabel.slice(5) : baseLabel;
  };

  const pendingSeries = trendRows.map((row) => ({
    label: getRowLabel(row),
    value: row?.pending || 0,
  }));

  const approvedSeries = trendRows.map((row) => ({
    label: getRowLabel(row),
    value: row?.approved || 0,
  }));

  return (
    <div className="reports-page">
      <div className="reports-controls">
        <div className="reports-filter-group">
          <label>Graph Period</label>
          <div className="reports-period-toggle" role="tablist" aria-label="Graph period filter">
            <button
              type="button"
              className={`period-btn ${periodType === 'month' ? 'active' : ''}`}
              onClick={() => setPeriodType('month')}
              aria-pressed={periodType === 'month'}
            >
              Month
            </button>
            <button
              type="button"
              className={`period-btn ${periodType === 'week' ? 'active' : ''}`}
              onClick={() => setPeriodType('week')}
              aria-pressed={periodType === 'week'}
            >
              Week
            </button>
            <button
              type="button"
              className={`period-btn ${periodType === 'day' ? 'active' : ''}`}
              onClick={() => setPeriodType('day')}
              aria-pressed={periodType === 'day'}
            >
              Day
            </button>
          </div>
        </div>

        <div className="reports-filter-group">
          <label>Range Mode</label>
          <div className="reports-period-toggle" role="tablist" aria-label="Range mode filter">
            <button
              type="button"
              className={`period-btn ${mode === 'current' ? 'active' : ''}`}
              onClick={() => setMode('current')}
              aria-pressed={mode === 'current'}
            >
              Current
            </button>
            <button
              type="button"
              className={`period-btn ${mode === 'custom' ? 'active' : ''}`}
              onClick={() => setMode('custom')}
              aria-pressed={mode === 'custom'}
            >
              Custom
            </button>
          </div>
        </div>

        {periodType === 'day' ? (
          <div className="reports-filter-group">
            <label>{mode === 'current' ? 'Today' : 'Date'}</label>
            <input
              type="date"
              value={mode === 'current' ? todayKey : selectedDate}
              disabled={mode === 'current'}
              onChange={(e) => {
                const nextDate = e.target.value;
                setSelectedDate(nextDate);
                if (nextDate) {
                  setMonth(nextDate.slice(0, 7));
                }
              }}
            />
          </div>
        ) : (
          <div className="reports-filter-group">
            <label>
              {periodType === 'week'
                ? mode === 'current' ? 'Current Week Anchor Date' : 'Week Anchor Date'
                : mode === 'current' ? 'Current Month' : 'Month'}
            </label>
            {periodType === 'week' ? (
              <input
                type="date"
                value={mode === 'current' ? todayKey : selectedDate}
                disabled={mode === 'current'}
                onChange={(e) => {
                  const nextDate = e.target.value;
                  setSelectedDate(nextDate);
                  if (nextDate) {
                    setMonth(nextDate.slice(0, 7));
                  }
                }}
              />
            ) : (
              <input
                type="month"
                value={mode === 'current' ? todayKey.slice(0, 7) : month}
                disabled={mode === 'current'}
                onChange={(e) => setMonth(e.target.value)}
              />
            )}
          </div>
        )}

        <button className="reports-refresh" onClick={fetchReports} disabled={loading}>
          {loading ? 'Generating...' : 'Refresh Report'}
        </button>
      </div>

      {notice && <p className="reports-notice">{notice}</p>}

      <div className="reports-summary-grid">
        <div className="summary-card">
          <p>Total Students</p>
          <h3>{totals.students}</h3>
        </div>
        <div className="summary-card">
          <p>Total Worked Time</p>
          <h3>{formatMinutes(totals.minutes)}</h3>
        </div>
        <div className="summary-card">
          <p>Approved Shifts</p>
          <h3>{totals.approved}</h3>
        </div>
        <div className="summary-card">
          <p>Pending Shifts</p>
          <h3>{totals.pending}</h3>
        </div>
      </div>

      <div className="reports-graph-grid">
        <ReportLineChart
          title={periodType === 'week' ? '7-Day Pending Shifts Trend' : periodType === 'day' ? 'Hourly Pending Shifts Trend' : 'Daily Pending Shifts Trend'}
          points={pendingSeries}
          color="#d6861d"
        />
        <ReportLineChart
          title={periodType === 'week' ? '7-Day Approved Shifts Trend' : periodType === 'day' ? 'Hourly Approved Shifts Trend' : 'Daily Approved Shifts Trend'}
          points={approvedSeries}
          color="#1f9a5b"
        />
      </div>

      <div className="reports-table-wrap">
        <table className="reports-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Username</th>
              <th>DTR Days</th>
              <th>Total Time</th>
              <th>Approved</th>
              <th>Pending</th>
              <th>Declined</th>
              <th>Progress</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userId}>
                <td>{row.studentName}</td>
                <td>{row.username}</td>
                <td>{row.recordsCount}</td>
                <td>{formatMinutes(row.totalMinutes)}</td>
                <td>{row.approvedShifts}</td>
                <td>{row.pendingShifts}</td>
                <td>{row.declinedShifts}</td>
                <td>
                  <div className="progress-cell">
                    <span>{row.progressPct}%</span>
                    <div className="progress-bar">
                      <div style={{ width: `${row.progressPct}%` }} />
                    </div>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan="8" className="reports-empty">No report data available for this period.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DTRReports;
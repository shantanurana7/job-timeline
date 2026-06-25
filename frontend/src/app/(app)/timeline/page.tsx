'use client';
import { useEffect, useState, useCallback } from 'react';
import { assignmentsApi, streamsApi } from '@/services';
import { Stream } from '@/types';
import Avatar from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/ui/Badges';
import { format, addDays, startOfWeek, isSameDay, differenceInMinutes, isWithinInterval } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar, Filter } from 'lucide-react';

const HOUR_HEIGHT = 60; // px per hour
const DAY_WIDTH = 160;  // px per day
const HOURS = Array.from({ length: 10 }, (_, i) => i + 8); // 8am–5pm

function getLeft(start: Date, dayStart: Date): number {
  const dayMs = 24 * 60 * 60 * 1000;
  const diff = start.getTime() - dayStart.getTime();
  return (diff / dayMs) * DAY_WIDTH;
}

function getWidth(start: Date, end: Date): number {
  const diffMins = differenceInMinutes(end, start);
  return Math.max((diffMins / (24 * 60)) * DAY_WIDTH, 24);
}

const PRIORITY_COLORS: Record<string, string> = {
  LOW: '#6b7280', MEDIUM: '#3b82f6', HIGH: '#f59e0b', CRITICAL: '#ef4444',
};

interface DesignerRow {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  workHoursStart?: string;
  workHoursEnd?: string;
  assignments: any[];
}

interface GanttBarProps {
  assignment: any;
  days: Date[];
}

function GanttBar({ assignment, days }: GanttBarProps) {
  const [tooltip, setTooltip] = useState(false);
  const start = new Date(assignment.startTime);
  const end = new Date(assignment.endTime);
  const job = assignment.job;

  // Find which day this assignment starts on
  const startDay = days.findIndex((d) => isSameDay(d, start));
  if (startDay < 0) return null;

  const diffDays = differenceInMinutes(end, start) / (24 * 60);
  const barWidth = Math.max(diffDays * DAY_WIDTH - 4, 24);
  const left = startDay * DAY_WIDTH + 4;
  const color = job?.isAtRisk ? '#ef4444' : (PRIORITY_COLORS[job?.priority] ?? '#6366f1');

  return (
    <div
      style={{
        position: 'absolute',
        left, top: 4,
        width: barWidth,
        height: 'calc(100% - 8px)',
        background: `${color}22`,
        border: `1.5px solid ${color}`,
        borderRadius: 6,
        padding: '0.25rem 0.5rem',
        cursor: 'pointer',
        transition: 'all 0.15s',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
      onMouseEnter={() => setTooltip(true)}
      onMouseLeave={() => setTooltip(false)}
    >
      <div style={{ fontSize: '0.7rem', fontWeight: 700, color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {job?.jobNumber}
      </div>
      {barWidth > 80 && (
        <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {job?.title}
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: 0,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius)', padding: '0.75rem 1rem',
          minWidth: 220, zIndex: 100, boxShadow: 'var(--shadow-lg)',
          pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: '0.375rem' }}>{job?.title}</div>
          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            {job?.status && <StatusBadge status={job.status} size="sm" />}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {format(start, 'MMM d, HH:mm')} → {format(end, 'MMM d, HH:mm')}
          </div>
          {job?.stream && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '0.375rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: job.stream.colorHex }} />
              {job.stream.name}
            </div>
          )}
          {job?.isAtRisk && (
            <div style={{ marginTop: '0.375rem', fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 600 }}>⚠ AT RISK</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TimelinePage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [designers, setDesigners] = useState<DesignerRow[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [filterStream, setFilterStream] = useState('');
  const [loading, setLoading] = useState(true);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = weekStart.toISOString();
      const to = addDays(weekStart, 7).toISOString();
      const res = await assignmentsApi.timeline(from, to, filterStream || undefined);
      setDesigners(res.data || []);
    } catch {
      setDesigners([]);
    } finally {
      setLoading(false);
    }
  }, [weekStart, filterStream]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { streamsApi.list().then((r) => setStreams(r.data || [])); }, []);

  const prevWeek = () => setWeekStart((d) => addDays(d, -7));
  const nextWeek = () => setWeekStart((d) => addDays(d, 7));
  const goToday = () => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  const totalWidth = days.length * DAY_WIDTH;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Timeline</h1>
          <p className="page-subtitle">Designer workload — {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d, yyyy')}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="form-control" style={{ width: 'auto', padding: '0.5rem 0.875rem' }}
            value={filterStream} onChange={(e) => setFilterStream(e.target.value)}>
            <option value="">All streams</option>
            {streams.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: '0.375rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={prevWeek}><ChevronLeft size={16} /></button>
            <button className="btn btn-secondary btn-sm" onClick={goToday}><Calendar size={14} /> Today</button>
            <button className="btn btn-secondary btn-sm" onClick={nextWeek}><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}>
        {/* Header: day columns */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', position: 'sticky', top: 60, zIndex: 10, background: 'var(--bg-elevated)' }}>
          {/* Designer label column */}
          <div style={{ width: 200, flexShrink: 0, padding: '0.75rem 1rem', borderRight: '1px solid var(--border)', display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Designer</span>
          </div>
          {/* Day headers */}
          <div style={{ overflow: 'hidden', flex: 1 }}>
            <div style={{ display: 'flex', width: totalWidth }}>
              {days.map((day) => {
                const isToday = isSameDay(day, today);
                return (
                  <div key={day.toISOString()} style={{
                    width: DAY_WIDTH, flexShrink: 0, padding: '0.625rem 0.5rem',
                    textAlign: 'center', borderRight: '1px solid var(--border)',
                  }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {format(day, 'EEE')}
                    </div>
                    <div style={{
                      fontSize: '1.1rem', fontWeight: 700, lineHeight: 1.2,
                      color: isToday ? 'var(--accent)' : 'var(--text-primary)',
                    }}>
                      {format(day, 'd')}
                    </div>
                    {isToday && (
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', margin: '0 auto', marginTop: '0.125rem' }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
              <div className="spinner spinner-lg" />
            </div>
          ) : designers.length === 0 ? (
            <div className="empty-state">
              <Calendar size={40} className="empty-state-icon" />
              <h3>No designers found</h3>
              <p>No designers have assignments in this time period</p>
            </div>
          ) : (
            designers.map((designer) => {
              const hasAssignments = designer.assignments?.length > 0;
              return (
                <div key={designer.id} style={{ display: 'flex', borderBottom: '1px solid var(--border)', minHeight: 72 }}>
                  {/* Designer info */}
                  <div style={{ width: 200, flexShrink: 0, padding: '0.75rem 1rem', borderRight: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    <Avatar firstName={designer.firstName} lastName={designer.lastName} avatarUrl={designer.avatarUrl} size="sm" />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.8375rem' }} className="truncate">
                        {designer.firstName} {designer.lastName}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {designer.assignments?.length || 0} job{designer.assignments?.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>

                  {/* Gantt row */}
                  <div style={{ flex: 1, position: 'relative', minWidth: totalWidth }}>
                    {/* Day grid lines */}
                    <div style={{ display: 'flex', position: 'absolute', inset: 0 }}>
                      {days.map((day) => {
                        const isToday = isSameDay(day, today);
                        return (
                          <div key={day.toISOString()} style={{
                            width: DAY_WIDTH, flexShrink: 0,
                            borderRight: '1px solid var(--border)',
                            background: isToday ? 'rgba(99,102,241,0.04)' : 'transparent',
                          }} />
                        );
                      })}
                    </div>

                    {/* Assignment bars */}
                    <div style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
                      {designer.assignments?.map((assignment: any) => (
                        <GanttBar key={assignment.id} assignment={assignment} days={days} />
                      ))}
                      {!hasAssignments && (
                        <div style={{
                          display: 'flex', alignItems: 'center', height: '100%',
                          paddingLeft: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem',
                        }}>
                          No assignments this week
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Legend */}
        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '1.25rem', alignItems: 'center', background: 'var(--bg-elevated)' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Priority:</span>
          {Object.entries(PRIORITY_COLORS).map(([p, c]) => (
            <div key={p} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: `${c}33`, border: `1.5px solid ${c}` }} />
              {p}
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8rem', color: 'var(--danger)' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: 'rgba(239,68,68,0.2)', border: '1.5px solid #ef4444' }} />
            AT RISK
          </div>
        </div>
      </div>
    </div>
  );
}

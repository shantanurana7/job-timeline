'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { assignmentsApi, streamsApi } from '@/services';
import { useAuthStore } from '@/stores/auth.store';
import { toast } from '@/stores/toast.store';
import type { Stream, JobStatus, JobPriority } from '@/types';
import Avatar from '@/components/ui/Avatar';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badges';
import {
  format,
  addDays,
  startOfWeek,
  isSameDay,
  differenceInMinutes,
  isAfter,
  isBefore,
  startOfDay,
  endOfDay,
} from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  AlertTriangle,
  ArrowRight,
  X,
  GripHorizontal,
  Clock,
  CalendarDays,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────
const DAY_WIDTH = 180;
const ROW_HEIGHT = 84;
const BAR_TOP = 14;
const BAR_HEIGHT = 48;
const WORK_HOURS_PER_DAY = 8;

// Day view
const HOUR_WIDTH = 80;
const DAY_VIEW_START = 8;
const DAY_VIEW_END = 20;
const DAY_HOURS = DAY_VIEW_END - DAY_VIEW_START;
const RESIZE_HANDLE_PX = 8;
const MIN_BAR_MINUTES = 30;

const PRIORITY_COLORS: Record<string, string> = {
  LOW: '#6b7280',
  MEDIUM: '#3b82f6',
  HIGH: '#f59e0b',
  URGENT: '#ef4444',
  CRITICAL: '#ef4444',
};

// ─── Local Types ──────────────────────────────────────────────────────────────
interface AssignmentJob {
  id: string;
  jobNumber: string;
  title: string;
  status: string;
  priority: string;
  isAtRisk: boolean;
  stream?: { name: string; colorHex: string };
}

interface Assignment {
  id: string;
  startTime: string;
  endTime: string;
  isPrimary: boolean;
  job: AssignmentJob;
}

interface DesignerRow {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  assignments: Assignment[];
}

interface ReassignModal {
  assignment: Assignment;
  fromDesigner: DesignerRow;
  toDesigner: DesignerRow;
}

interface BarPos { left: number; width: number }

type DragType = 'move' | 'resize-start' | 'resize-end';

interface BarDragState {
  type: DragType;
  startPointerX: number;
  origStartMs: number;
  origEndMs: number;
  deltaX: number;
  pointerId: number;
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function calcDailyHours(assignments: Assignment[], day: Date): number {
  const ws = new Date(day); ws.setHours(9, 0, 0, 0);
  const we = new Date(day); we.setHours(17, 0, 0, 0);
  let total = 0;
  for (const a of assignments) {
    const s = new Date(a.startTime);
    const e = new Date(a.endTime);
    const overlapStart = s > ws ? s : ws;
    const overlapEnd = e < we ? e : we;
    if (overlapStart < overlapEnd) total += differenceInMinutes(overlapEnd, overlapStart);
  }
  return total / 60;
}

function getMaxDailyUtilization(assignments: Assignment[], days: Date[]): number {
  if (!assignments.length) return 0;
  return Math.max(...days.map((d) => calcDailyHours(assignments, d) / WORK_HOURS_PER_DAY));
}

function calcTotalHours(assignments: Assignment[]): number {
  return assignments.reduce((sum, a) => {
    return sum + (new Date(a.endTime).getTime() - new Date(a.startTime).getTime()) / 3600000;
  }, 0);
}

// ─── Bar Positioning ──────────────────────────────────────────────────────────
function getBarPos(startTime: string, endTime: string, weekStart: Date): BarPos | null {
  const weekEnd = addDays(weekStart, 7);
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (isAfter(start, weekEnd) || isBefore(end, weekStart)) return null;
  const visStart = isBefore(start, weekStart) ? weekStart : start;
  const visEnd = isAfter(end, weekEnd) ? weekEnd : end;
  const daysFromStart = differenceInMinutes(visStart, weekStart) / (24 * 60);
  const durationDays = differenceInMinutes(visEnd, visStart) / (24 * 60);
  return {
    left: daysFromStart * DAY_WIDTH + 2,
    width: Math.max(durationDays * DAY_WIDTH - 4, 32),
  };
}

function getDayViewBarPos(
  startMs: number, endMs: number, dvStartMs: number, dvEndMs: number,
): BarPos | null {
  if (startMs >= dvEndMs || endMs <= dvStartMs) return null;
  const visStartMs = Math.max(startMs, dvStartMs);
  const visEndMs = Math.min(endMs, dvEndMs);
  const minsFromStart = (visStartMs - dvStartMs) / 60000;
  const durMins = (visEndMs - visStartMs) / 60000;
  return {
    left: (minsFromStart / 60) * HOUR_WIDTH + 2,
    width: Math.max((durMins / 60) * HOUR_WIDTH - 4, 20),
  };
}

// ─── GanttBar Component ───────────────────────────────────────────────────────
interface GanttBarProps {
  assignment: Assignment;
  viewMode: 'day' | 'week';
  weekStart: Date;
  dvStartMs: number;
  dvEndMs: number;
  canInteract: boolean;
  isSaving: boolean;
  isDraggingWeek: boolean;
  onDragCommit: (newStartMs: number, newEndMs: number) => void;
  onWeekDragStart: () => void;
  onWeekDragEnd: () => void;
  onJobClick: (assignment: Assignment) => void;
}

function GanttBar({
  assignment, viewMode, weekStart, dvStartMs, dvEndMs,
  canInteract, isSaving, isDraggingWeek,
  onDragCommit, onWeekDragStart, onWeekDragEnd, onJobClick,
}: GanttBarProps) {
  const [barDrag, setBarDrag] = useState<BarDragState | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [cursor, setCursor] = useState<string>('pointer');

  const job = assignment.job;
  const origStartMs = new Date(assignment.startTime).getTime();
  const origEndMs = new Date(assignment.endTime).getTime();

  // Compute visual display times (shift during active drag)
  let displayStartMs = origStartMs;
  let displayEndMs = origEndMs;

  if (barDrag && viewMode === 'day') {
    const deltaMs = (barDrag.deltaX / HOUR_WIDTH) * 3600000;
    const dur = barDrag.origEndMs - barDrag.origStartMs;
    if (barDrag.type === 'move') {
      displayStartMs = Math.max(dvStartMs, Math.min(barDrag.origStartMs + deltaMs, dvEndMs - dur));
      displayEndMs = displayStartMs + dur;
    } else if (barDrag.type === 'resize-start') {
      displayStartMs = Math.max(dvStartMs, Math.min(barDrag.origStartMs + deltaMs, barDrag.origEndMs - MIN_BAR_MINUTES * 60000));
      displayEndMs = barDrag.origEndMs;
    } else {
      displayEndMs = Math.min(dvEndMs, Math.max(barDrag.origEndMs + deltaMs, barDrag.origStartMs + MIN_BAR_MINUTES * 60000));
      displayStartMs = barDrag.origStartMs;
    }
  }

  const pos = viewMode === 'day'
    ? getDayViewBarPos(displayStartMs, displayEndMs, dvStartMs, dvEndMs)
    : getBarPos(assignment.startTime, assignment.endTime, weekStart);

  if (!pos) return null;

  const color = job.isAtRisk ? '#ef4444' : (PRIORITY_COLORS[job.priority] ?? '#6366f1');
  const isPointerDragging = barDrag !== null;

  function calcFinalTimes(clientX: number, drag: BarDragState) {
    const deltaMs = ((clientX - drag.startPointerX) / HOUR_WIDTH) * 3600000;
    const dur = drag.origEndMs - drag.origStartMs;
    let newStartMs = drag.origStartMs;
    let newEndMs = drag.origEndMs;
    if (drag.type === 'move') {
      newStartMs = Math.max(dvStartMs, Math.min(drag.origStartMs + deltaMs, dvEndMs - dur));
      newEndMs = newStartMs + dur;
    } else if (drag.type === 'resize-start') {
      newStartMs = Math.max(dvStartMs, Math.min(drag.origStartMs + deltaMs, drag.origEndMs - MIN_BAR_MINUTES * 60000));
    } else {
      newEndMs = Math.min(dvEndMs, Math.max(drag.origEndMs + deltaMs, drag.origStartMs + MIN_BAR_MINUTES * 60000));
    }
    return { newStartMs, newEndMs };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!canInteract || viewMode !== 'day' || isSaving) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const w = rect.width;

    let type: DragType = 'move';
    if (relX <= RESIZE_HANDLE_PX) type = 'resize-start';
    else if (relX >= w - RESIZE_HANDLE_PX) type = 'resize-end';

    // Only prevent default for edge-resize; allow browser drag for center move
    if (type !== 'move') {
      e.preventDefault();
      e.stopPropagation();
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setBarDrag({ type, startPointerX: e.clientX, origStartMs, origEndMs, deltaX: 0, pointerId: e.pointerId });
    setCursor(type === 'move' ? 'grabbing' : 'ew-resize');
    setShowTooltip(false);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!barDrag || e.pointerId !== barDrag.pointerId) return;
    setBarDrag((prev) => prev ? { ...prev, deltaX: e.clientX - prev.startPointerX } : null);
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!barDrag || e.pointerId !== barDrag.pointerId) return;
    const { newStartMs, newEndMs } = calcFinalTimes(e.clientX, barDrag);
    setBarDrag(null);
    setCursor(canInteract && viewMode === 'day' ? 'grab' : 'pointer');

    // Ignore sub-3-minute jitter
    if (Math.abs(newStartMs - origStartMs) < 3 * 60000 && Math.abs(newEndMs - origEndMs) < 3 * 60000) return;
    onDragCommit(newStartMs, newEndMs);
  }

  function handlePointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    if (barDrag && e.pointerId === barDrag.pointerId) {
      setBarDrag(null);
      setCursor(canInteract && viewMode === 'day' ? 'grab' : 'pointer');
    }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!canInteract || viewMode !== 'day' || isSaving || isPointerDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const w = rect.width;
    setCursor(relX <= RESIZE_HANDLE_PX || relX >= w - RESIZE_HANDLE_PX ? 'ew-resize' : 'grab');
  }

  return (
    <div
      draggable={canInteract && !isPointerDragging}
      className={[
        'gantt-bar',
        isPointerDragging || isDraggingWeek ? 'gantt-bar--dragging' : '',
        job.isAtRisk ? 'gantt-bar--atrisk' : '',
      ].filter(Boolean).join(' ')}
      style={{
        left: pos.left,
        width: pos.width,
        top: BAR_TOP,
        height: BAR_HEIGHT,
        background: `${color}1f`,
        border: `1.5px solid ${color}`,
        color,
        cursor: isSaving ? 'wait' : cursor,
        opacity: isSaving ? 0.5 : 1,
        padding: '0 0.375rem',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => {
        if (!isPointerDragging && !isSaving) {
          setShowTooltip(true);
          if (canInteract && viewMode === 'day') setCursor('grab');
        }
      }}
      onMouseLeave={() => {
        setShowTooltip(false);
        if (!isPointerDragging) setCursor('pointer');
      }}
      onClick={() => { if (!isPointerDragging && !isSaving) onJobClick(assignment); }}
      onDragStart={(e) => {
        if (isSaving) { e.preventDefault(); return; }
        if (barDrag) { setBarDrag(null); setCursor(canInteract && viewMode === 'day' ? 'grab' : 'pointer'); }
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', assignment.id);
        onWeekDragStart();
        setShowTooltip(false);
      }}
      onDragEnd={() => { onWeekDragEnd(); }}
    >
      {/* Resize handle indicators — day view only */}
      {canInteract && viewMode === 'day' && !isSaving && pos.width > 40 && (
        <>
          <div style={{
            position: 'absolute', left: 3, top: '50%', transform: 'translateY(-50%)',
            width: 3, height: 14, borderRadius: 2, background: 'currentColor', opacity: 0.4, pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', right: 3, top: '50%', transform: 'translateY(-50%)',
            width: 3, height: 14, borderRadius: 2, background: 'currentColor', opacity: 0.4, pointerEvents: 'none',
          }} />
        </>
      )}

      {/* Week-mode drag handle */}
      {canInteract && viewMode === 'week' && (
        <span className="gantt-bar-handle"><GripHorizontal size={10} /></span>
      )}

      {/* Saving spinner */}
      {isSaving ? (
        <div className="gantt-bar-content" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
        </div>
      ) : (
        <div className="gantt-bar-content" style={{ paddingLeft: canInteract && viewMode === 'day' && pos.width > 40 ? 6 : 0 }}>
          <span className="gantt-bar-number">{job.jobNumber}</span>
          {pos.width > 90 && <span className="gantt-bar-title">{job.title}</span>}
        </div>
      )}

      {/* Tooltip */}
      {showTooltip && !isPointerDragging && !isDraggingWeek && !isSaving && (
        <div className="gantt-tooltip">
          <div className="gantt-tooltip-title">{job.title}</div>
          <div className="gantt-tooltip-meta">
            <StatusBadge status={job.status as JobStatus} size="sm" />
          </div>
          <div className="gantt-tooltip-dates">
            {viewMode === 'day'
              ? `${format(new Date(displayStartMs), 'h:mm a')} → ${format(new Date(displayEndMs), 'h:mm a')}`
              : `${format(new Date(assignment.startTime), 'MMM d')} → ${format(new Date(assignment.endTime), 'MMM d, yyyy')}`
            }
          </div>
          {job.stream && (
            <div className="gantt-tooltip-stream">
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: job.stream.colorHex, flexShrink: 0, display: 'inline-block' }} />
              {job.stream.name}
            </div>
          )}
          {job.isAtRisk && <div className="gantt-tooltip-risk"><AlertTriangle size={11} /> AT RISK</div>}
          {canInteract && viewMode === 'day' && (
            <div className="gantt-tooltip-hint">
              <GripHorizontal size={11} />
              Drag edges to resize · center to move
            </div>
          )}
          {canInteract && viewMode === 'week' && (
            <div className="gantt-tooltip-hint">
              <GripHorizontal size={11} />
              Drag to reassign · Click to view
            </div>
          )}
          {!canInteract && <div className="gantt-tooltip-hint">Click to view details</div>}
        </div>
      )}
    </div>
  );
}

// ─── Job Quick Modal ──────────────────────────────────────────────────────────
function JobQuickModal({ assignment, onClose }: { assignment: Assignment; onClose: () => void }) {
  const job = assignment.job;
  const color = PRIORITY_COLORS[job.priority] ?? '#6366f1';

  return (
    <div
      className="reassign-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="reassign-card" style={{ maxWidth: 400 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.125rem' }}>
          <div style={{ minWidth: 0, flex: 1, paddingRight: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, lineHeight: 1.3 }}>{job.title}</h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{job.jobNumber}</span>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ flexShrink: 0, marginTop: '-0.25rem' }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
          <StatusBadge status={job.status as JobStatus} size="sm" />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: `${color}22`, color, borderRadius: 'var(--radius-sm)', padding: '0.2rem 0.5rem', fontSize: '0.75rem', fontWeight: 600 }}>
            {job.priority}
          </span>
          {job.isAtRisk && (
            <span style={{ color: 'var(--danger)', fontSize: '0.75rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              <AlertTriangle size={12} /> At Risk
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          <div>
            <span style={{ color: 'var(--text-muted)', marginRight: '0.5rem', fontWeight: 600 }}>Start:</span>
            {format(new Date(assignment.startTime), 'MMM d, yyyy h:mm a')}
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)', marginRight: '0.5rem', fontWeight: 600 }}>End:</span>
            {format(new Date(assignment.endTime), 'MMM d, yyyy h:mm a')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
          <a href={`/jobs/${job.id}`} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">
            View Job
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Reassignment Modal ───────────────────────────────────────────────────────
function ReassignmentModal({
  modal, onConfirm, onCancel,
}: { modal: ReassignModal; onConfirm: (reason: string) => Promise<boolean>; onCancel: () => void }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const job = modal.assignment.job;

  async function handleConfirm() {
    setLoading(true);
    const ok = await onConfirm(reason);
    if (!ok) setLoading(false);
  }

  return (
    <div className="reassign-overlay" onClick={(e) => { if (e.target === e.currentTarget && !loading) onCancel(); }}>
      <div className="reassign-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 700 }}>Reassign Designer</h3>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              The job keeps its schedule — only the designer changes.
            </p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onCancel} disabled={loading} style={{ flexShrink: 0, marginTop: '-0.25rem' }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ background: 'var(--bg-hover)', borderRadius: 'var(--radius)', padding: '0.875rem 1rem', marginBottom: '1.25rem' }}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.2rem' }}>{job.title}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>{job.jobNumber}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.375rem' }}>
            {format(new Date(modal.assignment.startTime), 'MMM d, yyyy h:mm a')} → {format(new Date(modal.assignment.endTime), 'MMM d, yyyy h:mm a')}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '1.25rem' }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', fontWeight: 600 }}>From</div>
            <Avatar firstName={modal.fromDesigner.firstName} lastName={modal.fromDesigner.lastName} avatarUrl={modal.fromDesigner.avatarUrl} size="md" />
            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginTop: '0.375rem' }}>{modal.fromDesigner.firstName} {modal.fromDesigner.lastName}</div>
          </div>
          <ArrowRight size={20} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', fontWeight: 700 }}>To</div>
            <Avatar firstName={modal.toDesigner.firstName} lastName={modal.toDesigner.lastName} avatarUrl={modal.toDesigner.avatarUrl} size="md" />
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent)', marginTop: '0.375rem' }}>{modal.toDesigner.firstName} {modal.toDesigner.lastName}</div>
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
          <label className="form-label">Reason <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
          <textarea
            className="form-control"
            placeholder="Why is this job being reassigned?"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            style={{ resize: 'vertical', minHeight: '60px' }}
            disabled={loading}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onCancel} disabled={loading}>Cancel</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={loading}>
            {loading && <span className="spinner" style={{ width: 15, height: 15, marginRight: '0.375rem' }} />}
            {loading ? 'Reassigning…' : 'Confirm Reassignment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TimelinePage() {
  const user = useAuthStore((s) => s.user);
  const canInteract = user?.role === 'ADMIN' || user?.role === 'WORKFLOW_ADMIN';
  const isDesignerView = user?.role === 'DESIGNER';

  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [dayDate, setDayDate] = useState(() => startOfDay(new Date()));
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [designers, setDesigners] = useState<DesignerRow[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [filterStream, setFilterStream] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Week DnD state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [reassignModal, setReassignModal] = useState<ReassignModal | null>(null);
  const [clickedAssignment, setClickedAssignment] = useState<Assignment | null>(null);
  const draggedRef = useRef<{ assignment: Assignment; fromDesigner: DesignerRow } | null>(null);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  // Day view bounds
  const dvStart = new Date(dayDate); dvStart.setHours(DAY_VIEW_START, 0, 0, 0);
  const dvEnd = new Date(dayDate); dvEnd.setHours(DAY_VIEW_END, 0, 0, 0);
  const dvStartMs = dvStart.getTime();
  const dvEndMs = dvEnd.getTime();
  const hours = Array.from({ length: DAY_HOURS }, (_, i) => DAY_VIEW_START + i);

  const loadFn = useCallback(async () => {
    setLoading(true);
    try {
      let from: string, to: string;
      if (viewMode === 'day') {
        from = startOfDay(dayDate).toISOString();
        to = endOfDay(dayDate).toISOString();
      } else {
        from = weekStart.toISOString();
        to = addDays(weekStart, 7).toISOString();
      }
      const res = await assignmentsApi.timeline(from, to, filterStream || undefined);
      setDesigners((res.data as DesignerRow[]) || []);
    } catch {
      setDesigners([]);
    } finally {
      setLoading(false);
    }
  }, [viewMode, dayDate, weekStart, filterStream]);

  // Keep a stable ref to always-current loadFn so closures can call it
  const loadRef = useRef(loadFn);
  loadRef.current = loadFn;

  useEffect(() => { loadFn(); }, [loadFn]);
  useEffect(() => { streamsApi.list().then((r: any) => setStreams(r.data || [])); }, []);

  // ── Day view drag commit ───────────────────────────────────────────────────
  async function handleDragCommit(
    assignment: Assignment, designer: DesignerRow, newStartMs: number, newEndMs: number,
  ) {
    setSavingId(assignment.id);
    try {
      await assignmentsApi.reschedule(assignment.id, {
        designerId: designer.id,
        startTime: new Date(newStartMs).toISOString(),
        endTime: new Date(newEndMs).toISOString(),
      });
      toast.success('Schedule updated');
      await loadRef.current();
    } catch {
      toast.error('Failed to update schedule — times reverted');
      await loadRef.current();
    } finally {
      setSavingId(null);
    }
  }

  // ── Week DnD handlers ─────────────────────────────────────────────────────
  function handleBarDragStart(assignment: Assignment, designer: DesignerRow) {
    draggedRef.current = { assignment, fromDesigner: designer };
    setDraggingId(assignment.id);
  }

  function handleBarDragEnd() {
    draggedRef.current = null;
    setDraggingId(null);
    setDropTargetId(null);
  }

  function handleRowDragOver(e: React.DragEvent, designerId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropTargetId !== designerId) setDropTargetId(designerId);
  }

  function handleRowDrop(toDesigner: DesignerRow) {
    const drag = draggedRef.current;
    setDropTargetId(null);
    if (!drag || drag.fromDesigner.id === toDesigner.id) return;
    setReassignModal({ assignment: drag.assignment, fromDesigner: drag.fromDesigner, toDesigner });
  }

  async function handleConfirmReassign(reason: string): Promise<boolean> {
    if (!reassignModal) return false;
    const { assignment, toDesigner } = reassignModal;
    try {
      await assignmentsApi.unassign(assignment.id, reason || undefined);
      await assignmentsApi.assign({
        jobId: assignment.job.id,
        designerId: toDesigner.id,
        isPrimary: assignment.isPrimary,
        startTime: assignment.startTime,
        endTime: assignment.endTime,
      });
      toast.success(`Reassigned to ${toDesigner.firstName} ${toDesigner.lastName}`);
      setReassignModal(null);
      draggedRef.current = null;
      loadRef.current();
      return true;
    } catch {
      toast.error('Reassignment failed — check the job status and try again.');
      return false;
    }
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  function navPrev() {
    if (viewMode === 'day') setDayDate((d) => addDays(d, -1));
    else setWeekStart((d) => addDays(d, -7));
  }
  function navNext() {
    if (viewMode === 'day') setDayDate((d) => addDays(d, 1));
    else setWeekStart((d) => addDays(d, 7));
  }
  function navToday() {
    if (viewMode === 'day') setDayDate(startOfDay(new Date()));
    else setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
  }

  const headerLabel = viewMode === 'day'
    ? format(dayDate, 'EEEE, MMMM d, yyyy')
    : `${format(weekStart, 'MMM d')} – ${format(addDays(weekStart, 6), 'MMM d, yyyy')}`;

  const isToday = viewMode === 'day' && isSameDay(dayDate, today);
  const totalWidth = viewMode === 'day' ? DAY_HOURS * HOUR_WIDTH : days.length * DAY_WIDTH;

  return (
    <div>
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{isDesignerView ? 'My Schedule' : 'Timeline'}</h1>
          <p className="page-subtitle">
            {isDesignerView ? 'Your assigned jobs' : 'Designer workload'} — {headerLabel}
            {isToday && (
              <span style={{ marginLeft: '0.5rem', fontSize: '0.68rem', fontWeight: 700, background: 'var(--accent)', color: 'white', padding: '0.1rem 0.45rem', borderRadius: '999px', letterSpacing: '0.04em' }}>
                TODAY
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Stream filter */}
          {!isDesignerView && user?.role !== 'WORKFLOW_ADMIN' && (
            <select
              className="form-control"
              style={{ width: 'auto', padding: '0.5rem 0.875rem' }}
              value={filterStream}
              onChange={(e) => setFilterStream(e.target.value)}
            >
              <option value="">All streams</option>
              {streams.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}

          {/* View mode toggle (admin/wfadmin only) */}
          {!isDesignerView && (
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
              <button
                className={`btn btn-sm${viewMode === 'day' ? ' btn-primary' : ' btn-ghost'}`}
                onClick={() => setViewMode('day')}
                style={{ borderRadius: 0, gap: '0.375rem', borderRight: '1px solid var(--border)' }}
              >
                <Clock size={13} /> Day
              </button>
              <button
                className={`btn btn-sm${viewMode === 'week' ? ' btn-primary' : ' btn-ghost'}`}
                onClick={() => setViewMode('week')}
                style={{ borderRadius: 0, gap: '0.375rem' }}
              >
                <CalendarDays size={13} /> Week
              </button>
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
            <button className="btn btn-secondary btn-sm" onClick={navPrev} title="Previous">
              <ChevronLeft size={16} />
            </button>
            <button className="btn btn-secondary btn-sm" onClick={navToday}>
              <Calendar size={14} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
              Today
            </button>
            <button className="btn btn-secondary btn-sm" onClick={navNext} title="Next">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Hint bar */}
      {canInteract && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          <GripHorizontal size={13} style={{ verticalAlign: 'middle', marginRight: '0.3rem', opacity: 0.6 }} />
          {viewMode === 'day'
            ? 'Drag a bar\'s center to move it across the day. Drag its edges to resize. Times are clamped to the same day.'
            : 'Drag a job bar onto a different designer row to reassign it. Click a bar to view details.'}
        </p>
      )}

      {/* ── Designer personal schedule view (DESIGNER role) ─────────────────── */}
      {isDesignerView ? (
        <div>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
              <div className="spinner spinner-lg" />
            </div>
          ) : !designers[0] || designers[0].assignments.length === 0 ? (
            <div className="empty-state">
              <Calendar size={40} className="empty-state-icon" />
              <h3>No assignments this week</h3>
              <p>You have no jobs scheduled for this period</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {days.map((day) => {
                const myRow = designers[0];
                const dayAssignments = myRow.assignments.filter((a) => {
                  const s = new Date(a.startTime);
                  const e = new Date(a.endTime);
                  return s <= endOfDay(day) && e >= startOfDay(day);
                });
                const isThisToday = isSameDay(day, today);
                return (
                  <div key={day.toISOString()} className="designer-day-section">
                    <div className="designer-day-label" style={isThisToday ? { color: 'var(--accent)', borderLeftColor: 'var(--accent)' } : undefined}>
                      <span style={{ fontWeight: isThisToday ? 700 : 600 }}>{format(day, 'EEEE, MMMM d')}</span>
                      {isThisToday && (
                        <span style={{ marginLeft: '0.5rem', fontSize: '0.68rem', fontWeight: 700, background: 'var(--accent)', color: 'white', padding: '0.1rem 0.45rem', borderRadius: '999px', letterSpacing: '0.04em' }}>TODAY</span>
                      )}
                      <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                        {dayAssignments.length} assignment{dayAssignments.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {dayAssignments.length === 0 ? (
                      <div className="designer-day-empty">No assignments scheduled</div>
                    ) : (
                      dayAssignments.map((a) => {
                        const barColor = a.job.isAtRisk ? '#ef4444' : (PRIORITY_COLORS[a.job.priority] ?? '#6366f1');
                        return (
                          <div key={a.id} className="designer-assignment-item" onClick={() => setClickedAssignment(a)}>
                            <div style={{ width: 3, flexShrink: 0, background: barColor, borderRadius: 3, alignSelf: 'stretch' }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {a.job.title}
                              </div>
                              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{a.job.jobNumber}</span>
                                <StatusBadge status={a.job.status as JobStatus} size="sm" />
                                <PriorityBadge priority={a.job.priority as JobPriority} size="sm" />
                                {a.job.isAtRisk && (
                                  <span style={{ color: 'var(--danger)', fontSize: '0.72rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                    <AlertTriangle size={11} /> At Risk
                                  </span>
                                )}
                              </div>
                              {a.job.stream && (
                                <div style={{ marginTop: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: a.job.stream.colorHex, display: 'inline-block', flexShrink: 0 }} />
                                  {a.job.stream.name}
                                </div>
                              )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0, textAlign: 'right', lineHeight: 1.5 }}>
                              {format(new Date(a.startTime), 'MMM d')}<br />
                              {format(new Date(a.endTime), 'MMM d')}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ── Gantt grid (ADMIN / WORKFLOW_ADMIN view) ───────────────────────── */
        <div className="gantt-container">
          <div className="gantt-scroll">
            {/* Sticky header row */}
            <div className="gantt-header">
              <div className="gantt-label-col">
                <span className="gantt-col-title">Designer</span>
              </div>
              {viewMode === 'day'
                ? hours.map((h) => (
                    <div key={h} className="gantt-day-header" style={{ width: HOUR_WIDTH, textAlign: 'center' }}>
                      <div className="gantt-day-name">{format(new Date(dvStart).setHours(h), 'h a')}</div>
                    </div>
                  ))
                : days.map((day) => {
                    const isTodayCol = isSameDay(day, today);
                    return (
                      <div key={day.toISOString()} className={`gantt-day-header${isTodayCol ? ' gantt-day-header--today' : ''}`} style={{ width: DAY_WIDTH }}>
                        <div className="gantt-day-name">{format(day, 'EEE')}</div>
                        <div className="gantt-day-num">{format(day, 'd')}</div>
                        {isTodayCol && <div className="gantt-today-dot" />}
                      </div>
                    );
                  })
              }
            </div>

            {/* Body rows */}
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem', minWidth: totalWidth + 210 }}>
                <div className="spinner spinner-lg" />
              </div>
            ) : designers.length === 0 ? (
              <div className="empty-state" style={{ minWidth: totalWidth + 210 }}>
                <Calendar size={40} className="empty-state-icon" />
                <h3>No assignments for this period</h3>
                <p>Assign designers to jobs to see their workload here</p>
              </div>
            ) : (
              designers.map((designer) => {
                const isDropTarget = dropTargetId === designer.id && viewMode === 'week';

                const maxUtil = viewMode === 'week' ? getMaxDailyUtilization(designer.assignments, days) : 0;
                const dayHours = viewMode === 'day' ? calcTotalHours(designer.assignments) : 0;
                const isOverbooked = viewMode === 'week'
                  ? maxUtil > 1.0
                  : dayHours > WORK_HOURS_PER_DAY;
                const utilPct = viewMode === 'week'
                  ? Math.min(maxUtil * 100, 100)
                  : Math.min((dayHours / WORK_HOURS_PER_DAY) * 100, 100);
                const capacityColor = utilPct >= 100 ? 'var(--danger)' : utilPct >= 75 ? 'var(--warning)' : 'var(--success)';

                return (
                  <div
                    key={designer.id}
                    className={`gantt-row${isDropTarget ? ' gantt-row--droptarget' : ''}`}
                    style={{ height: ROW_HEIGHT }}
                    onDragOver={canInteract && viewMode === 'week' ? (e) => handleRowDragOver(e, designer.id) : undefined}
                    onDrop={canInteract && viewMode === 'week' ? () => handleRowDrop(designer) : undefined}
                    onDragLeave={canInteract && viewMode === 'week' ? () => setDropTargetId(null) : undefined}
                  >
                    {/* Designer info column */}
                    <div className="gantt-label-col gantt-designer-cell">
                      <Avatar firstName={designer.firstName} lastName={designer.lastName} avatarUrl={designer.avatarUrl} size="sm" />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span className="truncate" style={{ fontWeight: 600, fontSize: '0.8375rem' }}>
                            {designer.firstName} {designer.lastName}
                          </span>
                          {isOverbooked && (
                            <span className="capacity-warning" title="Overbooked">
                              <AlertTriangle size={12} />
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                          {viewMode === 'day'
                            ? `${dayHours.toFixed(1)}h scheduled`
                            : `${designer.assignments.length} job${designer.assignments.length !== 1 ? 's' : ''}${isOverbooked ? ' · Overbooked' : ''}`
                          }
                        </div>
                        {designer.assignments.length > 0 && (
                          <div className="capacity-bar-wrap" title={`${Math.round(utilPct)}% capacity`}>
                            <div className="capacity-bar-fill" style={{ width: `${utilPct}%`, background: capacityColor }} />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bars area */}
                    <div className="gantt-bars-area" style={{ minWidth: totalWidth }}>
                      {/* Grid column backgrounds */}
                      <div style={{ display: 'flex', position: 'absolute', inset: 0 }}>
                        {viewMode === 'day'
                          ? hours.map((h) => (
                              <div
                                key={h}
                                style={{
                                  width: HOUR_WIDTH, flexShrink: 0, height: '100%',
                                  borderRight: '1px solid var(--border)',
                                  background: h === today.getHours() && isSameDay(dayDate, today)
                                    ? 'rgba(99,102,241,0.04)' : 'transparent',
                                }}
                              />
                            ))
                          : days.map((day) => (
                              <div
                                key={day.toISOString()}
                                style={{
                                  width: DAY_WIDTH, flexShrink: 0, height: '100%',
                                  borderRight: '1px solid var(--border)',
                                  background: isSameDay(day, today) ? 'rgba(99,102,241,0.04)' : 'transparent',
                                }}
                              />
                            ))
                        }
                      </div>

                      {/* Assignment bars */}
                      <div style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
                        {designer.assignments.length === 0 && (
                          <div className="gantt-empty-hint">No assignments this {viewMode === 'day' ? 'day' : 'week'}</div>
                        )}
                        {designer.assignments.map((assignment) => (
                          <GanttBar
                            key={assignment.id}
                            assignment={assignment}
                            viewMode={viewMode}
                            weekStart={weekStart}
                            dvStartMs={dvStartMs}
                            dvEndMs={dvEndMs}
                            canInteract={canInteract}
                            isSaving={savingId === assignment.id}
                            isDraggingWeek={draggingId === assignment.id}
                            onDragCommit={(ns, ne) => handleDragCommit(assignment, designer, ns, ne)}
                            onWeekDragStart={() => handleBarDragStart(assignment, designer)}
                            onWeekDragEnd={handleBarDragEnd}
                            onJobClick={() => setClickedAssignment(assignment)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Legend */}
          <div className="gantt-legend">
            <span className="gantt-legend-label">Priority:</span>
            {Object.entries(PRIORITY_COLORS).filter(([k]) => k !== 'CRITICAL').map(([label, color]) => (
              <div key={label} className="gantt-legend-item">
                <span style={{ width: 11, height: 11, borderRadius: 2, background: `${color}33`, border: `1.5px solid ${color}`, flexShrink: 0, display: 'inline-block' }} />
                {label.charAt(0) + label.slice(1).toLowerCase()}
              </div>
            ))}
            <div className="gantt-legend-item" style={{ color: 'var(--danger)' }}>
              <span style={{ width: 11, height: 11, borderRadius: 2, background: 'rgba(239,68,68,0.2)', border: '1.5px solid #ef4444', flexShrink: 0, display: 'inline-block' }} />
              At Risk
            </div>
            {canInteract && (
              <div className="gantt-legend-item" style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                <GripHorizontal size={12} />
                {viewMode === 'day' ? 'Drag center to move · Drag edges to resize' : 'Drag to reassign'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Job quick-view modal ─────────────────────────────────────────────── */}
      {clickedAssignment && (
        <JobQuickModal assignment={clickedAssignment} onClose={() => setClickedAssignment(null)} />
      )}

      {/* ── Reassignment modal (week DnD) ────────────────────────────────────── */}
      {reassignModal && (
        <ReassignmentModal
          modal={reassignModal}
          onConfirm={handleConfirmReassign}
          onCancel={() => { setReassignModal(null); draggedRef.current = null; }}
        />
      )}
    </div>
  );
}

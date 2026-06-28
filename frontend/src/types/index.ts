// Shared TypeScript types for the Job Timeline Platform Frontend

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

export type Role = 'ADMIN' | 'WORKFLOW_ADMIN' | 'DESIGNER' | 'CLIENT';

export type JobStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'DELEGATED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'AT_RISK'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'ON_HOLD';

export type JobPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type NotificationType =
  | 'JOB_SUBMITTED'
  | 'JOB_ACCEPTED'
  | 'JOB_REJECTED'
  | 'JOB_ASSIGNED'
  | 'JOB_STATUS_CHANGED'
  | 'JOB_AT_RISK'
  | 'JOB_DELEGATED'
  | 'JOB_COMPLETED'
  | 'JOB_CANCELLED'
  | 'AI_ACTION_PROPOSED'
  | 'SYSTEM';

// ─────────────────────────────────────────────
// USER
// ─────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: Role;
  avatarUrl?: string;
  isActive: boolean;
  workHoursStart: string;
  workHoursEnd: string;
  timezone: string;
  lastLoginAt?: string;
  createdAt: string;
}

export interface AuthUser extends User {
  accessToken: string;
}

// ─────────────────────────────────────────────
// STREAM
// ─────────────────────────────────────────────

export interface Stream {
  id: string;
  name: string;
  description?: string;
  colorHex: string;
  isActive: boolean;
  memberCount?: number;
  createdAt: string;
}

export interface StreamMember {
  id: string;
  userId: string;
  streamId: string;
  isPrimary: boolean;
  user: User;
}

// ─────────────────────────────────────────────
// JOB
// ─────────────────────────────────────────────

export interface Job {
  id: string;
  jobNumber: string;
  title: string;
  description: string;
  status: JobStatus;
  priority: JobPriority;
  billingCode?: string;
  deadline?: string;
  streamId?: string;
  stream?: Stream;
  clientId: string;
  client: User;
  notes?: string;
  rejectionReason?: string;
  parentJobId?: string;
  isAtRisk: boolean;
  delegationCount: number;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  assignments?: JobAssignment[];
  attachmentCount?: number;
}

export interface JobAssignment {
  id: string;
  jobId: string;
  designerId: string;
  designer: User;
  assignedById: string;
  assignedBy: User;
  isPrimary: boolean;
  startTime: string;
  endTime: string;
  isActive: boolean;
  createdAt: string;
}

export interface JobStatusHistoryEntry {
  id: string;
  fromStatus?: JobStatus;
  toStatus: JobStatus;
  changedById: string;
  isSystem: boolean;
  reason?: string;
  changedAt: string;
}

// ─────────────────────────────────────────────
// NOTIFICATION
// ─────────────────────────────────────────────

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  jobId?: string;
  isRead: boolean;
  readAt?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ─────────────────────────────────────────────
// AI AGENT
// ─────────────────────────────────────────────

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result';
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: Record<string, unknown>;
  createdAt: string;
}

export interface AiConversation {
  id: string;
  title?: string;
  messages: AiMessage[];
  createdAt: string;
  updatedAt: string;
}

export type AiActionName = 'assign_designer_to_job' | 'change_job_status';

export interface AiActionProposal {
  id: string;
  action: AiActionName;
  description: string;
  reasoning: string;
  payload: {
    jobId: string;
    jobNumber: string;
    designerId?: string;
    designerName?: string;
    startTime?: string;
    endTime?: string;
    newStatus?: string;
  };
  expiresAt: string;
}

// ─────────────────────────────────────────────
// API RESPONSES
// ─────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiError {
  statusCode: number;
  message: string | string[];
  error?: string;
  timestamp?: string;
}

// ─────────────────────────────────────────────
// FILTERS
// ─────────────────────────────────────────────

export interface JobFilters {
  status?: JobStatus | JobStatus[];
  priority?: JobPriority;
  streamId?: string;
  clientId?: string;
  isAtRisk?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'deadline' | 'priority' | 'status';
  sortOrder?: 'asc' | 'desc';
}

// ─────────────────────────────────────────────
// TIMELINE
// ─────────────────────────────────────────────

export interface TimelineSlot {
  id: string;
  jobId: string;
  job: Job;
  designerId: string;
  designer: User;
  startTime: string;
  endTime: string;
  isPrimary: boolean;
}

export interface DesignerTimeline {
  designer: User;
  slots: TimelineSlot[];
  utilizationPercent: number;
}

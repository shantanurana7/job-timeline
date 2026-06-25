import apiClient from './api';
import { Job, JobFilters, JobStatus } from '@/types';

export const jobsApi = {
  list: (filters?: Partial<JobFilters>) =>
    apiClient.get('/jobs', { params: filters }).then((r) => r.data),

  get: (id: string) =>
    apiClient.get(`/jobs/${id}`).then((r) => r.data),

  create: (data: {
    title: string; description: string; priority?: string;
    deadline?: string; billingCode?: string; streamId?: string; notes?: string;
  }) => apiClient.post('/jobs', data).then((r) => r.data),

  update: (id: string, data: Partial<Job>) =>
    apiClient.patch(`/jobs/${id}`, data).then((r) => r.data),

  changeStatus: (id: string, status: JobStatus, reason?: string) =>
    apiClient.patch(`/jobs/${id}/status`, { status, reason }).then((r) => r.data),

  delegate: (id: string, toStreamId: string, reason?: string) =>
    apiClient.post(`/jobs/${id}/delegate`, { toStreamId, reason }).then((r) => r.data),
};

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post('/auth/login', { email, password }).then((r) => r.data),

  refresh: (refreshToken: string) =>
    apiClient.post('/auth/refresh', { refreshToken }).then((r) => r.data),

  logout: (refreshToken: string) =>
    apiClient.post('/auth/logout', { refreshToken }).then((r) => r.data),

  me: () => apiClient.get('/auth/me').then((r) => r.data),
};

export const usersApi = {
  list: (params?: { role?: string; isActive?: boolean }) =>
    apiClient.get('/users', { params }).then((r) => r.data),
  get: (id: string) => apiClient.get(`/users/${id}`).then((r) => r.data),
  create: (data: any) => apiClient.post('/users', data).then((r) => r.data),
  update: (id: string, data: any) => apiClient.patch(`/users/${id}`, data).then((r) => r.data),
  deactivate: (id: string) => apiClient.delete(`/users/${id}`).then((r) => r.data),
};

export const streamsApi = {
  list: () => apiClient.get('/streams').then((r) => r.data),
  get: (id: string) => apiClient.get(`/streams/${id}`).then((r) => r.data),
  create: (data: any) => apiClient.post('/streams', data).then((r) => r.data),
  update: (id: string, data: any) => apiClient.patch(`/streams/${id}`, data).then((r) => r.data),
  addMember: (id: string, userId: string, isPrimary?: boolean) =>
    apiClient.post(`/streams/${id}/members`, { userId, isPrimary }).then((r) => r.data),
  removeMember: (id: string, userId: string) =>
    apiClient.delete(`/streams/${id}/members/${userId}`).then((r) => r.data),
};

export const assignmentsApi = {
  assign: (data: any) => apiClient.post('/assignments', data).then((r) => r.data),
  unassign: (id: string, reason?: string) =>
    apiClient.delete(`/assignments/${id}`, { data: { reason } }).then((r) => r.data),
  timeline: (from: string, to: string, streamId?: string) =>
    apiClient.get('/assignments/timeline', { params: { from, to, streamId } }).then((r) => r.data),
  designerSchedule: (designerId: string, from?: string, to?: string) =>
    apiClient.get(`/assignments/designer/${designerId}/schedule`, { params: { from, to } }).then((r) => r.data),
};

export const notificationsApi = {
  list: (unreadOnly?: boolean) =>
    apiClient.get('/notifications', { params: { unreadOnly } }).then((r) => r.data),
  markRead: (id: string) => apiClient.patch(`/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => apiClient.patch('/notifications/read-all').then((r) => r.data),
};

export const settingsApi = {
  list: () => apiClient.get('/settings').then((r) => r.data),
  update: (key: string, value: string) =>
    apiClient.patch(`/settings/${key}`, { value }).then((r) => r.data),
};

export const analyticsApi = {
  dashboard: () => apiClient.get('/analytics/dashboard').then((r) => r.data),
  workload: () => apiClient.get('/analytics/workload').then((r) => r.data),
  streams: () => apiClient.get('/analytics/streams').then((r) => r.data),
};

export const attachmentsApi = {
  upload: (jobId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post(`/jobs/${jobId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
  list: (jobId: string) => apiClient.get(`/jobs/${jobId}/attachments`).then((r) => r.data),
  delete: (id: string) => apiClient.delete(`/attachments/${id}`).then((r) => r.data),
};

export const aiApi = {
  chat: (query: string, history: any[] = []) =>
    apiClient.post('/ai/chat', { query, history }).then((r) => r.data),
};


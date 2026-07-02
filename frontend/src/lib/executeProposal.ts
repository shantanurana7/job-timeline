import { AiActionProposal, JobStatus } from '@/types';
import { assignmentsApi, jobsApi } from '@/services';

/**
 * Executes a confirmed AiActionProposal by calling the appropriate API endpoint.
 * This is the single source of truth for the "Proposal, Not Execution" execution step.
 * Called after the user confirms a proposal in either the AI page or AI Drawer.
 */
export async function executeProposal(proposal: AiActionProposal): Promise<void> {
  const { action, payload } = proposal;

  switch (action) {
    case 'assign_designer_to_job':
      await assignmentsApi.assign({
        jobId:      payload.jobId,
        designerId: payload.designerId,
        startTime:  payload.startTime,
        endTime:    payload.endTime,
        isPrimary:  true,
      });
      break;

    case 'change_job_status':
      await jobsApi.changeStatus(
        payload.jobId!,
        payload.newStatus as JobStatus,
      );
      break;

    case 'create_job':
      await jobsApi.create({
        title:       payload.title ?? '',
        description: payload.description ?? '',
        priority:    payload.newPriority,
      });
      break;

    case 'update_job_priority':
      await jobsApi.update(payload.jobId!, { priority: payload.newPriority as never });
      break;

    case 'update_job_deadline':
      await jobsApi.update(payload.jobId!, { deadline: payload.newDeadline as never });
      break;

    case 'add_job_note': {
      // Fetch the current job notes, then append the new note with a timestamp.
      const jobData = await jobsApi.get(payload.jobId!);
      const existing: string = jobData?.data?.notes ?? '';
      const timestamp = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
      const appended = existing
        ? `${existing}\n\n[${timestamp}] ${payload.note ?? ''}`
        : `[${timestamp}] ${payload.note ?? ''}`;
      await jobsApi.update(payload.jobId!, { notes: appended as never });
      break;
    }

    case 'remove_assignment':
      if (!payload.assignmentId) {
        throw new Error('No assignment ID found. The assignment may not exist or is already inactive.');
      }
      await assignmentsApi.unassign(payload.assignmentId);
      break;

    default:
      throw new Error(`Unknown proposal action: ${action}`);
  }
}

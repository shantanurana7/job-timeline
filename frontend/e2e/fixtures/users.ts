export const USERS = {
  admin: {
    email: 'admin@jobtimeline.local',
    password: 'Admin1234!',
    role: 'ADMIN',
  },
  workflowAdmin: {
    email: 'wa.brand@jobtimeline.local',
    password: 'Password1234!',
    role: 'WORKFLOW_ADMIN',
  },
  designer: {
    email: 'alex.chen@jobtimeline.local',
    password: 'Password1234!',
    role: 'DESIGNER',
  },
  client: {
    email: 'client.acme@jobtimeline.local',
    password: 'Password1234!',
    role: 'CLIENT',
  },
} as const;

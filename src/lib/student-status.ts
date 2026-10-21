export const studentStatuses = ['ACTIVE', 'INACTIVE', 'GRADUATED', 'SUSPENDED', 'TRANSFERRED'] as const;
export type StudentStatus = typeof studentStatuses[number];
export const studentStatusLabels = {
  ACTIVE: 'Active', INACTIVE: 'Inactive', GRADUATED: 'Graduated', SUSPENDED: 'Suspended', TRANSFERRED: 'Transferred',
} as const;
export type StudentStatusLabel = typeof studentStatusLabels[StudentStatus];
export function isStudentStatus(value: unknown): value is StudentStatus {
  return studentStatuses.some(status => status === value);
}
export function statusFromLabel(label: string): StudentStatus | undefined {
  return studentStatuses.find(status => studentStatusLabels[status] === label);
}

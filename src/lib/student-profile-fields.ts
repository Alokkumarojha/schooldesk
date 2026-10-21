import type { StudentProfile } from './student-profile-client';

type Field = {
  name: keyof StudentProfile;
  label: string;
  type?: 'date' | 'tel' | 'email' | 'url';
  max?: number;
  required?: boolean;
  options?: readonly string[];
};
export const profileSections: { title: string; fields: Field[] }[] = [
  {
    title: 'Personal',
    fields: [
      { name: 'name', label: 'Full name', max: 80, required: true },
      {
        name: 'gender',
        label: 'Gender',
        options: ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'],
      },
      { name: 'dateOfBirth', label: 'Date of birth', type: 'date' },
      {
        name: 'bloodGroup',
        label: 'Blood group',
        options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
      },
      { name: 'imageUrl', label: 'Photo URL (HTTPS)', type: 'url', max: 2048 },
    ],
  },
  {
    title: 'Academic',
    fields: [
      { name: 'rollNumber', label: 'Roll number', max: 40 },
      { name: 'classId', label: 'Class', required: true },
      { name: 'academicYear', label: 'Academic year', max: 9 },
      { name: 'admissionDate', label: 'Admission date', type: 'date' },
      {
        name: 'status',
        label: 'Status',
        required: true,
        options: [
          'ACTIVE',
          'INACTIVE',
          'GRADUATED',
          'SUSPENDED',
          'TRANSFERRED',
        ],
      },
    ],
  },
  {
    title: 'Guardian',
    fields: [
      { name: 'guardianName', label: 'Guardian name', max: 80, required: true },
      { name: 'guardianRelation', label: 'Relation', max: 80 },
      {
        name: 'guardianPhone',
        label: 'Guardian mobile',
        type: 'tel',
        max: 13,
        required: true,
      },
      {
        name: 'guardianEmail',
        label: 'Guardian email',
        type: 'email',
        max: 160,
      },
      {
        name: 'alternateGuardianPhone',
        label: 'Alternate mobile',
        type: 'tel',
        max: 13,
      },
    ],
  },
  {
    title: 'Address',
    fields: [
      { name: 'addressLine1', label: 'Address line 1', max: 240 },
      { name: 'addressLine2', label: 'Address line 2', max: 240 },
      { name: 'city', label: 'City', max: 100 },
      { name: 'state', label: 'State', max: 100 },
      { name: 'pincode', label: 'Pincode', max: 12 },
      { name: 'country', label: 'Country', max: 100 },
    ],
  },
];
export function humanLabel(value: string): string {
  return value
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

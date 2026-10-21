import 'server-only';

import type { SchoolRole } from '@/generated/prisma/enums';

// Directory/management data is not a student or parent self-service API.
export const managementReaders: readonly SchoolRole[] = ['OWNER', 'ADMIN', 'TEACHER', 'ACCOUNTANT', 'STAFF'];
export const managementWriters: readonly SchoolRole[] = ['OWNER', 'ADMIN'];

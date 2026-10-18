export type Student = { id: string; name: string; classId: string; guardian: string; email: string; status: 'Active' | 'Inactive' };
export type Teacher = { id: string; name: string; subject: string; email: string; classId: string };
export type SchoolClass = { id: string; name: string; room: string; capacity: number };
export type Notice = { id: string; title: string; body: string; audience: string; date: string };
export type Mark = 'Present' | 'Absent' | 'Late';
export type Attendance = Record<string, Record<string, Mark>>;
export const classes: SchoolClass[] = [
  { id: '6a', name: 'Class 6 · A', room: '101', capacity: 35 },
  { id: '7a', name: 'Class 7 · A', room: '102', capacity: 35 },
  { id: '8a', name: 'Class 8 · A', room: '201', capacity: 35 },
  { id: '9a', name: 'Class 9 · A', room: '202', capacity: 30 },
];
export const initialStudents: Student[] = [
  ['SD001','Aarav Sharma','6a','Rohit Sharma','aarav@example.com'],
  ['SD002','Ananya Patel','6a','Meera Patel','ananya@example.com'],
  ['SD003','Ishaan Verma','6a','Amit Verma','ishaan@example.com'],
  ['SD004','Diya Singh','6a','Neha Singh','diya@example.com'],
  ['SD005','Kabir Mehta','7a','Raj Mehta','kabir@example.com'],
  ['SD006','Myra Kapoor','7a','Riya Kapoor','myra@example.com'],
  ['SD007','Arjun Nair','7a','Dev Nair','arjun@example.com'],
  ['SD008','Saanvi Rao','8a','Priya Rao','saanvi@example.com'],
  ['SD009','Vihaan Das','8a','Anil Das','vihaan@example.com'],
  ['SD010','Aisha Khan','8a','Sara Khan','aisha@example.com'],
  ['SD011','Aditya Joshi','9a','Kiran Joshi','aditya@example.com'],
  ['SD012','Tara Sen','9a','Nisha Sen','tara@example.com'],
].map(([id,name,classId,guardian,email]) => ({id,name,classId,guardian,email,status:'Active'}));
export const initialTeachers: Teacher[] = [
  {id:'T01',name:'Priya Menon',subject:'Mathematics',email:'priya@example.com',classId:'6a'},
  {id:'T02',name:'Rohan Gupta',subject:'Science',email:'rohan@example.com',classId:'7a'},
  {id:'T03',name:'Nandini Shah',subject:'English',email:'nandini@example.com',classId:'8a'},
  {id:'T04',name:'Vikram Rao',subject:'Social Studies',email:'vikram@example.com',classId:'9a'},
];
export const initialNotices: Notice[] = [
  {id:'N1',title:'Parent–teacher meeting',body:'Meet class teachers on Saturday, 26 September, from 9:00 AM to 12:00 PM. Please bring your child’s student diary.',audience:'Parents',date:'2026-09-22'},
  {id:'N2',title:'Term assessment preparation',body:'Teachers: review the assessment schedule with your classes and share revision material before Friday.',audience:'Teachers',date:'2026-09-21'},
  {id:'N3',title:'Library reading week',body:'Students can borrow one additional book during reading week. Visit the library during your assigned period.',audience:'Everyone',date:'2026-09-20'},
];
export const sections = ['Dashboard', 'Students', 'Teachers', 'Classes', 'Attendance', 'Notices'] as const;
export type Section = typeof sections[number];
export const audiences = ['Everyone', 'Teachers', 'Parents', 'Students'] as const;
export const attendanceStatuses: Mark[] = ['Present', 'Absent', 'Late'];
export const DEMO_DATE = '2026-09-22';

export type FormTarget =
  | { kind: 'student'; existing?: Student }
  | { kind: 'teacher'; existing?: Teacher }
  | { kind: 'notice'; existing?: Notice };

export type RecordSubmission =
  | { kind: 'student'; data: Omit<Student, 'id'> }
  | { kind: 'teacher'; data: Omit<Teacher, 'id'> }
  | { kind: 'notice'; data: Pick<Notice, 'title' | 'body' | 'audience'> };

export function initials(name: string) { return name.trim().split(/\s+/).map(s=>s[0]).slice(0,2).join(''); }
export function className(id: string) { return classes.find(c=>c.id===id)?.name ?? 'Unassigned'; }
export function todayISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function attendanceKey(date: string,classId: string) { return `${date}:${classId}`; }
export function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
}
export function nextRecordId(ids: string[], prefix: string, padding: number) {
  const highest = Math.max(0, ...ids.map(id => Number(id.slice(prefix.length))).filter(Number.isFinite));
  return `${prefix}${String(highest + 1).padStart(padding, '0')}`;
}

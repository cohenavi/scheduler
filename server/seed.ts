import 'dotenv/config';
import { PublishStatus, TimeBlock } from '@prisma/client';
import { prisma } from './db.js';

function formatDateYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getMondayOfCurrentWeek(): Date {
  const now = new Date();
  const day = now.getDay(); // 0 = Sun, 1 = Mon, ...
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  return monday;
}

function addDays(base: Date, days: number): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return formatDateYMD(d);
}

export async function runSeed(): Promise<void> {
  const existingPeopleCount = await prisma.person.count();
  if (existingPeopleCount > 0) {
    console.log(`Seed skipped M1: database already contains ${existingPeopleCount} people.`);
    await seedMilestone2Defaults();
    return;
  }

  console.log('Seeding database with Milestone 1 initial data...');

  // 1. Create 3 Categories
  const catClinical = await prisma.category.create({
    data: { name: 'Clinical', sortOrder: 1 },
  });
  const catAdmin = await prisma.category.create({
    data: { name: 'Administrative', sortOrder: 2 },
  });
  const catCall = await prisma.category.create({
    data: { name: 'Call', sortOrder: 3 },
  });

  // 2. Create 6 Assignment Types (shortcut keys 1-5 on first 5)
  const atClinic = await prisma.assignmentType.create({
    data: {
      categoryId: catClinical.id,
      name: 'Day Clinic',
      shortCode: 'CLIN',
      colorHex: '#2563EB',
      allowedDaysOfWeek: [1, 2, 3, 4, 5],
      requiredStaffPerDay: 4,
      timeBlockLabel: 'Full Day',
      startTime: '08:00',
      endTime: '17:00',
      shortcutKey: '1',
      sortOrder: 1,
    },
  });

  const atAmInpatient = await prisma.assignmentType.create({
    data: {
      categoryId: catClinical.id,
      name: 'AM Inpatient',
      shortCode: 'AM-IN',
      colorHex: '#0D9488',
      allowedDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      requiredStaffPerDay: 3,
      timeBlockLabel: 'AM',
      startTime: '07:00',
      endTime: '13:00',
      shortcutKey: '2',
      sortOrder: 2,
    },
  });

  const atPmInpatient = await prisma.assignmentType.create({
    data: {
      categoryId: catClinical.id,
      name: 'PM Inpatient',
      shortCode: 'PM-IN',
      colorHex: '#7C3AED',
      allowedDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      requiredStaffPerDay: 3,
      timeBlockLabel: 'PM',
      startTime: '13:00',
      endTime: '19:00',
      shortcutKey: '3',
      sortOrder: 3,
    },
  });

  const atAdminQuality = await prisma.assignmentType.create({
    data: {
      categoryId: catAdmin.id,
      name: 'Admin / Quality',
      shortCode: 'ADMIN',
      colorHex: '#D97706',
      allowedDaysOfWeek: [1, 2, 3, 4, 5],
      requiredStaffPerDay: 2,
      timeBlockLabel: 'AM',
      startTime: '08:00',
      endTime: '12:00',
      shortcutKey: '4',
      sortOrder: 4,
    },
  });

  const atNightCall = await prisma.assignmentType.create({
    data: {
      categoryId: catCall.id,
      name: 'Night Call',
      shortCode: 'CALL',
      colorHex: '#DC2626',
      allowedDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      requiredStaffPerDay: 2,
      timeBlockLabel: 'Overnight',
      startTime: '19:00',
      endTime: '07:00',
      shortcutKey: '5',
      sortOrder: 5,
    },
  });

  const atWeekendBackup = await prisma.assignmentType.create({
    data: {
      categoryId: catCall.id,
      name: 'Weekend Backup',
      shortCode: 'BKUP',
      colorHex: '#4F46E5',
      allowedDaysOfWeek: [0, 6],
      requiredStaffPerDay: 1,
      timeBlockLabel: 'Full Day',
      startTime: '08:00',
      endTime: '20:00',
      shortcutKey: null,
      sortOrder: 6,
    },
  });

  const allAssignmentIds = [
    atClinic.id,
    atAmInpatient.id,
    atPmInpatient.id,
    atAdminQuality.id,
    atNightCall.id,
    atWeekendBackup.id,
  ];

  // 3. Create 24 realistic team members
  const staffSeed: Array<{ name: string; role: string; maxShifts: number; maxHours: number }> = [
    { name: 'Dr. Elena Rostova', role: 'Attending Physician', maxShifts: 5, maxHours: 45 },
    { name: 'Dr. Marcus Vance', role: 'Attending Physician', maxShifts: 5, maxHours: 45 },
    { name: 'Dr. Priya Nair', role: 'Attending Physician', maxShifts: 5, maxHours: 45 },
    { name: 'Dr. Julian Brooks', role: 'Attending Physician', maxShifts: 4, maxHours: 40 },
    { name: 'Dr. Hannah Chen', role: 'Senior Resident', maxShifts: 5, maxHours: 50 },
    { name: 'Dr. Mateo Silva', role: 'Senior Resident', maxShifts: 5, maxHours: 50 },
    { name: 'Dr. Amir Patel', role: 'Senior Resident', maxShifts: 5, maxHours: 50 },
    { name: 'Dr. Chloe Bennett', role: 'Resident', maxShifts: 5, maxHours: 48 },
    { name: 'Dr. Lucas Meyer', role: 'Resident', maxShifts: 5, maxHours: 48 },
    { name: 'Dr. Zoe Washington', role: 'Resident', maxShifts: 5, maxHours: 48 },
    { name: 'Sarah Jenkins, NP', role: 'Nurse Practitioner', maxShifts: 5, maxHours: 40 },
    { name: 'David Kim, PA-C', role: 'Physician Assistant', maxShifts: 5, maxHours: 40 },
    { name: 'Rachel Alvarez, NP', role: 'Nurse Practitioner', maxShifts: 4, maxHours: 36 },
    { name: 'Jordan Taylor, PA-C', role: 'Physician Assistant', maxShifts: 5, maxHours: 40 },
    { name: 'Olivia Foster, RN', role: 'Charge Nurse', maxShifts: 4, maxHours: 40 },
    { name: 'Liam O’Connor, RN', role: 'Charge Nurse', maxShifts: 4, maxHours: 40 },
    { name: 'Maya Lin, RN', role: 'Staff Nurse', maxShifts: 4, maxHours: 36 },
    { name: 'Noah Campbell, RN', role: 'Staff Nurse', maxShifts: 4, maxHours: 36 },
    { name: 'Sofia Morales, RN', role: 'Staff Nurse', maxShifts: 4, maxHours: 36 },
    { name: 'Ethan Wright, RN', role: 'Staff Nurse', maxShifts: 4, maxHours: 36 },
    { name: 'Grace Park, PharmD', role: 'Clinical Pharmacist', maxShifts: 5, maxHours: 40 },
    { name: 'Daniel Cho, PharmD', role: 'Clinical Pharmacist', maxShifts: 5, maxHours: 40 },
    { name: 'Lauren Hughes', role: 'Care Coordinator', maxShifts: 5, maxHours: 40 },
    { name: 'Benjamin Hayes', role: 'Operations Lead', maxShifts: 5, maxHours: 40 },
  ];

  const people: Array<{ id: string }> = [];
  for (let i = 0; i < staffSeed.length; i++) {
    const s = staffSeed[i];
    const p = await prisma.person.create({
      data: {
        name: s.name,
        role: s.role,
        maxShiftsPerWeek: s.maxShifts,
        maxHoursPerWeek: s.maxHours,
        sortOrder: i + 1,
        allowedAssignments: {
          connect: allAssignmentIds.map((id) => ({ id })),
        },
      },
    });
    people.push(p);
  }

  const week1Mon = getMondayOfCurrentWeek();

  // Helper to create a published shift + matching paired draft shift
  async function createPublishedShift(
    personIdx: number,
    assignmentTypeId: string,
    dayOffset: number,
    opts?: { isLocked?: boolean; note?: string }
  ) {
    const date = addDays(week1Mon, dayOffset);
    const pub = await prisma.shift.create({
      data: {
        personId: people[personIdx].id,
        assignmentTypeId,
        date,
        status: PublishStatus.PUBLISHED,
        isLocked: opts?.isLocked ?? false,
        note: opts?.note ?? null,
      },
    });
    await prisma.shift.create({
      data: {
        personId: people[personIdx].id,
        assignmentTypeId,
        date,
        status: PublishStatus.DRAFT,
        isLocked: opts?.isLocked ?? false,
        note: opts?.note ?? null,
        publishedPairId: pub.id,
      },
    });
  }

  // Helper to create a draft-only shift (Week 2 unpublished edits)
  async function createDraftOnlyShift(
    personIdx: number,
    assignmentTypeId: string,
    dayOffset: number,
    opts?: { isLocked?: boolean; note?: string }
  ) {
    const date = addDays(week1Mon, dayOffset);
    await prisma.shift.create({
      data: {
        personId: people[personIdx].id,
        assignmentTypeId,
        date,
        status: PublishStatus.DRAFT,
        isLocked: opts?.isLocked ?? false,
        note: opts?.note ?? null,
        publishedPairId: null,
      },
    });
  }

  // Helper for Published + Draft PTO
  async function createPublishedPto(
    personIdx: number,
    dayOffset: number,
    timeBlock: TimeBlock,
    note: string
  ) {
    const date = addDays(week1Mon, dayOffset);
    const pub = await prisma.unavailability.create({
      data: {
        personId: people[personIdx].id,
        date,
        timeBlock,
        note,
        status: PublishStatus.PUBLISHED,
      },
    });
    await prisma.unavailability.create({
      data: {
        personId: people[personIdx].id,
        date,
        timeBlock,
        note,
        status: PublishStatus.DRAFT,
        publishedPairId: pub.id,
      },
    });
  }

  // 4. Pre-marked PTO Dates (Week 1 Published + Week 2 Draft)
  await createPublishedPto(3, 2, TimeBlock.FULL_DAY, 'CME Conference Travel');
  await createPublishedPto(12, 4, TimeBlock.FULL_DAY, 'Scheduled Vacation');
  await createPublishedPto(16, 1, TimeBlock.AM, 'Morning Medical Appt');
  await createPublishedPto(20, 3, TimeBlock.FULL_DAY, 'Personal Day');

  // Week 2 draft-only PTO
  await prisma.unavailability.create({
    data: {
      personId: people[1].id,
      date: addDays(week1Mon, 8),
      timeBlock: TimeBlock.FULL_DAY,
      note: 'Pending PTO Approval',
      status: PublishStatus.DRAFT,
    },
  });
  await prisma.unavailability.create({
    data: {
      personId: people[7].id,
      date: addDays(week1Mon, 10),
      timeBlock: TimeBlock.FULL_DAY,
      note: 'Board Review Day',
      status: PublishStatus.DRAFT,
    },
  });

  // 5. Published Week 1 Schedule (Mon = 0 .. Sun = 6)
  for (let d = 0; d < 5; d++) {
    // 4 Day Clinic
    await createPublishedShift(0, atClinic.id, d, d === 0 ? { isLocked: true, note: 'Leading morning huddle' } : undefined);
    await createPublishedShift(10, atClinic.id, d, d === 2 ? { note: 'Covering triage inbox' } : undefined);
    await createPublishedShift(11, atClinic.id, d);
    await createPublishedShift(13, atClinic.id, d);

    // 3 AM Inpatient
    await createPublishedShift(1, atAmInpatient.id, d, d === 1 ? { isLocked: true } : undefined);
    await createPublishedShift(4, atAmInpatient.id, d);
    await createPublishedShift(14, atAmInpatient.id, d, d === 3 ? { note: 'ICU rounding with pharmacy' } : undefined);

    // 3 PM Inpatient
    await createPublishedShift(2, atPmInpatient.id, d);
    await createPublishedShift(5, atPmInpatient.id, d);
    await createPublishedShift(15, atPmInpatient.id, d, d === 4 ? { note: 'Handoff at 18:45' } : undefined);

    // 2 Admin / Quality
    await createPublishedShift(22, atAdminQuality.id, d);
    await createPublishedShift(23, atAdminQuality.id, d, d === 0 ? { note: 'Monthly compliance audit' } : undefined);
  }

  // Night Call across all 7 days of Week 1
  for (let d = 0; d < 7; d++) {
    const p1 = 6 + (d % 4);
    const p2 = 17 + (d % 3);
    await createPublishedShift(p1, atNightCall.id, d, {
      isLocked: d === 0 || d === 5,
      note: d === 5 ? 'Primary weekend call' : undefined,
    });
    await createPublishedShift(p2, atNightCall.id, d);
  }

  // Weekend Coverage (Sat = 5, Sun = 6)
  for (const d of [5, 6]) {
    await createPublishedShift(1, atAmInpatient.id, d);
    await createPublishedShift(8, atAmInpatient.id, d);
    await createPublishedShift(18, atAmInpatient.id, d);
    await createPublishedShift(2, atPmInpatient.id, d);
    await createPublishedShift(9, atPmInpatient.id, d);
    await createPublishedShift(19, atPmInpatient.id, d);
    await createPublishedShift(3, atWeekendBackup.id, d, { isLocked: true, note: 'On-call backup pager #402' });
  }

  // 6. Unpublished Week 2 Draft Edits (Mon = 7 .. Sun = 13)
  for (let d = 7; d < 12; d++) {
    await createDraftOnlyShift(0, atClinic.id, d, d === 7 ? { isLocked: true, note: 'Draft: Q4 clinic kickoff' } : undefined);
    await createDraftOnlyShift(10, atClinic.id, d);
    await createDraftOnlyShift(4, atAmInpatient.id, d, d === 9 ? { isLocked: true } : undefined);
    await createDraftOnlyShift(14, atAmInpatient.id, d);
    await createDraftOnlyShift(5, atPmInpatient.id, d);
    await createDraftOnlyShift(22, atAdminQuality.id, d);
    await createDraftOnlyShift(6 + ((d - 7) % 3), atNightCall.id, d, d === 7 ? { note: 'Draft: confirm coverage' } : undefined);
  }

  console.log('Seed completed: 24 people, 3 categories, 6 assignment types, Week 1 published + Week 2 draft.');
  await seedMilestone2Defaults();
}

async function seedMilestone2Defaults(): Promise<void> {
  const [ruleCount, tplCount, people, assignmentTypes] = await Promise.all([
    prisma.constraintRule.count(),
    prisma.scheduleTemplate.count(),
    prisma.person.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.assignmentType.findMany({ orderBy: { sortOrder: 'asc' } }),
  ]);

  const atByCode = new Map(assignmentTypes.map((a) => [a.shortCode, a]));
  const callAt = atByCode.get('CALL');
  const clinicAt = atByCode.get('CLIN');
  const amAt = atByCode.get('AM-IN');
  const pmAt = atByCode.get('PM-IN');
  const adminAt = atByCode.get('ADMIN');

  if (ruleCount === 0) {
    await prisma.constraintRule.createMany({
      data: [
        {
          name: 'Qualification Confinement',
          ruleType: 'QUALIFICATION',
          enforcement: 'SOFT_WARN',
          config: {},
          isActive: true,
          priority: 1,
        },
        {
          name: 'PTO / Unavailability Conflict',
          ruleType: 'PTO_CONFLICT',
          enforcement: 'SOFT_WARN',
          config: {},
          isActive: true,
          priority: 2,
        },
        {
          name: 'Day-of-Week Validity',
          ruleType: 'DAY_OF_WEEK',
          enforcement: 'SOFT_WARN',
          config: {},
          isActive: true,
          priority: 3,
        },
        {
          name: 'Time-Overlap & Double-Booking',
          ruleType: 'TIME_OVERLAP',
          enforcement: 'SOFT_WARN',
          config: {},
          isActive: true,
          priority: 4,
        },
        {
          name: '12-Hour Post-Call Rest Turnaround',
          ruleType: 'MUTUAL_EXCLUSION_AND_REST',
          enforcement: 'SOFT_WARN',
          assignmentTypeId: callAt?.id ?? null,
          config: {
            mode: 'MIN_REST_HOURS',
            minRestHours: 12,
            fromAssignmentTypeId: callAt?.id ?? null,
          },
          isActive: true,
          priority: 5,
        },
        {
          name: 'Weekly Shift & Hour Cap',
          ruleType: 'WORKLOAD_CAP',
          enforcement: 'SOFT_WARN',
          config: {},
          isActive: true,
          priority: 6,
        },
      ],
    });
    console.log('Seeded 6 Milestone 2 Constraint Rules.');
  }

  if (tplCount === 0 && people.length >= 16 && clinicAt && amAt && pmAt && adminAt && callAt) {
    // Template 1: Standard 2-Week Rotation A
    const entries2w = [];
    for (let w = 0; w < 2; w++) {
      for (let d = 0; d < 5; d++) {
        entries2w.push(
          { weekIndex: w, dayOfWeek: d, personId: people[0].id, assignmentTypeId: clinicAt.id, note: d === 0 ? 'Rotation A clinic lead' : null },
          { weekIndex: w, dayOfWeek: d, personId: people[10].id, assignmentTypeId: clinicAt.id, note: null },
          { weekIndex: w, dayOfWeek: d, personId: people[1].id, assignmentTypeId: amAt.id, note: null },
          { weekIndex: w, dayOfWeek: d, personId: people[4].id, assignmentTypeId: amAt.id, note: null },
          { weekIndex: w, dayOfWeek: d, personId: people[2].id, assignmentTypeId: pmAt.id, note: null },
          { weekIndex: w, dayOfWeek: d, personId: people[5].id, assignmentTypeId: pmAt.id, note: null },
          { weekIndex: w, dayOfWeek: d, personId: people[22].id, assignmentTypeId: adminAt.id, note: null }
        );
      }
      for (let d = 0; d < 7; d++) {
        entries2w.push({
          weekIndex: w,
          dayOfWeek: d,
          personId: people[6 + ((w * 7 + d) % 4)].id,
          assignmentTypeId: callAt.id,
          note: null,
        });
      }
    }

    await prisma.scheduleTemplate.create({
      data: {
        name: 'Standard 2-Week Rotation A',
        description: 'Balanced 14-day clinical, inpatient, admin, and night call rotation.',
        cycleWeeks: 2,
        entries: { create: entries2w },
      },
    });

    // Template 2: 1-Week Clinic Baseline
    const entries1w = [];
    for (let d = 0; d < 5; d++) {
      entries1w.push(
        { weekIndex: 0, dayOfWeek: d, personId: people[0].id, assignmentTypeId: clinicAt.id, note: 'Baseline clinic' },
        { weekIndex: 0, dayOfWeek: d, personId: people[10].id, assignmentTypeId: clinicAt.id, note: null },
        { weekIndex: 0, dayOfWeek: d, personId: people[11].id, assignmentTypeId: clinicAt.id, note: null },
        { weekIndex: 0, dayOfWeek: d, personId: people[13].id, assignmentTypeId: clinicAt.id, note: null }
      );
    }

    await prisma.scheduleTemplate.create({
      data: {
        name: '1-Week Clinic Baseline',
        description: 'Mon–Fri core outpatient clinic coverage.',
        cycleWeeks: 1,
        entries: { create: entries1w },
      },
    });

    console.log('Seeded 2 Milestone 2 Rotation Templates.');
  }
}

// Allow running directly via CLI (`tsx server/seed.ts` or `node dist/server/seed.js`)
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('seed.ts') || process.argv[1].endsWith('seed.js'));

if (isDirectRun) {
  runSeed()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (err) => {
      console.error('Seed failed:', err);
      await prisma.$disconnect();
      process.exit(1);
    });
}

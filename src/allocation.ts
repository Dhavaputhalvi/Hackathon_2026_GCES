export type StudentCategory = 'Regular' | 'Lateral entry' | 'Transfer'

export interface DepartmentConfig {
  code: string
  name: string
  year: string
  regularCount: number
  lateralCount: number
  transferCount: number
}

export interface HallConfig {
  id: string
  name: string
  capacity: number
}

export interface ExamConfig {
  collegeCode: string
  batch: string
  examName: string
  examDate: string
  session: string
  departments: DepartmentConfig[]
  halls: HallConfig[]
  staffNames: string[]
  invigilatorsPerHall: number
}

export interface Student {
  registerNumber: string
  collegeCode: string
  batch: string
  departmentCode: string
  departmentName: string
  year: string
  studentNumber: number
  category: StudentCategory
}

export interface Allocation {
  student: Student
  hallId: string
  hallName: string
  seatNumber: number
  row: number
  column: number
}

export interface UnallocatedStudent {
  student: Student
  reason: string
}

export interface AllocationConflict {
  id: string
  registerNumber?: string
  message: string
  severity: 'warning' | 'error'
}

export interface HallStaffAssignment {
  hallId: string
  hallName: string
  staffNames: string[]
  required: number
  status: 'Staffed' | 'Understaffed'
}

export interface AllocationResult {
  students: Student[]
  allocations: Allocation[]
  unallocated: UnallocatedStudent[]
  missingRegisterNumbers: string[]
  conflicts: AllocationConflict[]
  staffAssignments: HallStaffAssignment[]
  totalSeats: number
  occupiedSeats: number
  availableSeats: number
  totalStaff: number
  allocatedStaff: number
  unallocatedStaffNames: string[]
}

const columnsPerHall = 6

const categoryDefinitions: {
  category: StudentCategory
  countKey: 'regularCount' | 'lateralCount' | 'transferCount'
  firstNumber: number
  lastNumber: number
}[] = [
  { category: 'Regular', countKey: 'regularCount', firstNumber: 1, lastNumber: 50 },
  { category: 'Lateral entry', countKey: 'lateralCount', firstNumber: 701, lastNumber: 710 },
  { category: 'Transfer', countKey: 'transferCount', firstNumber: 301, lastNumber: 310 },
]

export function buildStudents(config: ExamConfig): Student[] {
  const students: Student[] = []

  for (const definition of categoryDefinitions) {
    for (const department of config.departments) {
      const requestedCount = Math.max(0, Math.floor(department[definition.countKey]))
      const count = Math.min(requestedCount, definition.lastNumber - definition.firstNumber + 1)

      for (let index = 0; index < count; index += 1) {
        const studentNumber = definition.firstNumber + index
        students.push({
          registerNumber: `${config.collegeCode}${config.batch}${department.code}${String(studentNumber).padStart(3, '0')}`,
          collegeCode: config.collegeCode,
          batch: config.batch,
          departmentCode: department.code,
          departmentName: department.name,
          year: department.year,
          studentNumber,
          category: definition.category,
        })
      }
    }
  }

  return students
}

export function parseRegisterNumber(registerNumber: string, config: ExamConfig): Student | undefined {
  if (!/^\d{12}$/.test(registerNumber)) return undefined

  const collegeCode = registerNumber.slice(0, 4)
  const batch = registerNumber.slice(4, 6)
  const departmentCode = registerNumber.slice(6, 9)
  const studentNumber = Number(registerNumber.slice(9, 12))
  const department = config.departments.find((item) => item.code === departmentCode)
  if (collegeCode !== config.collegeCode || batch !== config.batch || !department) return undefined

  const category = categoryDefinitions.find(
    (definition) => studentNumber >= definition.firstNumber && studentNumber <= definition.lastNumber,
  )?.category
  if (!category) return undefined

  return {
    registerNumber,
    collegeCode,
    batch,
    departmentCode,
    departmentName: department.name,
    year: department.year,
    studentNumber,
    category,
  }
}

function parsedMissingNumbers(input: string): string[] {
  return [...new Set(input.split(',').map((value) => value.trim()).filter(Boolean))]
}

export function createEmptyResult(config: ExamConfig, missingInput = ''): AllocationResult {
  const students = buildStudents(config)
  const missingRegisterNumbers = parsedMissingNumbers(missingInput)
  const missing = new Set(missingRegisterNumbers)
  const registeredNumbers = new Set(students.map((student) => student.registerNumber))
  const conflicts: AllocationConflict[] = missingRegisterNumbers
    .filter((registerNumber) => !registeredNumbers.has(registerNumber))
    .map((registerNumber) => ({
      id: `missing-${registerNumber}`,
      registerNumber,
      message: 'This number is not in the configured register ranges.',
      severity: 'warning',
    }))

  const totalSeats = config.halls.reduce((total, hall) => total + Math.max(0, hall.capacity), 0)
  const staffNames = [...new Set(config.staffNames.map((name) => name.trim()).filter(Boolean))]

  return {
    students,
    allocations: [],
    unallocated: students
      .filter((student) => !missing.has(student.registerNumber))
      .map((student) => ({ student, reason: 'Not allocated yet.' })),
    missingRegisterNumbers,
    conflicts,
    staffAssignments: [],
    totalSeats,
    occupiedSeats: 0,
    availableSeats: totalSeats,
    totalStaff: staffNames.length,
    allocatedStaff: 0,
    unallocatedStaffNames: staffNames,
  }
}

function hasSameDepartmentNeighbor(candidate: Allocation, allocations: Allocation[]): boolean {
  return allocations.some(
    (allocation) =>
      allocation.hallId === candidate.hallId &&
      allocation.student.departmentCode === candidate.student.departmentCode &&
      Math.abs(allocation.row - candidate.row) + Math.abs(allocation.column - candidate.column) === 1,
  )
}

export function allocateExam(
  config: ExamConfig,
  missingInput = '',
  existingAllocations: Allocation[] = [],
): AllocationResult {
  const emptyResult = createEmptyResult(config, missingInput)
  const conflicts = [...emptyResult.conflicts]
  const occupiedSeatKeys = new Set<string>()
  const allocatedRegisterNumbers = new Set<string>()
  const allocations: Allocation[] = []
  const registeredStudents = new Map(emptyResult.students.map((student) => [student.registerNumber, student]))
  const missing = new Set(emptyResult.missingRegisterNumbers)

  for (const allocation of existingAllocations) {
    const student = registeredStudents.get(allocation.student.registerNumber)
    const hall = config.halls.find((item) => item.id === allocation.hallId)
    if (!student || missing.has(student.registerNumber)) {
      conflicts.push({
        id: `stale-student-${allocation.student.registerNumber}`,
        registerNumber: allocation.student.registerNumber,
        message: 'A previous seat was released because this student is no longer eligible for the current roster.',
        severity: 'warning',
      })
      continue
    }
    if (!hall || allocation.seatNumber < 1 || allocation.seatNumber > hall.capacity) {
      conflicts.push({
        id: `stale-seat-${allocation.hallId}-${allocation.seatNumber}`,
        registerNumber: student.registerNumber,
        message: 'A previous seat was released because its hall or seat is no longer available.',
        severity: 'warning',
      })
      continue
    }
    if (allocatedRegisterNumbers.has(student.registerNumber)) {
      conflicts.push({
        id: `duplicate-student-${student.registerNumber}`,
        registerNumber: student.registerNumber,
        message: 'A duplicate previous assignment was ignored; each student can hold one seat.',
        severity: 'error',
      })
      continue
    }
    const key = `${allocation.hallId}:${allocation.seatNumber}`
    if (occupiedSeatKeys.has(key)) {
      conflicts.push({
        id: `occupied-${key}`,
        registerNumber: allocation.student.registerNumber,
        message: `${allocation.hallName}, seat ${allocation.seatNumber} is already occupied.`,
        severity: 'error',
      })
      continue
    }
    const normalizedAllocation: Allocation = {
      ...allocation,
      student,
      hallName: hall.name,
      row: Math.floor((allocation.seatNumber - 1) / columnsPerHall) + 1,
      column: ((allocation.seatNumber - 1) % columnsPerHall) + 1,
    }
    allocations.push(normalizedAllocation)
    occupiedSeatKeys.add(key)
    allocatedRegisterNumbers.add(student.registerNumber)
  }

  const seats = config.halls.flatMap((hall) =>
    Array.from({ length: Math.max(0, Math.floor(hall.capacity)) }, (_, index) => ({
      hallId: hall.id,
      hallName: hall.name,
      seatNumber: index + 1,
      row: Math.floor(index / columnsPerHall) + 1,
      column: (index % columnsPerHall) + 1,
    })),
  )
  const unallocated: UnallocatedStudent[] = []
  for (const student of emptyResult.students) {
    if (missing.has(student.registerNumber) || allocatedRegisterNumbers.has(student.registerNumber)) continue

    const availableSeats = seats.filter(
      (seat) => !occupiedSeatKeys.has(`${seat.hallId}:${seat.seatNumber}`),
    )
    const preferredSeat = availableSeats.find((seat) =>
      !hasSameDepartmentNeighbor({ ...seat, student }, allocations),
    )
    const seat = preferredSeat ?? availableSeats[0]

    if (!seat) {
      unallocated.push({ student, reason: 'No available seat remains in the configured halls.' })
      continue
    }

    const allocation: Allocation = { ...seat, student }
    if (!preferredSeat) {
      conflicts.push({
        id: `adjacency-${student.registerNumber}`,
        registerNumber: student.registerNumber,
        message: `Department separation could not be maintained for ${student.registerNumber}; the next available seat was used.`,
        severity: 'warning',
      })
    }
    allocations.push(allocation)
    occupiedSeatKeys.add(`${seat.hallId}:${seat.seatNumber}`)
    allocatedRegisterNumbers.add(student.registerNumber)
  }

  const staffNames = [...new Set(config.staffNames.map((name) => name.trim()).filter(Boolean))]
  const requiredPerHall = Math.max(0, Math.floor(config.invigilatorsPerHall))
  let nextStaffIndex = 0
  const activeHalls = config.halls.filter((hall) =>
    allocations.some((allocation) => allocation.hallId === hall.id),
  )
  const staffAssignments = activeHalls.map((hall): HallStaffAssignment => {
    const assignedStaff = staffNames.slice(nextStaffIndex, nextStaffIndex + requiredPerHall)
    nextStaffIndex += assignedStaff.length
    const status = assignedStaff.length >= requiredPerHall ? 'Staffed' : 'Understaffed'

    if (status === 'Understaffed') {
      conflicts.push({
        id: `staff-${hall.id}`,
        message: `${hall.name} needs ${requiredPerHall} invigilators but has ${assignedStaff.length}.`,
        severity: 'error',
      })
    }

    return {
      hallId: hall.id,
      hallName: hall.name,
      staffNames: assignedStaff,
      required: requiredPerHall,
      status,
    }
  })

  const occupiedSeats = occupiedSeatKeys.size
  const totalSeats = emptyResult.totalSeats
  const usedStaffCount = staffAssignments.reduce((total, assignment) => total + assignment.staffNames.length, 0)

  return {
    ...emptyResult,
    allocations,
    unallocated,
    conflicts,
    staffAssignments,
    totalSeats,
    occupiedSeats,
    availableSeats: Math.max(0, totalSeats - occupiedSeats),
    allocatedStaff: usedStaffCount,
    unallocatedStaffNames: staffNames.slice(usedStaffCount),
  }
}
import { describe, expect, it } from 'vitest'
import { allocateExam, buildStudents, type ExamConfig } from './allocation'

const config: ExamConfig = {
  collegeCode: '8301',
  batch: '23',
  examName: 'Semester Examination',
  examDate: '2026-10-12',
  session: 'FN',
  departments: [
    { code: '104', name: 'Computer Science', year: 'III', regularCount: 3, lateralCount: 1, transferCount: 1 },
    { code: '105', name: 'Electronics', year: 'III', regularCount: 1, lateralCount: 0, transferCount: 0 },
  ],
  halls: [{ id: 'hall-1', name: 'Hall 01', capacity: 8 }],
  staffNames: ['Anita', 'Ravi'],
  invigilatorsPerHall: 2,
}

describe('exam allocation', () => {
  it('generates register numbers and follows category priority', () => {
    const students = buildStudents(config)

    expect(students.map((student) => student.category)).toEqual([
      'Regular', 'Regular', 'Regular', 'Regular', 'Lateral entry', 'Transfer',
    ])
    expect(students[0].registerNumber).toBe('830123104001')
    expect(students[4].registerNumber).toBe('830123104701')
    expect(students[5].registerNumber).toBe('830123104301')
  })

  it('excludes every listed missing register number from seat assignment', () => {
    const result = allocateExam(config, '830123104002, 830123104005, 830123104002')

    expect(result.missingRegisterNumbers).toEqual(['830123104002', '830123104005'])
    expect(result.allocations.some((allocation) => allocation.student.registerNumber === '830123104002')).toBe(false)
    expect(result.unallocated.some(({ student }) => student.registerNumber === '830123104002')).toBe(false)
  })

  it('does not reuse an occupied seat or allocate the same student twice', () => {
    const firstRun = allocateExam(config)
    const existing = firstRun.allocations[0]
    const secondRun = allocateExam(config, '', [existing])
    const distinctSeats = new Set(secondRun.allocations.map(({ hallId, seatNumber }) => `${hallId}:${seatNumber}`))

    expect(secondRun.allocations.filter(({ student }) => student.registerNumber === existing.student.registerNumber)).toHaveLength(1)
    expect(secondRun.allocations.filter(({ hallId, seatNumber }) => hallId === existing.hallId && seatNumber === existing.seatNumber)).toHaveLength(1)
    expect(distinctSeats.size).toBe(secondRun.allocations.length)
  })

  it('moves a student to another seat when a saved allocation claims an occupied seat', () => {
    const firstRun = allocateExam(config)
    const [first, second] = firstRun.allocations
    const collidingSeat = { ...second, hallId: first.hallId, hallName: first.hallName, seatNumber: first.seatNumber }
    const result = allocateExam(config, '', [first, collidingSeat])
    const secondStudentSeats = result.allocations.filter(({ student }) => student.registerNumber === second.student.registerNumber)

    expect(secondStudentSeats).toHaveLength(1)
    expect(secondStudentSeats[0].seatNumber).not.toBe(first.seatNumber)
    expect(result.conflicts.some(({ message }) => message.includes('already occupied'))).toBe(true)
  })

  it('releases a persisted seat when the student becomes excluded', () => {
    const firstRun = allocateExam(config)
    const existing = firstRun.allocations[0]
    const nextRun = allocateExam(config, existing.student.registerNumber, [existing])

    expect(nextRun.allocations.some(({ student }) => student.registerNumber === existing.student.registerNumber)).toBe(false)
    expect(nextRun.conflicts.some(({ message }) => message.includes('no longer eligible'))).toBe(true)
  })

  it('reports capacity and invigilator shortages without dropping students silently', () => {
    const smallConfig = {
      ...config,
      halls: [{ id: 'small', name: 'Small hall', capacity: 1 }],
      staffNames: [],
    }
    const result = allocateExam(smallConfig)

    expect(result.allocatedStaff).toBe(0)
    expect(result.staffAssignments[0].status).toBe('Understaffed')
    expect(result.unallocated.length).toBe(result.students.length - 1)
    expect(result.conflicts.some(({ message }) => message.includes('invigilators'))).toBe(true)
  })
})
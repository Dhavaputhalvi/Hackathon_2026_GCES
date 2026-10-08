import { useEffect, useState, type SetStateAction } from 'react'
import {
  ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, Building2,
  CalendarDays, Check, ChevronDown, CircleAlert, ClipboardList, DoorOpen,
  FileDown, FileSpreadsheet, GraduationCap, LayoutDashboard, LockKeyhole,
  Plus, Printer, Search, ShieldCheck, SlidersHorizontal, Sparkles, Users, X,
} from 'lucide-react'
import {
  allocateExam, parseRegisterNumber, type Allocation, type AllocationResult,
  type DepartmentConfig, type ExamConfig, type HallConfig, type StudentCategory,
} from './allocation'
import './App.css'

type StaffView = 'Overview' | 'Configuration' | 'Hall map' | 'Staffing' | 'Reports'
type Portal = 'staff' | 'student'

const defaultConfig: ExamConfig = {
  collegeCode: '8301', batch: '23', examName: 'End Semester Examination',
  examDate: '2026-10-12', session: 'FN',
  departments: [
    { code: '104', name: 'Computer Science', year: 'III', regularCount: 18, lateralCount: 4, transferCount: 2 },
    { code: '105', name: 'Electronics', year: 'III', regularCount: 16, lateralCount: 3, transferCount: 1 },
    { code: '106', name: 'Electrical', year: 'II', regularCount: 14, lateralCount: 2, transferCount: 0 },
  ],
  halls: [
    { id: 'hall-1', name: 'Hall 01', capacity: 24 },
    { id: 'hall-2', name: 'Hall 02', capacity: 24 },
    { id: 'hall-3', name: 'Hall 03', capacity: 24 },
  ],
  staffNames: ['Anita Raj', 'Ravi Kumar', 'Meera S', 'Karthik V', 'Divya N', 'Sanjay P', 'Farah A', 'Bala M'],
  invigilatorsPerHall: 2,
}

const reports = [
  { id: 'hall', title: 'Hall-wise seating plan', description: 'Seat numbers grouped by examination room.', icon: Building2 },
  { id: 'students', title: 'Student allocation', description: 'Register number, department and assigned seat.', icon: GraduationCap },
  { id: 'staff', title: 'Invigilator roster', description: 'Hall assignments and staffing coverage.', icon: Users },
  { id: 'conflicts', title: 'Conflict report', description: 'Seat, staffing and validation warnings.', icon: CircleAlert },
  { id: 'unallocated', title: 'Unallocated students', description: 'Students without a valid seat assignment.', icon: ClipboardList },
  { id: 'missing', title: 'Missing register numbers', description: 'Numbers excluded by the committee.', icon: Search },
] as const

function readStored<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) as T : fallback
  } catch {
    return fallback
  }
}

function csvCell(value: string | number): string {
  const text = String(value).replace(/^[=+@-]/, "'$&")
  return `"${text.replaceAll('"', '""')}"`
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function formatDate(date: string): string {
  if (!date) return 'Date not set'
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${date}T00:00:00`))
}

function CategoryPill({ category }: { category: StudentCategory }) {
  const tone = category === 'Regular' ? 'category-regular' : category === 'Transfer' ? 'category-transfer' : 'category-lateral'
  return <span className={`category-pill ${tone}`}>{category}</span>
}

function SeatCell({ allocation, seatNumber }: { allocation?: Allocation; seatNumber: number }) {
  return <div className={`seat-cell ${allocation ? 'seat-occupied' : 'seat-empty'}`} title={allocation?.student.registerNumber ?? `Seat ${seatNumber} available`}>
    <span className="seat-number">{String(seatNumber).padStart(2, '0')}</span>
    {allocation ? <span className="seat-register">{allocation.student.registerNumber.slice(-3)}</span> : <span className="seat-dash">—</span>}
  </div>
}

function App() {
  const [config, setConfigRaw] = useState<ExamConfig>(() => readStored('exam-config', defaultConfig))
  const [missingInput, setMissingInput] = useState(() => readStored('exam-missing', ''))
  const [result, setResult] = useState<AllocationResult | null>(() => readStored('exam-allocation', null))
  const [activeView, setActiveView] = useState<StaffView>('Overview')
  const [portal, setPortal] = useState<Portal>('staff')
  const [studentRegister, setStudentRegister] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => localStorage.setItem('exam-config', JSON.stringify(config)), [config])
  useEffect(() => localStorage.setItem('exam-missing', JSON.stringify(missingInput)), [missingInput])
  useEffect(() => {
    if (result) localStorage.setItem('exam-allocation', JSON.stringify(result))
    else localStorage.removeItem('exam-allocation')
  }, [result])

  function updateConfig(updater: SetStateAction<ExamConfig>) {
    setConfigRaw(updater)
    setResult(null)
  }

  function updateMissingInput(value: string) {
    setMissingInput(value)
    setResult(null)
  }

  const departmentCount = config.departments.length
  const totalStudents = config.departments.reduce((sum, item) => sum + item.regularCount + item.lateralCount + item.transferCount, 0)
  const totalSeats = config.halls.reduce((sum, hall) => sum + hall.capacity, 0)
  const allocations = result?.allocations ?? []
  const allocatedCount = allocations.length
  const excludedCount = result?.students.filter((item) => result.missingRegisterNumbers.includes(item.registerNumber)).length ?? 0
  const unallocatedCount = result?.unallocated.length ?? totalStudents - excludedCount
  const occupiedSeatCount = result?.occupiedSeats ?? 0
  const availableSeatCount = result?.availableSeats ?? totalSeats
  const conflictCount = result?.conflicts.length ?? 0
  const staffCount = [...new Set(config.staffNames.map((name) => name.trim()).filter(Boolean))].length
  const allocatedStaffCount = result?.allocatedStaff ?? 0
  const hallFillRatio = totalSeats ? Math.round((occupiedSeatCount / totalSeats) * 100) : 0
  const student = parseRegisterNumber(studentRegister.trim(), config)
  const studentAllocation = allocations.find((item) => item.student.registerNumber === studentRegister.trim())
  const studentExcluded = result?.missingRegisterNumbers.includes(studentRegister.trim()) ?? false

  function updateDepartment<K extends keyof DepartmentConfig>(index: number, key: K, value: DepartmentConfig[K]) {
    updateConfig((current) => ({ ...current, departments: current.departments.map((item, i) => i === index ? { ...item, [key]: value } : item) }))
  }

  function updateHall<K extends keyof HallConfig>(index: number, key: K, value: HallConfig[K]) {
    updateConfig((current) => ({ ...current, halls: current.halls.map((item, i) => i === index ? { ...item, [key]: value } : item) }))
  }

  function runAllocation() {
    const next = allocateExam(config, missingInput, result?.allocations ?? [])
    setResult(next)
    setActiveView('Overview')
    setNotice(`${next.allocations.length} seats assigned. ${next.unallocated.length} students remain unallocated.`)
  }

  function exportReport(reportId: (typeof reports)[number]['id']) {
    if (!result) {
      setNotice('Generate a seating arrangement before exporting reports.')
      return
    }
    const rows: (string | number)[][] = []
    if (reportId === 'hall') {
      rows.push(['Hall', 'Seat', 'Register number', 'Department', 'Category'])
      for (const hall of config.halls) for (const item of allocations.filter((allocation) => allocation.hallId === hall.id)) rows.push([hall.name, item.seatNumber, item.student.registerNumber, item.student.departmentName, item.student.category])
    } else if (reportId === 'students') {
      rows.push(['Register number', 'Department', 'Year', 'Category', 'Hall', 'Seat', 'Status'])
      for (const item of allocations) rows.push([item.student.registerNumber, item.student.departmentName, item.student.year, item.student.category, item.hallName, item.seatNumber, 'Allocated'])
    } else if (reportId === 'staff') {
      rows.push(['Hall', 'Invigilators', 'Required', 'Status'])
      for (const item of result.staffAssignments) rows.push([item.hallName, item.staffNames.join('; '), item.required, item.status])
    } else if (reportId === 'conflicts') {
      rows.push(['Severity', 'Register number', 'Conflict'])
      for (const item of result.conflicts) rows.push([item.severity, item.registerNumber ?? '', item.message])
    } else if (reportId === 'unallocated') {
      rows.push(['Register number', 'Department', 'Category', 'Reason'])
      for (const item of result.unallocated) rows.push([item.student.registerNumber, item.student.departmentName, item.student.category, item.reason])
    } else {
      rows.push(['Register number', 'Status'])
      for (const number of result.missingRegisterNumbers) rows.push([number, 'Excluded from allocation'])
    }
    downloadCsv(`${reportId}-exam-allocation.csv`, rows)
  }

  const navItems: { label: StaffView; icon: typeof LayoutDashboard }[] = [
    { label: 'Overview', icon: LayoutDashboard }, { label: 'Configuration', icon: SlidersHorizontal },
    { label: 'Hall map', icon: DoorOpen }, { label: 'Staffing', icon: Users }, { label: 'Reports', icon: FileSpreadsheet },
  ]

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#overview" onClick={(event) => { event.preventDefault(); setPortal('staff'); setActiveView('Overview') }}>
        <span className="brand-mark"><span /><span /><span /><span /></span><span className="brand-name">seat<span>wise</span></span>
      </a>
      <div className="exam-context"><span className="context-label">EXAMINATION DESK</span><span className="context-divider" /><span className="context-exam">{config.examName}</span><ChevronDown size={14} /></div>
      <div className="topbar-actions"><span className="local-badge"><span /> LOCAL MODE</span><button className="icon-button top-print" type="button" title="Print current view" onClick={() => window.print()}><Printer size={17} /></button><span className="avatar">CW</span><span className="user-name">Exam Committee</span></div>
    </header>

    <div className="workspace">
      <aside className="sidebar">
        <div className="sidebar-section-label">PORTAL</div>
        <div className="portal-switch" role="group" aria-label="Select portal">
          <button className={`portal-option ${portal === 'staff' ? 'selected' : ''}`} type="button" onClick={() => setPortal('staff')}><ShieldCheck size={16} /> Staff</button>
          <button className={`portal-option ${portal === 'student' ? 'selected' : ''}`} type="button" onClick={() => setPortal('student')}><GraduationCap size={16} /> Student</button>
        </div>
        {portal === 'staff' ? <>
          <div className="sidebar-section-label nav-label">WORKSPACE</div>
          <nav className="primary-nav" aria-label="Staff workspace">{navItems.map(({ label, icon: Icon }) => <button key={label} className={`nav-item ${activeView === label ? 'nav-active' : ''}`} type="button" onClick={() => setActiveView(label)}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{label === 'Reports' && conflictCount > 0 && <span className="nav-count">{conflictCount}</span>}</button>)}</nav>
          <div className="sidebar-bottom"><div className="exam-status-card"><span className="status-card-icon"><CalendarDays size={17} /></span><span className="status-card-label">NEXT EXAM</span><strong>{formatDate(config.examDate)}</strong><span>{config.session === 'FN' ? 'Forenoon session' : 'Afternoon session'}</span></div><button type="button" className="sidebar-link" onClick={() => setNotice('Changes are saved in this browser on this device.')}><LockKeyhole size={15} /> Secure local workspace</button></div>
        </> : <div className="student-sidebar-note"><span className="student-side-icon"><GraduationCap size={18} /></span><strong>Student portal</strong><span>Find your hall and seat using your register number.</span></div>}
      </aside>

      <main className="main-content">
        {portal === 'staff' ? <>
          <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> {activeView === 'Overview' ? 'EXAM OPERATIONS' : 'ALLOCATION WORKSPACE'}</div><h1>{activeView === 'Overview' ? 'Good morning, committee.' : activeView}</h1><p className="page-subtitle">{activeView === 'Overview' ? 'Your seating plan is one clear view away.' : `${config.examName} · ${formatDate(config.examDate)} · ${config.session}`}</p></div><div className="heading-actions"><button className="button-secondary" type="button" onClick={() => { setActiveView('Configuration'); setNotice('') }}><SlidersHorizontal size={16} /> Configure exam</button><button className="button-primary" type="button" onClick={runAllocation}><Sparkles size={16} /> Generate allocation</button></div></div>
          {notice && <div className="notice-banner" role="status"><Check size={16} /> {notice}<button type="button" title="Dismiss notice" onClick={() => setNotice('')}><X size={15} /></button></div>}

          {activeView === 'Overview' && <>
            <section className="metrics-grid" aria-label="Exam allocation summary">
              <article className="metric-card metric-hero"><div className="metric-topline"><span className="metric-icon"><GraduationCap size={18} /></span><span className="metric-overline">STUDENT ROSTER</span><ArrowUpRight size={15} className="metric-arrow" /></div><div className="metric-value">{totalStudents.toLocaleString('en-IN')}</div><div className="metric-caption">registered students across {departmentCount} departments</div><div className="metric-footer"><span>{allocatedCount.toLocaleString('en-IN')} allocated</span><span>{unallocatedCount.toLocaleString('en-IN')} unallocated</span></div></article>
              <article className="metric-card"><div className="metric-topline"><span className="metric-icon metric-icon-green"><DoorOpen size={18} /></span><span className="metric-overline">SEAT CAPACITY</span></div><div className="metric-value">{occupiedSeatCount}<span className="metric-denominator"> / {totalSeats}</span></div><div className="metric-caption">seats occupied · {availableSeatCount} available</div><progress className="capacity-progress" value={hallFillRatio} max="100" aria-label={`${hallFillRatio}% of seats occupied`} /></article>
              <article className="metric-card"><div className="metric-topline"><span className="metric-icon metric-icon-amber"><Users size={18} /></span><span className="metric-overline">INVIGILATORS</span></div><div className="metric-value">{allocatedStaffCount}<span className="metric-denominator"> / {staffCount}</span></div><div className="metric-caption">allocated across {result?.staffAssignments.length ?? 0} active halls</div><div className="metric-footer metric-footer-staff"><span>{Math.max(staffCount - allocatedStaffCount, 0)} available</span><span>Target: {config.invigilatorsPerHall} / hall</span></div></article>
              <article className={`metric-card ${conflictCount ? 'metric-card-alert' : ''}`}><div className="metric-topline"><span className="metric-icon metric-icon-alert"><CircleAlert size={18} /></span><span className="metric-overline">CONFLICTS</span></div><div className="metric-value">{conflictCount}<span className="metric-denominator"> {conflictCount === 1 ? 'flag' : 'flags'}</span></div><div className="metric-caption">{conflictCount ? 'review before publishing the plan' : 'no conflicts in the current plan'}</div><button className="text-action" type="button" onClick={() => setActiveView('Reports')}>Review report <ArrowRight size={14} /></button></article>
            </section>
            <section className="content-grid">
              <div className="panel hall-overview-panel"><div className="panel-heading"><div><span className="panel-kicker">ROOM STATUS</span><h2>Hall overview</h2></div><button type="button" className="inline-link" onClick={() => setActiveView('Hall map')}>Open hall map <ArrowRight size={14} /></button></div><div className="hall-list">
                {config.halls.map((hall, index) => { const hallAllocations = allocations.filter((item) => item.hallId === hall.id); const fill = hall.capacity ? Math.round(hallAllocations.length / hall.capacity * 100) : 0; const staffing = result?.staffAssignments.find((item) => item.hallId === hall.id); return <button className="hall-row" key={hall.id} type="button" onClick={() => setActiveView('Hall map')}><span className={`hall-marker hall-marker-${index % 3}`}><DoorOpen size={17} /></span><span className="hall-info"><strong>{hall.name}</strong><small>{staffing ? `${staffing.staffNames.length} invigilators assigned` : 'No invigilators assigned yet'}</small></span><span className="hall-capacity"><span>{hallAllocations.length} <small>/ {hall.capacity}</small></span><progress value={fill} max="100" aria-label={`${hall.name}: ${fill}% occupied`} /></span><span className={`hall-state ${staffing?.status === 'Understaffed' ? 'state-warning' : hallAllocations.length ? 'state-active' : 'state-idle'}`}><i />{staffing?.status ?? (hallAllocations.length ? 'Active' : 'Ready')}</span><ArrowRight size={15} className="hall-row-arrow" /></button> })}
              </div><div className="hall-panel-footer"><span>{config.halls.length} rooms configured</span><span>{totalSeats} total seats</span><button type="button" onClick={() => setActiveView('Configuration')}>Edit rooms <ArrowRight size={13} /></button></div></div>
              <div className="panel category-panel"><div className="panel-heading"><div><span className="panel-kicker">REGISTER SEQUENCE</span><h2>Student mix</h2></div><button className="icon-button" title="Edit departments" type="button" onClick={() => setActiveView('Configuration')}><ArrowUpRight size={16} /></button></div><div className="category-total"><strong>{totalStudents}</strong><span>students in the configured sequence</span></div>
                {(['Regular', 'Lateral entry', 'Transfer'] as StudentCategory[]).map((category) => { const count = result ? result.students.filter((item) => item.category === category && !result.missingRegisterNumbers.includes(item.registerNumber)).length : config.departments.reduce((sum, item) => sum + (category === 'Regular' ? item.regularCount : category === 'Lateral entry' ? item.lateralCount : item.transferCount), 0); const ratio = totalStudents ? Math.round(count / totalStudents * 100) : 0; return <div className="category-row" key={category}><div className="category-row-top"><CategoryPill category={category} /><span>{count} <small>students</small></span></div><progress className={`category-progress ${category === 'Regular' ? 'fill-regular' : category === 'Transfer' ? 'fill-transfer' : 'fill-lateral'}`} value={ratio} max="100" /></div> })}
                <div className="sequence-note"><span className="sequence-number">01</span><span>Allocation sequence</span><strong>Regular → Lateral → Transfer</strong></div>
              </div>
            </section>
            <section className="panel recent-panel"><div className="panel-heading"><div><span className="panel-kicker">LIVE SEATING PLAN</span><h2>Latest seat assignments</h2></div><button type="button" className="inline-link" onClick={() => exportReport('students')}>Download student list <ArrowDownToLine size={14} /></button></div>
              {allocations.length ? <div className="table-wrap"><table><thead><tr><th>REGISTER NUMBER</th><th>DEPARTMENT</th><th>YEAR</th><th>CATEGORY</th><th>HALL</th><th>SEAT</th></tr></thead><tbody>{allocations.slice(0, 7).map((item) => <tr key={item.student.registerNumber}><td className="register-cell">{item.student.registerNumber}</td><td>{item.student.departmentName}</td><td>{item.student.year}</td><td><CategoryPill category={item.student.category} /></td><td>{item.hallName}</td><td><span className="seat-chip">{String(item.seatNumber).padStart(2, '0')}</span></td></tr>)}</tbody></table></div> : <div className="empty-table"><span className="empty-icon"><ClipboardList size={21} /></span><strong>No seating plan yet</strong><span>Generate the arrangement to see student assignments here.</span><button type="button" className="button-secondary" onClick={runAllocation}><Sparkles size={15} /> Generate first plan</button></div>}
            </section>
          </>}

          {activeView === 'Configuration' && <section className="configuration-layout">
            <div className="panel config-panel"><div className="panel-heading"><div><span className="panel-kicker">01 / EXAM DETAILS</span><h2>Examination setup</h2></div><span className="config-step">GENERAL</span></div><div className="form-grid">
              <label className="field field-wide"><span>Examination name</span><input value={config.examName} onChange={(event) => updateConfig((current) => ({ ...current, examName: event.target.value }))} /></label>
              <label className="field"><span>Exam date</span><input type="date" value={config.examDate} onChange={(event) => updateConfig((current) => ({ ...current, examDate: event.target.value }))} /></label>
              <label className="field"><span>Session</span><select value={config.session} onChange={(event) => updateConfig((current) => ({ ...current, session: event.target.value }))}><option value="FN">Forenoon (FN)</option><option value="AN">Afternoon (AN)</option></select></label>
              <label className="field"><span>College code</span><input maxLength={4} value={config.collegeCode} onChange={(event) => updateConfig((current) => ({ ...current, collegeCode: event.target.value.replace(/\D/g, '').slice(0, 4) }))} /></label>
              <label className="field"><span>Admission batch</span><input maxLength={2} value={config.batch} onChange={(event) => updateConfig((current) => ({ ...current, batch: event.target.value.replace(/\D/g, '').slice(0, 2) }))} /></label>
            </div></div>
            <div className="panel config-panel"><div className="panel-heading"><div><span className="panel-kicker">02 / STUDENT ROSTER</span><h2>Departments & cohorts</h2></div><span className="config-total">{totalStudents} students</span></div><div className="config-table-wrap"><table className="config-table"><thead><tr><th>DEPARTMENT</th><th>CODE</th><th>YEAR</th><th>REGULAR</th><th>LATERAL</th><th>TRANSFER</th><th /></tr></thead><tbody>
              {config.departments.map((item, index) => <tr key={`${item.code}-${index}`}><td><input aria-label="Department name" value={item.name} onChange={(event) => updateDepartment(index, 'name', event.target.value)} /></td><td><input aria-label="Department code" maxLength={3} value={item.code} onChange={(event) => updateDepartment(index, 'code', event.target.value.replace(/\D/g, '').slice(0, 3))} /></td><td><input aria-label="Year" value={item.year} onChange={(event) => updateDepartment(index, 'year', event.target.value)} /></td>{(['regularCount', 'lateralCount', 'transferCount'] as const).map((key) => <td key={key}><input type="number" min="0" max={key === 'regularCount' ? 50 : 10} aria-label={`${key} count`} value={item[key]} onChange={(event) => updateDepartment(index, key, Math.max(0, Number(event.target.value)))} /></td>)}<td><button className="icon-button remove-button" type="button" title={`Remove ${item.name}`} onClick={() => updateConfig((current) => ({ ...current, departments: current.departments.filter((_, i) => i !== index) }))}><X size={15} /></button></td></tr>)}
            </tbody></table></div><div className="config-footer"><button className="button-quiet" type="button" onClick={() => updateConfig((current) => ({ ...current, departments: [...current.departments, { code: String(107 + current.departments.length).padStart(3, '0'), name: 'New department', year: 'I', regularCount: 0, lateralCount: 0, transferCount: 0 }] }))}><Plus size={15} /> Add department</button><span>Category ranges: regular 001–050 · lateral 701–710 · transfer 301–310</span></div></div>
            <div className="panel config-panel"><div className="panel-heading"><div><span className="panel-kicker">03 / EXAM VENUES</span><h2>Halls & seating capacity</h2></div><span className="config-total">{totalSeats} seats</span></div><div className="hall-config-list">{config.halls.map((hall, index) => <div className="hall-config-row" key={hall.id}><span className={`hall-marker hall-marker-${index % 3}`}><DoorOpen size={16} /></span><label className="field"><span>Hall name</span><input value={hall.name} onChange={(event) => updateHall(index, 'name', event.target.value)} /></label><label className="field capacity-field"><span>Seat capacity</span><input type="number" min="1" value={hall.capacity} onChange={(event) => updateHall(index, 'capacity', Math.max(1, Number(event.target.value)))} /></label><button className="icon-button remove-button" type="button" title={`Remove ${hall.name}`} onClick={() => updateConfig((current) => ({ ...current, halls: current.halls.filter((_, i) => i !== index) }))}><X size={15} /></button></div>)}</div><div className="config-footer"><button className="button-quiet" type="button" onClick={() => updateConfig((current) => ({ ...current, halls: [...current.halls, { id: `hall-${Date.now()}`, name: `Hall ${String(current.halls.length + 1).padStart(2, '0')}`, capacity: 24 }] }))}><Plus size={15} /> Add hall</button><span>Seat map uses 6 columns per row.</span></div></div>
            <div className="panel config-panel"><div className="panel-heading"><div><span className="panel-kicker">04 / ROSTER EXCEPTIONS</span><h2>Missing register numbers</h2></div><span className="config-step">OPTIONAL</span></div><p className="panel-help">Enter deleted or absent register numbers. They will be excluded from the generated seating plan.</p><label className="field"><span>Comma-separated register numbers</span><textarea rows={3} placeholder="830123104005, 830123104017, 830123104045" value={missingInput} onChange={(event) => updateMissingInput(event.target.value)} /></label><div className="missing-help"><CircleAlert size={15} /> Each number is checked against the configured college, batch, department and category ranges.</div></div>
            <div className="panel config-panel"><div className="panel-heading"><div><span className="panel-kicker">05 / INVIGILATORS</span><h2>Staff availability</h2></div><span className="config-total">{staffCount} listed</span></div><label className="field staff-count-field"><span>Invigilators required per active hall</span><input type="number" min="0" value={config.invigilatorsPerHall} onChange={(event) => updateConfig((current) => ({ ...current, invigilatorsPerHall: Math.max(0, Number(event.target.value)) }))} /></label><label className="field"><span>Staff names · one per line</span><textarea rows={5} value={config.staffNames.join('\n')} onChange={(event) => updateConfig((current) => ({ ...current, staffNames: event.target.value.split('\n') }))} /></label></div>
            <div className="config-action-bar"><span><BadgeCheck size={16} /> Configuration saves automatically on this device.</span><button className="button-primary" type="button" onClick={runAllocation}><Sparkles size={16} /> Generate seating plan</button></div>
          </section>}

          {activeView === 'Hall map' && <section className="hall-map-page"><div className="section-toolbar"><div className="legend"><span><i className="legend-occupied" /> Allocated</span><span><i className="legend-available" /> Available</span></div><div className="toolbar-actions"><button type="button" className="button-secondary" onClick={() => window.print()}><Printer size={15} /> Print hall plan</button><button type="button" className="button-secondary" onClick={() => exportReport('hall')}><ArrowDownToLine size={15} /> Download CSV</button></div></div>
            {config.halls.map((hall, index) => { const inHall = allocations.filter((item) => item.hallId === hall.id); const bySeat = new Map(inHall.map((item) => [item.seatNumber, item])); return <article className="panel hall-map-panel" key={hall.id}><div className="hall-map-heading"><div className={`hall-marker hall-marker-${index % 3}`}><DoorOpen size={18} /></div><div><span className="panel-kicker">EXAMINATION HALL</span><h2>{hall.name}</h2></div><div className="hall-map-count"><strong>{inHall.length}</strong><span> / {hall.capacity} seats</span></div></div><div className="seat-grid">{Array.from({ length: hall.capacity }, (_, seatIndex) => <SeatCell key={seatIndex + 1} seatNumber={seatIndex + 1} allocation={bySeat.get(seatIndex + 1)} />)}</div><div className="hall-map-footer"><span>Front of room</span><span className="front-indicator" /></div></article> })}
          </section>}

          {activeView === 'Staffing' && <section className="panel staffing-panel"><div className="panel-heading"><div><span className="panel-kicker">HALL-WISE COVERAGE</span><h2>Invigilator assignments</h2></div><button type="button" className="button-secondary" onClick={() => exportReport('staff')}><ArrowDownToLine size={15} /> Download roster</button></div>
            {result?.staffAssignments.length ? <div className="staffing-table-wrap"><table><thead><tr><th>HALL</th><th>ASSIGNED STAFF</th><th>REQUIRED</th><th>STATUS</th></tr></thead><tbody>{result.staffAssignments.map((item) => <tr key={item.hallId}><td><strong>{item.hallName}</strong></td><td>{item.staffNames.length ? <div className="staff-name-list">{item.staffNames.map((name) => <span className="staff-name-chip" key={name}><span>{name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>{name}</span>)}</div> : <span className="muted-text">No staff assigned</span>}</td><td>{item.staffNames.length} / {item.required}</td><td><span className={`hall-state ${item.status === 'Understaffed' ? 'state-warning' : 'state-active'}`}><i />{item.status}</span></td></tr>)}</tbody></table></div> : <div className="empty-table"><span className="empty-icon"><Users size={20} /></span><strong>No staffing plan yet</strong><span>Generate an allocation to assign invigilators to active halls.</span></div>}
            <div className="staff-availability"><div><span className="panel-kicker">STAFF POOL</span><h3>Unallocated staff</h3></div><span className="available-staff-count">{result?.unallocatedStaffNames.length ?? staffCount} available</span></div><div className="available-staff-list">{(result?.unallocatedStaffNames ?? config.staffNames).filter(Boolean).map((name) => <span className="available-staff-chip" key={name}><span>{name.trim().split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>{name}</span>)}{!(result?.unallocatedStaffNames ?? config.staffNames).filter(Boolean).length && <span className="muted-text">All listed staff have been assigned.</span>}</div>
          </section>}

          {activeView === 'Reports' && <section className="panel reports-panel"><div className="panel-heading"><div><span className="panel-kicker">EXPORT CENTER</span><h2>Exam reports</h2></div><span className="report-status"><span /> {result ? 'PLAN READY' : 'AWAITING ALLOCATION'}</span></div><p className="panel-help report-intro">Export an operational CSV or print a hall plan and use your browser’s “Save as PDF” option.</p><div className="report-list">{reports.map(({ id, title, description, icon: Icon }) => <div className="report-row" key={id}><span className="report-icon"><Icon size={18} /></span><span className="report-info"><strong>{title}</strong><small>{description}</small></span><button type="button" className="icon-button report-download" title={`Download ${title} as CSV`} onClick={() => exportReport(id)}><FileDown size={17} /></button></div>)}</div><div className="report-print-row"><span><Printer size={17} /><span><strong>Student seat receipt</strong><small>Look up a student in the Student portal and print their receipt to PDF.</small></span></span><button className="button-secondary" type="button" onClick={() => setPortal('student')}>Open student portal <ArrowRight size={14} /></button></div></section>}
        </> : <section className="student-page">
          <div className="student-page-heading"><button className="back-link" type="button" onClick={() => setPortal('staff')}><ArrowLeft size={15} /> Staff portal</button><span className="student-kicker"><span /> STUDENT ACCESS</span><h1>Your exam seat,<br /><em>in one search.</em></h1><p>Enter your register number to view your examination hall and assigned seat.</p></div>
          <div className="student-search-panel"><label htmlFor="student-register">REGISTER NUMBER</label><div className="student-search-input"><input id="student-register" inputMode="numeric" autoComplete="off" placeholder={`${config.collegeCode}${config.batch}104001`} value={studentRegister} onChange={(event) => setStudentRegister(event.target.value.replace(/\D/g, '').slice(0, 12))} /><Search size={18} /></div><span className="search-hint">12 digits · college, batch, department and roll number</span></div>
          {studentRegister && (student ? studentAllocation ? <article className="student-receipt"><div className="receipt-top"><span className="receipt-brand"><span className="brand-mark"><span /><span /><span /><span /></span> seatwise</span><span className="receipt-status"><Check size={13} /> ALLOCATED</span></div><div className="receipt-title"><span>EXAMINATION HALL TICKET</span><h2>{config.examName}</h2><p>{formatDate(config.examDate)} <i /> {config.session === 'FN' ? 'Forenoon session' : 'Afternoon session'}</p></div><div className="receipt-seat"><span>YOUR SEAT</span><strong>{String(studentAllocation.seatNumber).padStart(2, '0')}</strong><b>{studentAllocation.hallName}</b></div><div className="receipt-details"><div><span>REGISTER NUMBER</span><strong>{student.registerNumber}</strong></div><div><span>DEPARTMENT</span><strong>{student.departmentName}</strong></div><div><span>YEAR / BATCH</span><strong>{student.year} year · 20{student.batch}</strong></div><div><span>CATEGORY</span><strong><CategoryPill category={student.category} /></strong></div></div><div className="receipt-footer"><span><ShieldCheck size={15} /> Verified allocation</span><button className="button-primary" type="button" onClick={() => window.print()}><Printer size={15} /> Print / Save PDF</button></div></article> : studentExcluded ? <div className="student-result student-result-warning"><CircleAlert size={20} /><div><strong>No allocation for this register number</strong><span>The committee marked this register number as missing or excluded.</span></div></div> : <div className="student-result student-result-warning"><CircleAlert size={20} /><div><strong>Seat not assigned yet</strong><span>Your register number is valid, but no allocation is available for this examination.</span></div></div> : studentRegister.length === 12 ? <div className="student-result student-result-warning"><CircleAlert size={20} /><div><strong>Register number not recognized</strong><span>Check the college code, admission batch, department code and student number.</span></div></div> : null)}
          {!result && <div className="student-no-plan"><ClipboardList size={17} /> The committee has not published a seating plan yet.</div>}
        </section>}
        <footer className="app-footer"><span><span className="footer-brand-dot" /> Seatwise · {config.examName}</span><span>Saved on this device <i /> No API contract connected</span></footer>
      </main>
    </div>
  </div>
}

export default App

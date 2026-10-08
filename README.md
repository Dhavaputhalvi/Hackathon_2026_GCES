# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  # Seatwise | Exam Hall Allocation

  React + TypeScript + Tailwind CSS interface for the Code Warriors exam-allocation hackathon. The seating engine is handwritten and does not use an optimization or AI library.

  ## Run locally

  Requirements: Node.js 22.12+ and npm.

  ```sh
  npm install
  npm run dev
  ```

  Useful checks:

  ```sh
  npm test
  npm run lint
  npm run build
  ```

  ## Use the demo

  The staff portal opens with a sample roster, three departments, three halls and eight invigilators. Edit exam details, student counts, halls, staff or comma-separated missing register numbers under **Configuration**, then choose **Generate allocation**. The overview, visual hall map, staffing view and CSV report center show the resulting plan.

  The student portal looks up a register number and displays its hall ticket. Use **Print / Save PDF** and select “Save as PDF” in the browser’s print dialog. Staff can download hall, student, invigilator, conflict, unallocated and missing-number reports as CSV.

  Register numbers use `CCCCBBDEENNN`: four college digits, two batch digits, three department digits and a three-digit student number. The allocator processes regular students (001–050), lateral entries (701–710), then transfers (301–310). It skips excluded numbers, never reuses occupied seats, prefers seats without an adjacent student from the same department, and reports capacity, staffing and invalid-roster conflicts.

  ## Integration boundary

  This is a browser-only prototype. Configuration and the generated plan are saved in local storage on the current device; there is no authentication, shared database or API connection. The locked `openapi.yaml` was not provided, so no contract file or guessed API endpoints were created. The allocation module can be connected to that contract when it is available.

  Vite dev/preview responses set a CSP that permits the local development client and its blob worker. `public/_headers` provides a stricter CSP plus basic security headers for static hosts that support the `_headers` convention. CSV is the operational download format; PDF output uses the browser print dialog.
export default defineConfig([

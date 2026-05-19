# 🗺️ Student Progress Tracker — Development Roadmap & Technical Specifications

This master backlog organizes all outstanding tasks, bugs, optimizations, and feature requests identified across the product lifecycle. It serves as the master technical checklist during development.

---

## 🏗️ Module 1: Code Quality, Performance, & Architecture

### 1.1 Code Cleanup & Refactoring
* **Objective:** Eliminate dead code, redundancies, and duplication to ensure the application remains clean, lightweight, and maintainable.
* **Action Items:**
  - [ ] **Redundancy Audit:** Scan the codebase for redundant functions, utility modules, and calculations. Consolidate them into unified, reusable utility scripts.
  - [ ] **Dead Code Removal:** Locate and purge "hanging" variables, uncalled functions, unused state objects, or legacy boilerplate code that increases bundle size.
  - [ ] **De-duplication:** Consolidate repeated UI components or logic structures (e.g., duplicated rendering of student profiles or attendance metrics).

### 1.2 Performance & Startup Optimization
* **Objective:** Optimize perceived and actual load time during application startup.
* **Action Items:**
  - [ ] **Lazy Loading:** Identify heavy assets, non-essential components, or deep configurations that are loaded on the initial paint. Defer loading for these resources.
  - [ ] **Background Processing:** Move background configuration fetches, system checks, or heavy translation assets to background worker processes or asynchronous execution.
  - [ ] **Smarter Initialization:** Allow the UI shell to render immediately while the user chooses initial options (e.g., school year or student configurations) before firing major queries.

### 1.3 Goals & Data Persistence
* **Objective:** Ensure student-specific goals are persistently stored across sessions.
* **Action Items:**
  - [ ] **Data Store Integration:** Implement write-back logic to ensure that modifications to student goals are written directly back to the database or Excel/Google Sheets backend.
  - [ ] **State Sync:** Keep the local UI state and local memory synchronized with the backend data store so changes persist across page reloads.

---

## 📊 Module 2: Daily Log & UI Enhancements

### 2.1 Spelling & Label Correction
* **Objective:** Correct typos in critical user-facing dashboards.
* **Action Items:**
  - [ ] **Grades Label Fix:** Correct the spelling in the **Graph of Grades Summary** from "GARDES" to "**GRADES**".

### 2.2 Color-Coded Grades in Daily Log
* **Objective:** Provide immediate visual cues for student performance.
* **Action Items:**
  - [ ] **Semantic Color Palette:** Assign contrasting color profiles to grades within the Daily Log (e.g., Green 🟢 for excellent/passing performance, Yellow 🟡 for passing/borderline, Red 🔴 for critical support needed) using a professional, modern palette.

### 2.3 Redesigned Participation Graph
* **Objective:** Clarify daily classroom engagement trends.
* **Action Items:**
  - [ ] **Trend Clarification:** Redesign the Participation Graph to illustrate daily trends clearly.
  - [ ] **Percentage-Based Axes:** Ensure that all vertical axes and metrics reflect percentage-based values ($0\% - 100\%$) rather than raw scores.

### 2.4 Foldable & Expandable Daily Log
* **Objective:** Improve visual hierarchy and declutter the dashboard.
* **Action Items:**
  - [ ] **Collapsible Component:** Wrap the Daily Log data into a foldable component with simple collapsible state tracking.
  - [ ] **Interactive Toggles:** Add clean interactive toggle icons (▼ for expanded, ▶ for collapsed) for intuitive, slick navigation.

### 2.5 Participation Grid Fallback Behavior
* **Objective:** Cleanly handle missing data entries in the Daily Log.
* **Action Items:**
  - [ ] **Missing Entry Fallback:** If letters/values representing daily participation are blank or missing, render the target cell as a blank or light grey box to distinguish it clearly from active records.

### 2.6 Attendance Bar Redesign
* **Objective:** Improve readability and remove color-based confusion.
* **Action Items:**
  - [ ] **Layout Spacing:** Add generous margin and padding spaces between text labels and the visual segments of the bar.
  - [ ] **Distinct Color Mapping:** Standardize status indicators:
    - 🟢 **Present** (using a distinct shade to avoid clashing with grade metrics)
    - 🔴 **Absent**
    - 🟡 **Tardy**
  - [ ] **Legend Realignment:** Render small, clear legend indicators underneath the bar with clear spacing to keep elements structured.

---

## 🌍 Module 3: Localization, Responsiveness, & Email Formats

### 3.1 Persistent Student-Level Language Configurations
* **Objective:** Transition from manual, page-by-page translation to stored user preferences.
* **Action Items:**
  - [ ] **Configuration Save:** Add a persistent `preferred_language` attribute to student profiles in the database.
  - [ ] **Localization UI:** Add easy-to-use Spanish and Arabic check-boxes/switches next to student names on control dashboards (e.g., next to Caro, Athena).
  - [ ] **Auto-Select:** Automatically format generated reports or emails into the selected home language on save without further manual action.

### 3.2 Extended Language Support & Comment Translation
* **Objective:** Fully support Spanish- and Arabic-speaking families.
* **Action Items:**
  - [ ] **Arabic Templates:** Add comprehensive localization templates for Arabic translations alongside existing Spanish formatting.
  - [ ] **Comment Translation Integration:** Ensure that customized written feedback or comments are automatically routed through the translation system (rather than just translating structural template code).
  - [ ] **Fixed Top Header:** Fix the translation button located at the top of the email template. Ensure it is click-receptive, handles event bubbling properly, and correctly toggles translation modes.

### 3.3 Email Template Responsiveness
* **Objective:** Ensure emails scale gracefully across high-resolution laptop screens and mobile phones.
* **Action Items:**
  - [ ] **Layout Constraints:** Redesign fluid container widths. Replace restrictive max-widths that cause narrow, elongated scrolling behavior on laptop displays.
  - [ ] **Responsive Typography & Spacing:** Use fluid typography and flexible HTML tables/grids to ensure text wraps nicely across both vertical phone screens and wider desktop environments.

### 3.4 Web Application Mobile Responsiveness 📱
* **Objective:** Optimize the main application dashboard and control panels for responsive mobile layouts.
* **Action Items:**
  - [ ] **Fluid Grid Systems:** Refactor the primary CSS layouts to use CSS Grid and Flexbox with media queries, enabling smooth column collapsing on mobile screens.
  - [ ] **Touch-Friendly Controls:** Ensure all dropdowns, input elements, buttons, and expandable tabs have comfortable touch targets (minimum $44\text{px} \times 44\text{px}$).
  - [ ] **Responsive Navigation & Sidebar:** Implement a mobile burger-menu or collapsible navigation drawer that hides on mobile and toggles smoothly, preventing visual overlap with dashboard contents.
  - [ ] **Viewport Scaling:** Configure correct meta-tags (`viewport`) to prevent standard mobile zooming and clipping behaviors.

---

## 📈 Module 4: Proposed Feature Expansion & Strategy

### 4.1 Percentage-Based Metrics Integration
* **Objective:** Transition raw data counts into intuitive, weighted percentages.
* **Action Items:**
  - [ ] **Formula Standardization:** Apply a standard calculation formula across all graphs:
    $$\text{Metric \%} = \left( \frac{\text{Earned Points}}{\text{Total Possible Points}} \right) \times 100$$
  - [ ] **Summary Cards:** Update summary cards to persistently display and retain percentage scores rather than raw, unweighted points.

### 4.2 School Roster Export & External Email Distribution
* **Objective:** Easily export complete student profiles to internal school administrators.
* **Action Items:**
  - [ ] **PDF/Print Layout:** Construct a highly legible, print-friendly grid page displaying only **Student Name** and **Current Letter Grade**.
  - [ ] **Distribution Service:** Integrate an email forwarding handler to route this generated list directly to administrative emails on command.

---

## 🛠️ Architecture & Placement Discussion

To design the **School Roster Export & Distribution Report (Module 4.2)** optimally, please let us know your preferences on these architectural decisions:

### 1. Dashboard Placement (Where should the export button go?)
* **Option A (Highly Visible):** Add an **"Export School Roster"** action button directly in the header of the primary "Activity Tracker" dashboard.
* **Option B (Dedicated Space):** Create a clean **"School Admin & Exports"** page or tab where bulk reports, PDF layouts, and school-wide distribution configs live together.
* *Which option matches your routine workflow better?*

### 2. The "Activity Report" Rename
Your notes request a more intuitive title for the Activity Report:
* Would titles like **"Weekly Student Progress Summary"** or **"Student Engagement & Progress Report"** feel clearer and more professional?

# Biweekly Report Comment Generator

A powerful Google Apps Script web application designed to automate the generation of student progress comments and parent emails based on spreadsheet data.

## 🚀 Features
- **Auto-Generation**: Creates personalized student and parent comments based on attendance, exit tickets, and participation data.
- **Participation Logic**: Intelligent percentage calculation (base 6 slots, excused 'X' support).
- **Absence Filtering**: Automatically ignores grades and exit tickets for days marked as "absent".
- **Email Integration**: Sends formatted HTML progress reports directly to parents.
- **Print Ready**: Generates printable biweekly progress report cards.
- **Auto-Detection**: Automatically identifies columns for names, grades, and comments.

---

## 🛠️ Quick Start

### 1. Prerequisites
- [Node.js](https://nodejs.org/) installed.
- Access to a Google Workspace account.

### 2. Setup
Run the following command to install dependencies, authenticate with Google, and link your Apps Script project:
```bash
npm run setup
```

### 3. Deployment
To push your local changes and update the live web app:
```bash
npm run deploy
```

---

## 🧪 Testing

The project includes a comprehensive backend test suite in `Test.gs`.

### Running Tests
1. Run the test command:
   ```bash
   npm run test
   ```
2. In the Apps Script editor that opens:
   - Select **`runAllTests`** from the function dropdown.
   - Click **▶ Run**.
3. View the **Execution Log** at the bottom to see results.

---

## 📂 Project Structure
- `google-apps-script/`: Core application code.
  - `Code.gs`: Backend logic (data processing, email sending, routing).
  - `Index.html`: Frontend UI — Teacher dashboard.
  - `StudentCode.gs`: Backend logic for the Student Portal (authentication, grades, goals, reflections, help requests, exit ticket upload).
  - `StudentPortal.html`: Frontend UI — Student dashboard.
  - `Test.gs`: Unit tests for teacher backend functions.
  - `StudentTest.gs`: Unit tests for student portal backend functions.
  - `DEPLOY.md`: Detailed deployment guide.
- `package.json`: Project scripts and CLI configurations.
- `workflow.md`: Internal logic workflow documentation.

---

## ⌨️ Available Commands

| Command | Description |
|:---|:---|
| `npm run setup` | One-time environment setup and Google authentication. |
| `npm run push` | Uploads local `Code.gs` and `Index.html` to Google. |
| `npm run deploy` | Pushes code and creates a new versioned deployment. |
| `npm run test` | Pushes code and opens the test runner in your browser. |
| `npm run open` | Opens the Apps Script editor in your browser. |
| `npm run open:web` | Opens the currently deployed live web app URL. |
| `npm run open:dev` | Opens the **Test Deployment** (updates instantly when you push). |
| `npm run status` | Shows which files will be pushed. |
| `npm run logs` | Shows recent execution logs from Google Cloud. |

---

## 🛠️ Development & Testing Workflow

To safely test changes without affecting the live version used by teachers:

1. **Test Deployment (Dev URL)**:
   - Run `npm run push` to upload your code to Google Apps Script.
   - Run `npm run open:dev` to view your changes instantly. This URL ends in `/dev` and only you have access to it.
2. **Deploying to Production**:
   - Once tested, run `npm run deploy` to update the live version (`/exec`).
   - **Password Protection**: The deployment script will prompt you for a password to prevent accidental overwrites. This password is securely stored in a `.env` file in the root directory:
     ```env
     DEPLOY_PASSWORD=sonic
     ```
     *(This file is ignored by Git, keeping your password out of version control.)*

---

## ⚖️ Privacy & Security (FERPA)
This tool is built with data privacy in mind:
- **Execute as User**: The script runs under the account of the teacher using it.
- **Local Access**: It can only access spreadsheets the teacher already has permission to view.
- **No Third Parties**: Data never leaves the Google Workspace environment.
- **Student Data Isolation**: The Student Portal enforces server-side filtering — students can only see their own data.

---

## 🎓 Student Portal

The Student Portal is a companion web app that gives students a personalized dashboard to view their progress, interact with lessons, and communicate with their teacher.

### Accessing the Student Portal

Students open the same deployed web app URL with `?portal=student` appended:
```
https://script.google.com/.../exec?portal=student
```

Students must be logged into a Google account that is registered in the **Student Roster** sheet.

### Student Portal Features

| Feature | Description |
|:---|:---|
| **📊 Current Grade** | Color-coded letter grade and percentage display. |
| **📅 Recent Activity** | Attendance, exit ticket scores, and daily grades for the last 2 weeks. |
| **💬 Teacher Messages** | Personal messages and action items from the teacher. |
| **🔔 Announcements** | Class-wide announcements from the teacher. |
| **📚 Current Lesson** | Today's lesson topic with links to Desmos, GeoGebra, and other interactive tools. |
| **📐 Math Resources** | A library of videos, worksheets, and guides organized by topic. |
| **🎯 Personal Goals** | Students set and track their own math goals. |
| **📝 Self-Reflection Journal** | Weekly reflections on what they learned and what was challenging. |
| **📸 Exit Ticket Upload** | Upload photos of exit tickets directly to Google Drive. |
| **💡 Ask for Help** | Submit questions to the teacher and view replies. |
| **🏆 Encouragement & Badges** | Motivational messages and achievement badges based on performance. |

### Setting Up the Student Portal

1. **Create the Student Roster sheet** in your spreadsheet with these columns:

   | A: Name | B: Email | C: Class/Period | D: SpreadsheetID |
   |:---|:---|:---|:---|
   | Jane Doe | jane@gmail.com | Period 3 | *(your spreadsheet ID)* |

2. **Set the Script Property**: In the Apps Script editor, go to **Project Settings → Script Properties** and add:
   - Key: `STUDENT_ROSTER_SSID`
   - Value: Your spreadsheet ID containing the Student Roster sheet

3. **Create optional sheets** (the portal works without them, showing empty states):
   - **Student Messages**: `StudentEmail | Date | Message | From`
   - **Announcements**: `Date | Title | Body | Active (TRUE/FALSE)`
   - **Lessons**: `Date | Topic | Description | DesmosLink | GeoGebraLink | Resources`
   - **Resources**: `Topic | Title | URL | Type (video/worksheet/guide)`
   - **Goals**: *(auto-created when a student adds their first goal)*
   - **Reflections**: *(auto-created when a student writes their first reflection)*
   - **Help Requests**: *(auto-created when a student submits their first question)*

4. **Deploy**: Run `npm run deploy` to update the live web app. Share the student URL with your students.

### How Students Sign In

- Students log in with their **Google account** (the same email listed in the Student Roster).
- If using `blueprintfellows.org` workspace, the teacher/admin creates accounts in Google Admin Console.
- Students can also use personal Gmail addresses — just add them to the Student Roster.
- **Password changes**: Students manage their password through standard Google account settings.

### Testing the Student Portal

1. Run `npm run push` to upload the code.
2. In the Apps Script editor, select **`runStudentTests`** from the function dropdown.
3. Click **▶ Run** and check the Execution Log for results.

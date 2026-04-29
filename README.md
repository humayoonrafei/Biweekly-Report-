# Biweekly Report Comment Generator

A powerful Google Apps Script web application designed to automate the generation of student progress comments and parent emails based on spreadsheet data.

## 🚀 Features
- **Auto-Generation**: Creates personalized student and parent comments based on attendance, exit tickets, and participation data.
- **Participation Logic**: Intelligent percentage calculation (base 6 slots, excused 'X' support).
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
  - `Code.gs`: Backend logic (data processing, email sending).
  - `Index.html`: Frontend UI (React-like dashboard).
  - `Test.gs`: Unit tests for backend functions.
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
| `npm run open:web` | Opens the currently deployed web app URL. |
| `npm run status` | Shows which files will be pushed. |
| `npm run logs` | Shows recent execution logs from Google Cloud. |

---

## ⚖️ Privacy & Security (FERPA)
This tool is built with data privacy in mind:
- **Execute as User**: The script runs under the account of the teacher using it.
- **Local Access**: It can only access spreadsheets the teacher already has permission to view.
- **No Third Parties**: Data never leaves the Google Workspace environment.

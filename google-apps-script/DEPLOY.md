# Deployment Guide — Biweekly Comment Generator Web App

This guide walks you through deploying the Comment Generator as a Google Apps Script web app.

---

## 🚀 Quick Start (Automated with clasp)

### One-Time Setup

```bash
npm run setup
```

This will:
1. Install Google's `clasp` CLI
2. Open your browser to authenticate with Google
3. Enable the Apps Script API
4. Link (or create) the Apps Script project
5. Push your code automatically

### After Setup — Your Daily Workflow

| Command | What it does |
|---------|-------------|
| `npm run push` | Upload `Code.gs` + `Index.html` to Apps Script |
| `npm run deploy` | Push code + create a new versioned deployment |
| `npm run open` | Open the Apps Script editor in your browser |
| `npm run open:web` | Open the deployed web app URL |
| `npm run status` | Show which files will be pushed |
| `npm run logs` | View recent script execution logs |

**Typical edit-deploy cycle:**

```bash
# 1. Edit Code.gs or Index.html locally
# 2. Push and deploy in one command:
npm run deploy
```

That's it! No copy-pasting, no manual deploys. ✅

---

## 📋 Manual Setup (Alternative)

If you prefer not to use clasp, you can still deploy manually:

### Step 1: Create the Apps Script Project

1. Go to [script.google.com](https://script.google.com)
2. Click **"New project"**
3. Name it: `Biweekly Comment Generator`

### Step 2: Add the Code

#### Replace `Code.gs`
1. You'll see a default file called `Code.gs` in the editor
2. **Select all** the existing code and **delete** it
3. Copy the entire contents of `Code.gs` from this folder and **paste** it in

#### Add `Index.html`
1. Click the **+** button next to "Files" → select **"HTML"**
2. Name it: `Index` (it will automatically add `.html`)
3. Copy the entire contents of `Index.html` from this folder and **paste** it in

### Step 3: Deploy as a Web App

1. Click the **"Deploy"** button (top right) → **"New deployment"**
2. Click the gear icon ⚙️ next to "Select type" → choose **"Web app"**
3. Fill in:
   - **Description:** `Biweekly Comment Generator v1.0`
   - **Execute as:** `User accessing the web app` ← IMPORTANT for FERPA
   - **Who has access:** `Anyone within [Your Organization]`
4. Click **"Deploy"**
5. Click **"Authorize access"** when prompted
   - Choose your school Google account
   - Click **"Allow"**
6. Copy the **Web app URL** — this is what you share with teachers!

---

## Step 4: Share with Teachers

Send teachers the web app URL. That's it! No installation needed.

Example message:
> **Biweekly Comment Generator is ready!**
>
> Open this link: [paste URL]
>
> To use it:
> 1. Open your biweekly report spreadsheet
> 2. Copy the Spreadsheet ID from the URL (the long string after `/d/`)
> 3. Paste it into the tool and click "Preview Students"
> 4. Click "Generate & Write Comments"
>
> If your spreadsheet has a different column layout, click "Column Mapping" to adjust.

---

## Important Notes

### FERPA & Security
- **"Execute as: User accessing the web app"** means each teacher runs the script under their own Google account. The script can only access spreadsheets that teacher already has permission to access.
- No data leaves Google's servers. Everything runs within Google Workspace.
- No AI or third-party services are involved.

### Updating the App (with clasp)
```bash
# Edit Code.gs or Index.html locally, then:
npm run deploy
```

### Updating the App (manually)
1. Edit the code in the Apps Script editor
2. Click **"Deploy"** → **"Manage deployments"**
3. Click the ✏️ edit icon on your deployment
4. Change **"Version"** to **"New version"**
5. Click **"Deploy"**

### Troubleshooting

| Issue | Solution |
|---|---|
| "Access denied" | Make sure you deployed with "Anyone within [Your Organization]" |
| "Cannot find spreadsheet" | Check that the Spreadsheet ID is correct and the teacher has access |
| "Sheet tab not found" | Verify the Sheet Tab Name matches exactly (case-sensitive) |
| Script takes too long | Google Apps Script has a 6-minute timeout. For very large sheets (500+ students), process in batches |
| `clasp push` fails | Run `npm run setup` again to re-authenticate |

---

## Where to Find the Spreadsheet ID

From any Google Sheets URL:

```
https://docs.google.com/spreadsheets/d/THIS_IS_THE_SPREADSHEET_ID/edit
                                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
```

Copy just the ID between `/d/` and `/edit`.

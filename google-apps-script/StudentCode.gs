/**
 * StudentCode.gs — Backend for the Student Portal
 *
 * All functions enforce per-student data isolation:
 *   - The logged-in student's email is checked against the "Student Roster" sheet.
 *   - Only that student's own data is ever returned.
 *
 * Required Sheets (teacher creates these in the same spreadsheet):
 *   - "Student Roster"   : columns  A=Name, B=Email, C=Class/Period, D=SpreadsheetID
 *   - "Student Messages"  : columns  A=StudentEmail, B=Date, C=Message, D=From
 *   - "Announcements"     : columns  A=Date, B=Title, C=Body, D=Active (TRUE/FALSE)
 *   - "Goals"             : columns  A=StudentEmail, B=Goal, C=TargetDate, D=Status, E=Created
 *   - "Reflections"       : columns  A=StudentEmail, B=Date, C=Reflection
 *   - "Help Requests"     : columns  A=StudentEmail, B=Date, C=Question, D=Status, E=TeacherReply
 *   - "Lessons"           : columns  A=Date, B=Topic, C=Description, D=DesmosLink, E=GeoGebraLink, F=Resources
 *   - "Resources"         : columns  A=Topic, B=Title, C=URL, D=Type (video/worksheet/guide)
 *
 * FERPA-safe: Runs entirely within Google Workspace. No external APIs.
 */

// ─── Configuration ───
// The STUDENT_ROSTER_SPREADSHEET_ID is stored in Script Properties.
// Teacher sets it once via the admin dashboard or manually in:
//   File → Project properties → Script properties → STUDENT_ROSTER_SSID
function getStudentRosterSpreadsheetId_() {
  var props = PropertiesService.getScriptProperties();
  return props.getProperty('STUDENT_ROSTER_SSID') || '';
}

// ─── Authentication & Student Lookup ───

/**
 * Authenticates the current user and returns their student profile.
 * Returns { authenticated, student: { name, email, class, spreadsheetId } }
 */
function studentAuth() {
  try {
    var email = Session.getActiveUser().getEmail();
    if (!email) {
      return { authenticated: false, error: 'Could not determine your email. Please ensure you are logged in with a Google account.' };
    }

    var student = lookupStudentByEmail_(email.toLowerCase().trim());
    if (!student) {
      return { authenticated: false, error: 'Your email (' + email + ') is not registered in the Student Roster. Please contact your teacher.' };
    }

    return { authenticated: true, student: student };
  } catch (e) {
    return { authenticated: false, error: 'Authentication error: ' + e.message };
  }
}

/**
 * Looks up a student in the "Student Roster" sheet by email.
 * Returns { name, email, class, spreadsheetId } or null.
 */
function lookupStudentByEmail_(email) {
  var ssId = getStudentRosterSpreadsheetId_();
  if (!ssId) return null;

  try {
    var ss = SpreadsheetApp.openById(ssId);
    var sheet = ss.getSheetByName('Student Roster');
    if (!sheet) return null;

    var data = sheet.getDataRange().getValues();
    // Skip header row
    for (var i = 1; i < data.length; i++) {
      var rowEmail = String(data[i][1] || '').toLowerCase().trim();
      if (rowEmail === email) {
        return {
          name: String(data[i][0] || '').trim(),
          email: rowEmail,
          class: String(data[i][2] || '').trim(),
          spreadsheetId: String(data[i][3] || '').trim() || ssId
        };
      }
    }
    return null;
  } catch (e) {
    Logger.log('lookupStudentByEmail_ error: ' + e.message);
    return null;
  }
}

/**
 * Helper: opens the roster spreadsheet or returns null.
 */
function getRosterSpreadsheet_() {
  var ssId = getStudentRosterSpreadsheetId_();
  if (!ssId) return null;
  try {
    return SpreadsheetApp.openById(ssId);
  } catch (e) {
    return null;
  }
}

/**
 * Helper: returns the logged-in student's email, lowercased.
 */
function getStudentEmail_() {
  try {
    return (Session.getActiveUser().getEmail() || '').toLowerCase().trim();
  } catch (e) {
    return '';
  }
}

// ─── Current Grade ───

/**
 * Returns the student's current letter grade and percentage.
 */
function getStudentGrade() {
  try {
    var email = getStudentEmail_();
    if (!email) return { error: 'Not authenticated.' };

    var student = lookupStudentByEmail_(email);
    if (!student) return { error: 'Student not found.' };

    var ss = SpreadsheetApp.openById(student.spreadsheetId);
    var sheets = ss.getSheets();

    // Find the grades sheet
    var gradesSheet = null;
    for (var i = 0; i < sheets.length; i++) {
      var name = sheets[i].getName().toLowerCase();
      if (name.indexOf('grade') > -1 && name.indexOf('calc') > -1) {
        gradesSheet = sheets[i];
        break;
      }
    }
    if (!gradesSheet) {
      for (var j = 0; j < sheets.length; j++) {
        if (sheets[j].getName().toLowerCase().indexOf('grade') > -1) {
          gradesSheet = sheets[j];
          break;
        }
      }
    }
    if (!gradesSheet) return { error: 'Grades sheet not found.' };

    // Find the student row by name (header row 3, data starts row 4)
    var lastRow = gradesSheet.getLastRow();
    var lastCol = gradesSheet.getLastColumn();
    if (lastRow < 4) return { error: 'No grade data available.' };

    var data = gradesSheet.getRange(4, 1, lastRow - 3, lastCol).getValues();
    var headers = gradesSheet.getRange(3, 1, 1, lastCol).getValues()[0];

    // Find name column (usually B=1) and grade column
    var nameColIdx = 1; // Column B (0-indexed)
    var gradeColIdx = -1;
    for (var c = headers.length - 1; c >= 0; c--) {
      var h = String(headers[c] || '').toLowerCase();
      if (h.indexOf('letter') > -1 || h.indexOf('grade') > -1 || h.indexOf('overall') > -1) {
        gradeColIdx = c;
        break;
      }
    }

    // Look for the student by matching name
    var studentName = student.name.toLowerCase();
    for (var r = 0; r < data.length; r++) {
      var rowName = String(data[r][nameColIdx] || '').toLowerCase().trim();
      if (rowName && (rowName === studentName || rowName.indexOf(studentName) > -1 || studentName.indexOf(rowName) > -1)) {
        var letterGrade = gradeColIdx >= 0 ? String(data[r][gradeColIdx] || '') : 'N/A';
        // Try to find a percentage column nearby
        var pctGrade = '';
        for (var pc = gradeColIdx - 1; pc >= Math.max(0, gradeColIdx - 3); pc--) {
          var val = data[r][pc];
          if (typeof val === 'number' && val >= 0 && val <= 100) {
            pctGrade = Math.round(val) + '%';
            break;
          }
        }
        return {
          name: student.name,
          letterGrade: letterGrade,
          percentage: pctGrade,
          class: student.class
        };
      }
    }

    return { error: 'Could not find your grade record. Please contact your teacher.' };
  } catch (e) {
    return { error: 'Error loading grade: ' + e.message };
  }
}

// ─── Recent Activity (Last 2 Weeks) ───

/**
 * Returns the student's activity data for the last 14 days.
 */
function getStudentActivity() {
  try {
    var email = getStudentEmail_();
    if (!email) return { error: 'Not authenticated.' };

    var student = lookupStudentByEmail_(email);
    if (!student) return { error: 'Student not found.' };

    var ss = SpreadsheetApp.openById(student.spreadsheetId);
    var sheets = ss.getSheets();

    // Find activity/data sheet
    var actSheet = null;
    for (var i = 0; i < sheets.length; i++) {
      var name = sheets[i].getName().toLowerCase();
      if (name.indexOf('activity') > -1 || name.indexOf('data') > -1 || name.indexOf('daily') > -1) {
        actSheet = sheets[i];
        break;
      }
    }
    if (!actSheet) return { error: 'Activity sheet not found.' };

    var lastRow = actSheet.getLastRow();
    var lastCol = actSheet.getLastColumn();
    if (lastRow < 5 || lastCol < 5) return { error: 'Not enough activity data.' };

    // Date row is row 4
    var dateRow = actSheet.getRange(4, 1, 1, lastCol).getDisplayValues()[0];
    var allData = actSheet.getRange(5, 1, lastRow - 4, lastCol).getValues();

    // Calculate date range: last 14 days
    var now = new Date();
    var twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Find date columns in range
    var dateCols = [];
    for (var c = 0; c < dateRow.length; c++) {
      var parsed = parseDateStr(dateRow[c]);
      if (!parsed) continue;
      if (parsed.dateObj >= twoWeeksAgo && parsed.dateObj <= now) {
        dateCols.push({ colIdx: c, dateStr: parsed.dateStr, isoDate: parsed.isoDate, dayOfWeek: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][parsed.dayOfWeek] });
      }
    }

    // Find the student's 3-row block
    var studentName = student.name.toLowerCase();
    var COMPONENT_COL = 3; // Column D (0-indexed)
    var NAME_COL = 1;      // Column B

    // Check if fellow column exists
    var firstRow = allData[0];
    var colCVal = String(firstRow[2] || '').trim().toLowerCase();
    if (colCVal === 'attendance' || colCVal === 'exit ticket' || colCVal === 'grades') {
      COMPONENT_COL = 2;
    }

    var activities = [];
    for (var r = 0; r < allData.length; r++) {
      var rowName = String(allData[r][NAME_COL] || '').toLowerCase().trim();
      if (!rowName) continue;

      // Match student name
      if (rowName.indexOf(studentName) === -1 && studentName.indexOf(rowName) === -1) continue;

      // Found the student — read the 3-row block
      var attendanceRow = null, exitTicketRow = null, gradesRow = null;
      for (var j = 0; j < 3 && (r + j) < allData.length; j++) {
        var comp = String(allData[r + j][COMPONENT_COL] || '').trim().toLowerCase();
        if (comp === 'attendance') attendanceRow = r + j;
        else if (comp === 'exit ticket') exitTicketRow = r + j;
        else if (comp === 'grades') gradesRow = r + j;
      }

      // Extract data for each date
      var totalPresent = 0, totalAbsent = 0, totalTardy = 0;
      for (var d = 0; d < dateCols.length; d++) {
        var ci = dateCols[d].colIdx;
        var att = attendanceRow !== null ? String(allData[attendanceRow][ci] || '').trim() : '';
        var attLower = att.toLowerCase();
        var isAbsent = attLower === 'absent';

        if (attLower === 'present') totalPresent++;
        else if (isAbsent) totalAbsent++;
        else if (attLower === 'tardy') totalTardy++;

        var et = (isAbsent || exitTicketRow === null) ? '' : allData[exitTicketRow][ci];
        var etVal = parseFloat(et);
        var gr = (isAbsent || gradesRow === null) ? '' : allData[gradesRow][ci];

        activities.push({
          date: dateCols[d].dateStr,
          isoDate: dateCols[d].isoDate,
          day: dateCols[d].dayOfWeek,
          attendance: att || '',
          exitTicket: isNaN(etVal) ? '' : etVal,
          dailyGrade: gr !== '' && gr !== undefined && gr !== null ? String(gr) : ''
        });
      }

      return {
        activities: activities,
        summary: {
          totalPresent: totalPresent,
          totalAbsent: totalAbsent,
          totalTardy: totalTardy,
          totalDays: dateCols.length,
          attendancePct: dateCols.length > 0 ? Math.round(((totalPresent + totalTardy) / dateCols.length) * 100) : 0
        }
      };
    }

    return { error: 'Could not find your activity data. Please contact your teacher.' };
  } catch (e) {
    return { error: 'Error loading activities: ' + e.message };
  }
}

// ─── Teacher Messages ───

/**
 * Returns messages from the teacher for this student.
 */
function getStudentMessages() {
  try {
    var email = getStudentEmail_();
    if (!email) return { error: 'Not authenticated.' };

    var ss = getRosterSpreadsheet_();
    if (!ss) return { messages: [] };

    var sheet = ss.getSheetByName('Student Messages');
    if (!sheet) return { messages: [] };

    var data = sheet.getDataRange().getValues();
    var messages = [];
    for (var i = 1; i < data.length; i++) {
      var rowEmail = String(data[i][0] || '').toLowerCase().trim();
      if (rowEmail === email) {
        messages.push({
          date: data[i][1] ? Utilities.formatDate(new Date(data[i][1]), Session.getScriptTimeZone(), 'MMM d, yyyy') : '',
          message: String(data[i][2] || ''),
          from: String(data[i][3] || 'Teacher')
        });
      }
    }
    // Most recent first
    messages.reverse();
    return { messages: messages };
  } catch (e) {
    return { error: 'Error loading messages: ' + e.message };
  }
}

// ─── Announcements ───

/**
 * Returns active class announcements.
 */
function getAnnouncements() {
  try {
    var ss = getRosterSpreadsheet_();
    if (!ss) return { announcements: [] };

    var sheet = ss.getSheetByName('Announcements');
    if (!sheet) return { announcements: [] };

    var data = sheet.getDataRange().getValues();
    var announcements = [];
    for (var i = 1; i < data.length; i++) {
      var active = String(data[i][3] || '').toUpperCase();
      if (active !== 'FALSE' && active !== 'NO') {
        announcements.push({
          date: data[i][0] ? Utilities.formatDate(new Date(data[i][0]), Session.getScriptTimeZone(), 'MMM d, yyyy') : '',
          title: String(data[i][1] || ''),
          body: String(data[i][2] || '')
        });
      }
    }
    announcements.reverse();
    return { announcements: announcements };
  } catch (e) {
    return { error: 'Error loading announcements: ' + e.message };
  }
}

// ─── Current Lesson ───

/**
 * Returns the current/latest lesson information.
 */
function getCurrentLesson() {
  try {
    var ss = getRosterSpreadsheet_();
    if (!ss) return { lesson: null };

    var sheet = ss.getSheetByName('Lessons');
    if (!sheet) return { lesson: null };

    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return { lesson: null };

    // Return the latest (last) lesson
    var last = data[data.length - 1];
    return {
      lesson: {
        date: last[0] ? Utilities.formatDate(new Date(last[0]), Session.getScriptTimeZone(), 'MMM d, yyyy') : '',
        topic: String(last[1] || ''),
        description: String(last[2] || ''),
        desmosLink: String(last[3] || ''),
        geogebraLink: String(last[4] || ''),
        resources: String(last[5] || '')
      }
    };
  } catch (e) {
    return { error: 'Error loading lesson: ' + e.message };
  }
}

// ─── Math Resources Library ───

/**
 * Returns the resource library, optionally filtered by topic.
 */
function getResources(topic) {
  try {
    var ss = getRosterSpreadsheet_();
    if (!ss) return { resources: [] };

    var sheet = ss.getSheetByName('Resources');
    if (!sheet) return { resources: [] };

    var data = sheet.getDataRange().getValues();
    var resources = [];
    var filterTopic = topic ? topic.toLowerCase().trim() : '';

    for (var i = 1; i < data.length; i++) {
      var rTopic = String(data[i][0] || '').trim();
      if (filterTopic && rTopic.toLowerCase().indexOf(filterTopic) === -1) continue;
      resources.push({
        topic: rTopic,
        title: String(data[i][1] || ''),
        url: String(data[i][2] || ''),
        type: String(data[i][3] || 'link')
      });
    }
    return { resources: resources };
  } catch (e) {
    return { error: 'Error loading resources: ' + e.message };
  }
}

// ─── Personal Goals ───

/**
 * Returns this student's goals.
 */
function getStudentGoals() {
  try {
    var email = getStudentEmail_();
    if (!email) return { error: 'Not authenticated.' };

    var ss = getRosterSpreadsheet_();
    if (!ss) return { goals: [] };

    var sheet = ss.getSheetByName('Goals');
    if (!sheet) return { goals: [] };

    var data = sheet.getDataRange().getValues();
    var goals = [];
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').toLowerCase().trim() === email) {
        goals.push({
          row: i + 1,
          goal: String(data[i][1] || ''),
          targetDate: data[i][2] ? Utilities.formatDate(new Date(data[i][2]), Session.getScriptTimeZone(), 'MMM d, yyyy') : '',
          status: String(data[i][3] || 'In Progress'),
          created: data[i][4] ? Utilities.formatDate(new Date(data[i][4]), Session.getScriptTimeZone(), 'MMM d, yyyy') : ''
        });
      }
    }
    return { goals: goals };
  } catch (e) {
    return { error: 'Error loading goals: ' + e.message };
  }
}

/**
 * Adds a new goal for the student.
 */
function addStudentGoal(goalText, targetDate) {
  try {
    var email = getStudentEmail_();
    if (!email) return { error: 'Not authenticated.' };

    var student = lookupStudentByEmail_(email);
    if (!student) return { error: 'Student not found.' };

    var ss = getRosterSpreadsheet_();
    if (!ss) return { error: 'Spreadsheet not available.' };

    var sheet = ss.getSheetByName('Goals');
    if (!sheet) {
      sheet = ss.insertSheet('Goals');
      sheet.appendRow(['StudentEmail', 'Goal', 'TargetDate', 'Status', 'Created']);
    }

    sheet.appendRow([email, goalText, targetDate || '', 'In Progress', new Date()]);
    return { success: true };
  } catch (e) {
    return { error: 'Error saving goal: ' + e.message };
  }
}

/**
 * Updates a goal's status (e.g., "Completed", "In Progress").
 */
function updateGoalStatus(row, newStatus) {
  try {
    var email = getStudentEmail_();
    if (!email) return { error: 'Not authenticated.' };

    var ss = getRosterSpreadsheet_();
    if (!ss) return { error: 'Spreadsheet not available.' };

    var sheet = ss.getSheetByName('Goals');
    if (!sheet) return { error: 'Goals sheet not found.' };

    // Verify this row belongs to the student
    var rowEmail = String(sheet.getRange(row, 1).getValue() || '').toLowerCase().trim();
    if (rowEmail !== email) return { error: 'Permission denied.' };

    sheet.getRange(row, 4).setValue(newStatus);
    return { success: true };
  } catch (e) {
    return { error: 'Error updating goal: ' + e.message };
  }
}

// ─── Self-Reflection Journal ───

/**
 * Returns this student's reflections.
 */
function getStudentReflections() {
  try {
    var email = getStudentEmail_();
    if (!email) return { error: 'Not authenticated.' };

    var ss = getRosterSpreadsheet_();
    if (!ss) return { reflections: [] };

    var sheet = ss.getSheetByName('Reflections');
    if (!sheet) return { reflections: [] };

    var data = sheet.getDataRange().getValues();
    var reflections = [];
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').toLowerCase().trim() === email) {
        reflections.push({
          date: data[i][1] ? Utilities.formatDate(new Date(data[i][1]), Session.getScriptTimeZone(), 'MMM d, yyyy') : '',
          reflection: String(data[i][2] || '')
        });
      }
    }
    reflections.reverse();
    return { reflections: reflections };
  } catch (e) {
    return { error: 'Error loading reflections: ' + e.message };
  }
}

/**
 * Saves a new reflection entry.
 */
function addStudentReflection(text) {
  try {
    var email = getStudentEmail_();
    if (!email) return { error: 'Not authenticated.' };

    var student = lookupStudentByEmail_(email);
    if (!student) return { error: 'Student not found.' };

    var ss = getRosterSpreadsheet_();
    if (!ss) return { error: 'Spreadsheet not available.' };

    var sheet = ss.getSheetByName('Reflections');
    if (!sheet) {
      sheet = ss.insertSheet('Reflections');
      sheet.appendRow(['StudentEmail', 'Date', 'Reflection']);
    }

    sheet.appendRow([email, new Date(), text]);
    return { success: true };
  } catch (e) {
    return { error: 'Error saving reflection: ' + e.message };
  }
}

// ─── Help Requests ───

/**
 * Returns this student's help requests and teacher replies.
 */
function getHelpRequests() {
  try {
    var email = getStudentEmail_();
    if (!email) return { error: 'Not authenticated.' };

    var ss = getRosterSpreadsheet_();
    if (!ss) return { requests: [] };

    var sheet = ss.getSheetByName('Help Requests');
    if (!sheet) return { requests: [] };

    var data = sheet.getDataRange().getValues();
    var requests = [];
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').toLowerCase().trim() === email) {
        requests.push({
          date: data[i][1] ? Utilities.formatDate(new Date(data[i][1]), Session.getScriptTimeZone(), 'MMM d, yyyy') : '',
          question: String(data[i][2] || ''),
          status: String(data[i][3] || 'Pending'),
          teacherReply: String(data[i][4] || '')
        });
      }
    }
    requests.reverse();
    return { requests: requests };
  } catch (e) {
    return { error: 'Error loading help requests: ' + e.message };
  }
}

/**
 * Submits a new help request.
 */
function submitHelpRequest(question) {
  try {
    var email = getStudentEmail_();
    if (!email) return { error: 'Not authenticated.' };

    var student = lookupStudentByEmail_(email);
    if (!student) return { error: 'Student not found.' };

    var ss = getRosterSpreadsheet_();
    if (!ss) return { error: 'Spreadsheet not available.' };

    var sheet = ss.getSheetByName('Help Requests');
    if (!sheet) {
      sheet = ss.insertSheet('Help Requests');
      sheet.appendRow(['StudentEmail', 'Date', 'Question', 'Status', 'TeacherReply']);
    }

    sheet.appendRow([email, new Date(), question, 'Pending', '']);
    return { success: true };
  } catch (e) {
    return { error: 'Error submitting help request: ' + e.message };
  }
}

// ─── Exit Ticket Upload ───

/**
 * Receives a base64-encoded file from the client and saves it to Google Drive.
 * Files are organized in: ExitTickets / StudentName / date_filename
 */
function uploadExitTicket(fileData, fileName, mimeType) {
  try {
    var email = getStudentEmail_();
    if (!email) return { error: 'Not authenticated.' };

    var student = lookupStudentByEmail_(email);
    if (!student) return { error: 'Student not found.' };

    // Validate file type
    var allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (allowedTypes.indexOf(mimeType) === -1) {
      return { error: 'File type not allowed. Please upload an image (JPEG, PNG, GIF, WebP) or PDF.' };
    }

    // Validate file size (max 10MB)
    var decoded = Utilities.base64Decode(fileData);
    if (decoded.length > 10 * 1024 * 1024) {
      return { error: 'File is too large. Maximum size is 10MB.' };
    }

    // Find or create the exit tickets folder
    var rootFolders = DriveApp.getFoldersByName('ExitTickets');
    var rootFolder;
    if (rootFolders.hasNext()) {
      rootFolder = rootFolders.next();
    } else {
      rootFolder = DriveApp.createFolder('ExitTickets');
    }

    // Find or create student subfolder
    var safeName = student.name.replace(/[^a-zA-Z0-9 ]/g, '').trim();
    var studentFolders = rootFolder.getFoldersByName(safeName);
    var studentFolder;
    if (studentFolders.hasNext()) {
      studentFolder = studentFolders.next();
    } else {
      studentFolder = rootFolder.createFolder(safeName);
    }

    // Create the file with date prefix
    var dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var safeFileName = dateStr + '_' + fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    var blob = Utilities.newBlob(decoded, mimeType, safeFileName);
    var file = studentFolder.createFile(blob);

    return { success: true, fileUrl: file.getUrl(), fileName: safeFileName };
  } catch (e) {
    return { error: 'Error uploading file: ' + e.message };
  }
}

// ─── Encouragement Engine ───

/**
 * Generates encouragement messages based on the student's recent performance.
 */
function getEncouragement() {
  try {
    var email = getStudentEmail_();
    if (!email) return { badges: [], message: '' };

    var student = lookupStudentByEmail_(email);
    if (!student) return { badges: [], message: '' };

    var badges = [];
    var messages = [];

    // Get recent activity for analysis
    var activityResult = getStudentActivity();
    if (activityResult.summary) {
      var s = activityResult.summary;

      // Attendance badges
      if (s.totalAbsent === 0 && s.totalDays > 0) {
        badges.push({ icon: '⭐', label: 'Perfect Attendance', desc: 'No absences in the last 2 weeks!' });
      }
      if (s.attendancePct >= 90) {
        messages.push('Great attendance! You\'ve been present ' + s.attendancePct + '% of the time. Keep it up! 🎉');
      }

      // Exit ticket streaks
      if (activityResult.activities) {
        var etCount = 0;
        var etTotal = 0;
        var streak = 0;
        var maxStreak = 0;
        for (var i = 0; i < activityResult.activities.length; i++) {
          var a = activityResult.activities[i];
          if (a.exitTicket !== '' && a.exitTicket !== undefined) {
            etCount++;
            etTotal += Number(a.exitTicket) || 0;
            streak++;
            if (streak > maxStreak) maxStreak = streak;
          } else if (a.attendance && a.attendance.toLowerCase() !== 'absent') {
            streak = 0;
          }
        }
        if (maxStreak >= 5) {
          badges.push({ icon: '🔥', label: 'Exit Ticket Streak', desc: maxStreak + ' exit tickets in a row!' });
        }
        if (etCount > 0) {
          var avg = Math.round(etTotal / etCount);
          if (avg >= 4) {
            badges.push({ icon: '🏆', label: 'High Scorer', desc: 'Your average exit ticket score is ' + avg + '/5!' });
          }
        }
      }

      if (s.totalTardy === 0 && s.totalDays > 0) {
        badges.push({ icon: '⏰', label: 'Always On Time', desc: 'Zero tardies — punctuality pro!' });
      }
    }

    // Get grade for encouragement
    var gradeResult = getStudentGrade();
    if (gradeResult.letterGrade) {
      var grade = gradeResult.letterGrade.toUpperCase();
      if (grade === 'A' || grade === 'A+' || grade === 'A-') {
        badges.push({ icon: '🌟', label: 'Honor Roll', desc: 'You\'re earning an ' + grade + '! Outstanding work!' });
        messages.push('You\'re at the top of your game with an ' + grade + '. Keep pushing! 💪');
      } else if (grade === 'B' || grade === 'B+' || grade === 'B-') {
        messages.push('Solid ' + grade + ' — you\'re doing well! A little more effort could push you to an A. You\'ve got this! 📈');
      } else if (grade === 'C' || grade === 'C+' || grade === 'C-') {
        messages.push('You\'re at a ' + grade + ' right now. Small improvements each day add up — let\'s work together to raise it! 💡');
      } else {
        messages.push('Every expert was once a beginner. Let\'s set some goals and work on improving together! 🚀');
      }
    }

    if (messages.length === 0) {
      messages.push('Welcome back! Keep showing up and doing your best — you\'re making progress! 🌈');
    }

    return { badges: badges, message: messages[0] };
  } catch (e) {
    return { badges: [], message: 'Keep up the great work! 💪' };
  }
}

// ─── Dashboard Data (Combined Endpoint) ───

/**
 * Returns all dashboard data in a single call to minimize latency.
 */
function getStudentDashboard() {
  var auth = studentAuth();
  if (!auth.authenticated) return auth;

  return {
    authenticated: true,
    student: auth.student,
    grade: getStudentGrade(),
    activity: getStudentActivity(),
    messages: getStudentMessages(),
    announcements: getAnnouncements(),
    lesson: getCurrentLesson(),
    encouragement: getEncouragement(),
    goals: getStudentGoals(),
    reflections: getStudentReflections(),
    helpRequests: getHelpRequests()
  };
}

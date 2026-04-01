/**
 * Code.gs — Biweekly Comment Generator (Google Apps Script Web App)
 *
 * Features:
 *   - Read student data from any Google Sheet
 *   - Generate personalized student & parent comments (template-based, no AI)
 *   - Write comments back to the spreadsheet
 *   - Email parent comments directly to parents from the teacher's account
 *
 * FERPA-safe: Runs entirely within Google Workspace.
 * No external APIs, no AI, no third-party services.
 */

// ─── Web App Entry Point ───
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Biweekly Comment Generator')
    .setFaviconUrl('https://www.gstatic.com/images/branding/product/1x/apps_script_48dp.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ─── Column Letter ↔ Index Helpers ───
function colToIndex(col) {
  col = col.toUpperCase();
  var idx = 0;
  for (var i = 0; i < col.length; i++) {
    idx = idx * 26 + (col.charCodeAt(i) - 64);
  }
  return idx; // 1-based for Sheets
}

function indexToCol(idx) {
  var col = '';
  while (idx > 0) {
    idx--;
    col = String.fromCharCode(65 + (idx % 26)) + col;
    idx = Math.floor(idx / 26);
  }
  return col;
}

// ─── Number to Word ───
function spellNumber(n) {
  var words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  return n <= 10 ? words[n] : String(n);
}

// ─── Get Teacher Info ───
function getTeacherInfo() {
  var email = Session.getActiveUser().getEmail();
  return { email: email };
}

// ─── Read Student Data (called from frontend) ───

// Helper: Normalize a name into multiple lookup keys
function nameVariants(name) {
  var n = name.trim().replace(/\s+/g, ' ');
  var keys = [];
  keys.push(n.toLowerCase());

  // If "Last, First" → also store as "First Last" and "first last"
  if (n.indexOf(',') > -1) {
    var parts = n.split(',');
    var reversed = (parts[1] || '').trim() + ' ' + parts[0].trim();
    keys.push(reversed.toLowerCase());
  }

  // If "First Last" → also store as "Last, First"
  var spaceParts = n.split(' ');
  if (spaceParts.length >= 2 && n.indexOf(',') === -1) {
    var last = spaceParts[spaceParts.length - 1];
    var first = spaceParts.slice(0, -1).join(' ');
    keys.push((last + ', ' + first).toLowerCase());
    keys.push((last + ',' + first).toLowerCase());
  }

  return keys;
}

// Helper: Build a name → email lookup from a separate sheet tab
function buildEmailLookup(ss, config) {
  var lookup = {};
  if (!config.emailSheetName) return { map: lookup, rawNames: [], sheetFound: false };

  var emailSheet = ss.getSheetByName(config.emailSheetName);
  if (!emailSheet) return { map: lookup, rawNames: [], sheetFound: false, sheetError: 'Sheet tab "' + config.emailSheetName + '" not found' };

  var nameCol = colToIndex(config.emailSheetNameCol || 'A');
  var emailCol = colToIndex(config.emailSheetEmailCol || 'B');
  var maxCol = Math.max(nameCol, emailCol);
  var lastRow = emailSheet.getLastRow();
  if (lastRow < 2) return { map: lookup, rawNames: [], sheetFound: true };

  var data = emailSheet.getRange(2, 1, lastRow - 1, maxCol).getValues();
  var rawNames = [];

  for (var i = 0; i < data.length; i++) {
    var name = String(data[i][nameCol - 1] || '').trim();
    var email = String(data[i][emailCol - 1] || '').trim();
    if (name && email) {
      rawNames.push(name);
      // Store all name variants for flexible matching
      var keys = nameVariants(name);
      for (var k = 0; k < keys.length; k++) {
        lookup[keys[k]] = email;
      }
    }
  }

  return { map: lookup, rawNames: rawNames, sheetFound: true };
}

// Helper: Look up email using multiple name format attempts
function lookupEmail(emailMap, studentName) {
  if (!emailMap || Object.keys(emailMap).length === 0) return '';
  var keys = nameVariants(studentName);
  for (var i = 0; i < keys.length; i++) {
    if (emailMap[keys[i]]) return emailMap[keys[i]];
  }
  return '';
}

function getStudentData(config) {
  try {
    var ss = SpreadsheetApp.openById(config.spreadsheetId);
    var sheet = ss.getSheetByName(config.sheetName);

    if (!sheet) {
      return { error: 'Sheet tab "' + config.sheetName + '" not found. Available tabs: ' +
        ss.getSheets().map(function(s) { return s.getName(); }).join(', ') };
    }

    var startRow = parseInt(config.dataStartRow) || 4;
    var lastRow = sheet.getLastRow();
    if (lastRow < startRow) {
      return { error: 'No data found. The sheet appears empty starting from row ' + startRow + '.' };
    }

    // Compute column indexes (1-based for Sheets)
    var nameCol = colToIndex(config.studentNameCol || 'B');
    var commentCol = colToIndex(config.studentCommentCol || 'C');
    var parentCol = colToIndex(config.parentCommentCol || 'D');
    var gradeCol = colToIndex(config.gradeCol || 'E');
    var tardiesCol = colToIndex(config.tardiesCol || 'AJ');
    var absencesCol = colToIndex(config.absencesCol || 'AK');

    var allCols = [nameCol, commentCol, parentCol, gradeCol, tardiesCol, absencesCol];
    var maxCol = Math.max.apply(null, allCols);

    var range = sheet.getRange(startRow, 1, lastRow - startRow + 1, maxCol);
    var data = range.getValues();

    // Build email lookup from separate sheet
    var emailResult = buildEmailLookup(ss, config);
    var emailMap = emailResult.map;

    // Build diagnostic info
    var emailDiag = '';
    if (config.emailSheetName) {
      if (emailResult.sheetError) {
        emailDiag = ' · ⚠️ ' + emailResult.sheetError;
      } else if (emailResult.sheetFound) {
        emailDiag = ' · Email sheet: ' + emailResult.rawNames.length + ' entries found';
      }
    }

    var students = [];
    var matchedCount = 0;
    var unmatchedNames = [];

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var name = String(row[nameCol - 1] || '').trim();
      if (!name) continue;

      // Look up parent email using flexible name matching
      var parentEmail = lookupEmail(emailMap, name);
      if (parentEmail) {
        matchedCount++;
      } else if (config.emailSheetName && emailResult.rawNames.length > 0) {
        unmatchedNames.push(name);
      }

      var student = {
        rowNum: startRow + i,
        name: name,
        grade: String(row[gradeCol - 1] || '').trim().toUpperCase(),
        tardies: parseInt(row[tardiesCol - 1]) || 0,
        absences: parseInt(row[absencesCol - 1]) || 0,
        existingComment: String(row[commentCol - 1] || '').trim(),
        existingParent: String(row[parentCol - 1] || '').trim(),
        parentEmail: parentEmail
      };
      students.push(student);
    }

    // Build detailed diagnostic message
    if (config.emailSheetName && emailResult.rawNames.length > 0) {
      emailDiag += ' · Matched: ' + matchedCount + '/' + students.length;
      if (unmatchedNames.length > 0 && unmatchedNames.length <= 5) {
        emailDiag += ' · Unmatched: ' + unmatchedNames.join(', ');
      } else if (unmatchedNames.length > 5) {
        emailDiag += ' · ' + unmatchedNames.length + ' students without email match';
      }
      if (matchedCount === 0 && emailResult.rawNames.length > 0) {
        // Show sample names from both sheets to help debug
        var sampleData = students.slice(0, 2).map(function(s) { return '"' + s.name + '"'; }).join(', ');
        var sampleEmail = emailResult.rawNames.slice(0, 2).map(function(n) { return '"' + n + '"'; }).join(', ');
        emailDiag += ' · Data sheet names: ' + sampleData + ' · Email sheet names: ' + sampleEmail;
      }
    }

    return {
      success: true,
      students: students,
      sheetName: config.sheetName,
      totalRows: students.length,
      emailDiag: emailDiag
    };

  } catch (e) {
    return { error: 'Could not access spreadsheet: ' + e.message +
      '. Make sure the Spreadsheet ID is correct and you have access.' };
  }
}

// ─── Generate and Write Comments (called from frontend) ───
function generateAndWriteComments(config, options) {
  try {
    var ss = SpreadsheetApp.openById(config.spreadsheetId);
    var sheet = ss.getSheetByName(config.sheetName);
    if (!sheet) return { error: 'Sheet tab "' + config.sheetName + '" not found.' };

    var startRow = parseInt(config.dataStartRow) || 4;
    var lastRow = sheet.getLastRow();
    if (lastRow < startRow) return { error: 'No data found.' };

    var nameCol = colToIndex(config.studentNameCol || 'B');
    var commentCol = colToIndex(config.studentCommentCol || 'C');
    var parentCol = colToIndex(config.parentCommentCol || 'D');
    var gradeCol = colToIndex(config.gradeCol || 'E');
    var tardiesCol = colToIndex(config.tardiesCol || 'AJ');
    var absencesCol = colToIndex(config.absencesCol || 'AK');

    var allCols = [nameCol, commentCol, parentCol, gradeCol, tardiesCol, absencesCol];
    var maxCol = Math.max.apply(null, allCols);

    var range = sheet.getRange(startRow, 1, lastRow - startRow + 1, maxCol);
    var data = range.getValues();

    // Build email lookup from separate sheet
    var emailResult = buildEmailLookup(ss, config);
    var emailMap = emailResult.map;

    var overwriteExisting = options && options.overwrite;
    var generated = 0;
    var skipped = 0;
    var results = [];

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var name = String(row[nameCol - 1] || '').trim();
      if (!name) continue;

      var rowNum = startRow + i;
      var grade = String(row[gradeCol - 1] || '').trim().toUpperCase();
      var tardies = parseInt(row[tardiesCol - 1]) || 0;
      var absences = parseInt(row[absencesCol - 1]) || 0;
      var existingComment = String(row[commentCol - 1] || '').trim();
      var existingParent = String(row[parentCol - 1] || '').trim();

      // Look up parent email from email sheet
      var parentEmail = lookupEmail(emailMap, name);

      var needsComment = !existingComment || overwriteExisting;
      var needsParent = !existingParent || overwriteExisting;

      if (!needsComment && !needsParent) {
        skipped++;
        continue;
      }

      var studentComment = generateStudentComment(name, grade, tardies, absences);
      var parentComment = generateParentComment(name, grade, tardies, absences);

      if (needsComment) {
        sheet.getRange(rowNum, commentCol).setValue(studentComment);
      }
      if (needsParent) {
        sheet.getRange(rowNum, parentCol).setValue(parentComment);
      }

      generated++;
      results.push({
        rowNum: rowNum,
        name: name,
        grade: grade,
        tardies: tardies,
        absences: absences,
        parentEmail: parentEmail,
        studentComment: studentComment,
        parentComment: parentComment
      });
    }

    return {
      success: true,
      generated: generated,
      skipped: skipped,
      results: results
    };

  } catch (e) {
    return { error: 'Failed to generate comments: ' + e.message };
  }
}

// ─── Send Parent Emails (called from frontend) ───
function sendParentEmails(emailData) {
  var sent = 0;
  var failed = 0;
  var errors = [];

  var teacherEmail = Session.getActiveUser().getEmail();

  for (var i = 0; i < emailData.students.length; i++) {
    var s = emailData.students[i];

    if (!s.parentEmail || !s.parentComment) {
      failed++;
      errors.push({ name: s.name, error: 'Missing email address or comment' });
      continue;
    }

    try {
      // Extract first name for greeting
      var firstName = s.name.indexOf(',') > -1
        ? (s.name.split(',')[1] || '').trim()
        : s.name.split(',')[0].trim();
      if (!firstName) firstName = s.name;

      // Build HTML email body — Blueprint Progress Report format
      var grade = s.grade || '';
      var tardies = s.tardies || 0;
      var absences = s.absences || 0;
      var teacherName = emailData.teacherName || teacherEmail;

      var htmlBody = ''
        + '<div style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#333;">'
        // Header
        + '<div style="background:#2c3e50;padding:20px 24px;border-radius:8px 8px 0 0;">'
        + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
        + '<td style="color:#fff;font-size:18px;font-weight:bold;">Biweekly Progress Report</td>'
        + '<td style="text-align:right;">'
        + '<span style="color:#6bb8c9;font-size:22px;font-weight:bold;">blueprint</span><br>'
        + '<span style="color:#6bb8c9;font-size:11px;">schools network</span>'
        + '</td></tr></table></div>'
        // Body
        + '<div style="padding:24px;background:#fff;border-left:1px solid #ddd;border-right:1px solid #ddd;">'
        + '<p style="margin:0 0 16px;font-size:15px;">Dear Parent/Guardian of ' + firstName + ',</p>'
        // Student Info Card
        + '<div style="background:#f8f9fa;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:0 0 20px;">'
        + '<div style="font-weight:bold;font-size:14px;margin-bottom:12px;color:#2c3e50;">Student Summary</div>'
        + '<table cellpadding="0" cellspacing="0" style="font-size:14px;width:100%;">'
        + '<tr><td style="padding:4px 16px 4px 0;color:#666;width:100px;">Student</td><td style="font-weight:bold;">' + s.name + '</td></tr>'
        + '<tr><td style="padding:4px 16px 4px 0;color:#666;">Grade</td><td><span style="display:inline-block;padding:2px 10px;border-radius:4px;font-weight:bold;background:' + (grade === 'A' || grade === 'B' ? '#d1fae5;color:#059669' : grade === 'C' || grade === 'D' ? '#fef3c7;color:#d97706' : grade === 'F' ? '#fee2e2;color:#dc2626' : '#f3f4f6;color:#6b7280') + ';">' + (grade || '—') + '</span></td></tr>'
        + '<tr><td style="padding:4px 16px 4px 0;color:#666;">Tardies</td><td>' + tardies + '</td></tr>'
        + '<tr><td style="padding:4px 16px 4px 0;color:#666;">Absences</td><td>' + absences + '</td></tr>'
        + '</table></div>'
        // Comment
        + '<div style="border-left:4px solid #6bb8c9;padding:12px 16px;background:#f0f9fa;margin:0 0 20px;font-size:14px;line-height:1.6;">'
        + s.parentComment
        + '</div>';

      if (emailData.customMessage) {
        htmlBody += '<p style="font-size:14px;line-height:1.6;">' + emailData.customMessage.replace(/\n/g, '<br>') + '</p>';
      }

      htmlBody += '<p style="font-size:14px;">If you have any questions or concerns, please do not hesitate to reach out.</p>'
        + '<p style="font-size:14px;margin-bottom:0;">Best regards,<br>'
        + '<strong>' + teacherName + '</strong><br>'
        + '<span style="color:#666;font-size:13px;">' + teacherEmail + '</span></p>'
        + '</div>'
        // Footer
        + '<div style="background:#f8f9fa;padding:12px 24px;text-align:center;border:1px solid #ddd;border-top:none;border-radius:0 0 8px 8px;">'
        + '<span style="color:#999;font-size:11px;">Blueprint Schools Network · Biweekly Progress Report</span>'
        + '</div></div>';

      // Plain text version
      var plainBody = 'Dear Parent/Guardian of ' + firstName + ',\n\n'
        + s.parentComment + '\n\n';

      if (emailData.customMessage) {
        plainBody += emailData.customMessage + '\n\n';
      }

      plainBody += 'If you have any questions or concerns, please do not hesitate to reach out.\n\n'
        + 'Best regards,\n'
        + (emailData.teacherName || teacherEmail) + '\n'
        + teacherEmail;

      // Send email
      MailApp.sendEmail({
        to: s.parentEmail,
        subject: emailData.subject.replace('{student}', firstName),
        body: plainBody,
        htmlBody: htmlBody,
        name: emailData.teacherName || '',
        replyTo: teacherEmail
      });

      sent++;
    } catch (e) {
      failed++;
      errors.push({ name: s.name, email: s.parentEmail, error: e.message });
    }
  }

  // Check remaining quota
  var remaining = MailApp.getRemainingDailyQuota();

  return {
    success: true,
    sent: sent,
    failed: failed,
    errors: errors,
    remainingQuota: remaining
  };
}

// ─── Student Comment Templates ───
function generateStudentComment(name, grade, tardies, absences) {
  var firstName = name.indexOf(',') > -1
    ? (name.split(',')[1] || '').trim()
    : name.split(',')[0].trim();
  if (!firstName) firstName = name;

  if (!grade && absences >= 5) {
    return firstName + '- you have ' + spellNumber(absences) + ' absences this biweekly period which is making it very difficult to keep up with the lessons. Please make sure to attend every class so we can help you succeed. Check in with me to find out what assignments you have missed.';
  }

  if (grade === 'A' || grade === 'B') {
    var msg = firstName + '- you are doing ' + (grade === 'A' ? 'an excellent' : 'a solid') + ' job in the class with ' + (grade === 'A' ? 'an' : 'a') + ' ' + grade + '.';
    if (tardies === 0 && absences === 0) {
      msg += ' You have perfect attendance with zero tardies and zero absences. Your dedication and hard work are truly impressive. Keep it up!';
    } else if (tardies > 0 && absences === 0) {
      msg += ' You have ' + spellNumber(tardies) + ' ' + (tardies === 1 ? 'tardy' : 'tardies') + ' this period - please try to arrive on time so you can start class strong. Keep up the great work!';
    } else if (tardies === 0 && absences > 0) {
      msg += ' You have zero tardies and ' + (absences === 1 ? 'only one absence' : spellNumber(absences) + ' absences') + ' this period which shows great dedication. Keep up the outstanding work and maintain this consistency.';
    } else {
      msg += ' Watch out for those ' + spellNumber(tardies) + ' tardies and ' + spellNumber(absences) + ' ' + (absences === 1 ? 'absence' : 'absences') + ' - arriving on time will help you stay at the top. Keep pushing!';
    }
    return msg;
  }

  if (grade === 'C' || grade === 'D') {
    var msg = firstName + '- you currently have a ' + grade + ' in the class.';
    if (tardies > 3) {
      msg += ' You have ' + spellNumber(tardies) + ' tardies this period which is affecting your ability to start class strong. Please focus on arriving on time and putting in consistent effort so you can raise your grade.';
    } else if (absences > 0) {
      msg += ' You have ' + (tardies === 0 ? 'zero tardies' : spellNumber(tardies) + (tardies === 1 ? ' tardy' : ' tardies')) + ' and ' + (absences === 1 ? 'only one absence' : spellNumber(absences) + ' absences') + ' this period. Please keep working hard on your assignments and participation to bring your grade up. You have the ability to do great things!';
    } else {
      msg += ' Your attendance is solid with zero tardies and zero absences. Please continue your hard work to improve your grade - you are capable of more!';
    }
    return msg;
  }

  if (grade === 'F') {
    var msg = firstName + '- I need to see more from you - your grade is an F right now.';
    if (tardies > 0 || absences > 0) {
      var parts = [];
      if (tardies > 0) parts.push(spellNumber(tardies) + ' ' + (tardies === 1 ? 'tardy' : 'tardies'));
      if (absences > 0) parts.push(spellNumber(absences) + ' ' + (absences === 1 ? 'absence' : 'absences'));
      msg += ' You have been ' + parts.join(' and ') + ' this period which makes it difficult to stay caught up. Please see me during office hours so we can make a plan for your success.';
    } else {
      msg += ' Your attendance is fine but I need to see more effort and engagement. Lets set a goal together to bring this grade up.';
    }
    return msg;
  }

  // Fallback: no grade
  if (absences >= 3) {
    return firstName + '- you have ' + spellNumber(absences) + ' absences this biweekly period which is making it very difficult to keep up with the lessons. Please make sure to attend every class so we can help you succeed. Check in with me to find out what assignments you have missed.';
  }
  return firstName + '- please check in with me about your current standing in the class. I want to make sure you are on track and have what you need to succeed.';
}

// ─── Parent Comment Templates ───
function generateParentComment(name, grade, tardies, absences) {
  var firstName = name.indexOf(',') > -1
    ? (name.split(',')[1] || '').trim()
    : name.split(',')[0].trim();
  if (!firstName) firstName = name;

  if (!grade && absences >= 5) {
    return firstName + ' has accumulated ' + spellNumber(absences) + ' absences this period which is significantly impacting his/her ability to keep up with coursework. We are concerned about attendance and would like to work with you to ensure they are present in class. Please contact me so we can discuss a plan for academic success.';
  }

  if (grade === 'A' || grade === 'B') {
    var msg = firstName + ' is performing ' + (grade === 'A' ? 'exceptionally well' : 'well') + ' with ' + (grade === 'A' ? 'an' : 'a') + ' ' + grade + ' in the course.';
    if (tardies === 0 && absences === 0) {
      msg += firstName +'has perfect attendance this period with no tardies or absences. Their commitment to education is exemplary and we are very proud of their consistent effort and performance.';
    } else if (tardies > 0) {
      msg +=  firstname +'have ' + spellNumber(tardies) + ' ' + (tardies === 1 ? 'tardy' : 'tardies') + ' and ' + (absences === 0 ? 'zero absences' : spellNumber(absences) + (absences === 1 ? ' absence' : ' absences')) + ' this period. Improving punctuality would help make the most of class time. We appreciate your support in encouraging on-time arrival.';
    } else {
      msg += firstName +'have zero tardies and ' + (absences === 1 ? 'only one absence' : spellNumber(absences) + ' absences') + ' this period. Their consistent work ethic and focus in class are commendable. We are very pleased with their academic progress.';
    }
    return msg;
  }

  if (grade === 'C' || grade === 'D') {
    var msg = firstName + ' is maintaining a ' + grade + ' grade in the course.';
    if (tardies > 3) {
      msg += firstName +'has ' + spellNumber(tardies) + ' tardies this period and ' + (absences === 0 ? 'zero absences' : spellNumber(absences) + (absences === 1 ? ' absence' : ' absences')) + '. Improving punctuality would help make the most of class time and improve academic standing. We appreciate your support in encouraging on-time arrival.';
    } else if (absences > 0) {
      msg +=  firstName + ' has ' + (tardies === 0 ? 'zero tardies' : spellNumber(tardies) + (tardies === 1 ? ' tardy' : ' tardies')) + ' and ' + (absences === 1 ? 'only one absence' : spellNumber(absences) + ' absences') + ' this period. We encourage continued focus on classwork and participation to further improve academic standing.';
    } else {
      msg += firstName +'attendance is solid with no tardies or absences. We hope to see continued consistency and work towards a higher grade.';
    }
    return msg;
  }

  if (grade === 'F') {
    var msg = firstName + ' is struggling in the course with an F grade at this time.';
    if (tardies > 0 || absences > 0) {
      var parts = [];
      if (tardies > 0) parts.push(spellNumber(tardies) + ' ' + (tardies === 1 ? 'tardy' : 'tardies'));
      if (absences > 0) parts.push(spellNumber(absences) + ' ' + (absences === 1 ? 'absence' : 'absences'));
      msg +=  firstName +'has accumulated ' + parts.join(' and ') + ' this period which is impacting their ability to follow the curriculum consistently. We would like to work with you to ensure they have the support needed to improve their academic performance.';
    } else {
      msg += ' Attendance is not the issue but engagement and effort need improvement. We would like to partner with you to discuss strategies for improvement.';
    }
    return msg;
  }

  // Fallback
  if (absences >= 3) {
    return firstName + ' has accumulated ' + spellNumber(absences) + ' absences this period which is significantly impacting their ability to keep up with coursework. We are concerned about attendance and would like to work with you to ensure they are present in class. Please contact me so we can discuss a plan for academic success.';
  }
  return firstName + ' needs to check in with us regarding their current standing. We would appreciate your support in encouraging them to connect with the teacher.';
}

// ═══════════════════════════════════════════════════
// ─── Activity Report Functions ───
// ═══════════════════════════════════════════════════

/**
 * Scan row 4 of the activity sheet for date columns.
 * Returns all available dates for the date-range picker.
 */
function getActivityDates(config) {
  try {
    var ss = SpreadsheetApp.openById(config.spreadsheetId);
    var sheet = ss.getSheetByName(config.activitySheetName);
    if (!sheet) {
      return { error: 'Sheet tab "' + config.activitySheetName + '" not found. Available tabs: ' +
        ss.getSheets().map(function(s) { return s.getName(); }).join(', ') };
    }

    var dateRow = parseInt(config.activityDateRow) || 4;
    var lastCol = sheet.getLastColumn();
    var row4 = sheet.getRange(dateRow, 1, 1, lastCol).getValues()[0];
    var tz = Session.getScriptTimeZone();

    var dates = [];
    for (var i = 0; i < row4.length; i++) {
      var cell = row4[i];
      if (cell instanceof Date && !isNaN(cell.getTime())) {
        var day = cell.getDay();
        if (day === 0 || day === 6) continue; // Skip weekends
        dates.push({
          col: i + 1,
          dateStr: Utilities.formatDate(cell, tz, 'M/d/yyyy'),
          isoDate: Utilities.formatDate(cell, tz, 'yyyy-MM-dd'),
          dayOfWeek: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day]
        });
      }
    }

    if (dates.length === 0) {
      return { error: 'No dates found in row ' + dateRow + '. Make sure the activity sheet has dates in row ' + dateRow + '.' };
    }

    return { success: true, dates: dates, total: dates.length };
  } catch(e) {
    return { error: 'Could not load dates: ' + e.message };
  }
}

/**
 * Build a name → grade lookup from a separate grades tab.
 * Returns { map: { "name": "A", ... }, found: true/false }
 */
function buildGradeLookup(ss, config) {
  var lookup = {};
  if (!config.gradesSheetName) return { map: lookup, found: false };

  var gradeSheet = ss.getSheetByName(config.gradesSheetName);
  if (!gradeSheet) return { map: lookup, found: false, error: 'Sheet "' + config.gradesSheetName + '" not found' };

  var nameCol = colToIndex(config.gradesNameCol || 'B') - 1;
  var gradeCol = colToIndex(config.gradesGradeCol || 'E') - 1;
  var maxCol = Math.max(nameCol, gradeCol) + 1;
  var startRow = parseInt(config.gradesStartRow) || 4;
  var lastRow = gradeSheet.getLastRow();
  if (lastRow < startRow) return { map: lookup, found: true };

  var data = gradeSheet.getRange(startRow, 1, lastRow - startRow + 1, maxCol).getValues();

  for (var i = 0; i < data.length; i++) {
    var name = String(data[i][nameCol] || '').trim();
    var grade = String(data[i][gradeCol] || '').trim().toUpperCase();
    if (name && grade) {
      // Store multiple variants for flexible matching
      var keys = nameVariants(name);
      for (var k = 0; k < keys.length; k++) {
        lookup[keys[k]] = grade;
      }
    }
  }

  return { map: lookup, found: true };
}

/**
 * Read student activity data for a date range.
 * Parses the 3-row-per-student block structure:
 *   Row 1: Attendance   Row 2: Exit Ticket   Row 3: GRADES
 * Returns structured data for the frontend report.
 */
function getActivityReport(config, startDate, endDate) {
  try {
    var ss = SpreadsheetApp.openById(config.spreadsheetId);
    var sheet = ss.getSheetByName(config.activitySheetName);
    if (!sheet) return { error: 'Sheet tab "' + config.activitySheetName + '" not found.' };

    var dateRow = parseInt(config.activityDateRow) || 4;
    var lastCol = sheet.getLastColumn();
    var lastRow = sheet.getLastRow();
    var tz = Session.getScriptTimeZone();

    // Parse start/end dates
    var start = new Date(startDate + 'T00:00:00');
    var end = new Date(endDate + 'T23:59:59');

    // Scan row 4 for date columns within range
    var row4 = sheet.getRange(dateRow, 1, 1, lastCol).getValues()[0];
    var dateCols = [];
    for (var i = 0; i < row4.length; i++) {
      var cell = row4[i];
      if (cell instanceof Date && !isNaN(cell.getTime())) {
        var day = cell.getDay();
        if (day === 0 || day === 6) continue; // Skip weekends
        if (cell >= start && cell <= end) {
          dateCols.push({
            colIdx: i,
            date: cell,
            dateStr: Utilities.formatDate(cell, tz, 'M/d/yyyy'),
            isoDate: Utilities.formatDate(cell, tz, 'yyyy-MM-dd'),
            dayOfWeek: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day]
          });
        }
      }
    }

    if (dateCols.length === 0) {
      return { error: 'No dates found between ' + startDate + ' and ' + endDate + ' in this sheet.' };
    }

    // Read all student data (starting from row after date header)
    var dataStartRow = dateRow + 1;
    if (lastRow < dataStartRow) return { error: 'No student data below row ' + dateRow + '.' };

    var data = sheet.getRange(dataStartRow, 1, lastRow - dataStartRow + 1, lastCol).getValues();

    // Fixed column indices (0-based): A=Period, B=Name, C=Fellow, D=Component
    var PERIOD_COL = 0;
    var NAME_COL = 1;
    var FELLOW_COL = 2;
    var COMPONENT_COL = 3;

    // Build optional grade lookup
    var gradeLookup = buildGradeLookup(ss, config);
    var gradeMap = gradeLookup.map;

    // Process students in 3-row blocks
    var students = [];
    var i = 0;
    while (i < data.length) {
      var name = String(data[i][NAME_COL] || '').trim();
      if (!name) { i++; continue; }

      // Identify the 3-row block by checking Component
      var attendanceRowIdx = null, exitTicketRowIdx = null, gradesRowIdx = null;

      for (var j = 0; j < 3 && (i + j) < data.length; j++) {
        var comp = String(data[i + j][COMPONENT_COL] || '').trim().toLowerCase();
        if (comp === 'attendance') attendanceRowIdx = i + j;
        else if (comp === 'exit ticket') exitTicketRowIdx = i + j;
        else if (comp === 'grades') gradesRowIdx = i + j;
      }

      // Skip if we can't identify the block
      if (attendanceRowIdx === null && exitTicketRowIdx === null && gradesRowIdx === null) {
        i++;
        continue;
      }

      var period = String(data[i][PERIOD_COL] || '').trim();
      var fellow = String(data[i][FELLOW_COL] || '').trim();

      // Look up letter grade from the grades sheet
      var letterGrade = '';
      if (Object.keys(gradeMap).length > 0) {
        letterGrade = lookupEmail(gradeMap, name) || ''; // reuse the flexible name lookup
      }

      // Extract data for each date column
      var dateData = [];
      var totalPresent = 0, totalTardy = 0, totalAbsent = 0, totalNotScheduled = 0;

      for (var d = 0; d < dateCols.length; d++) {
        var colIdx = dateCols[d].colIdx;

        // Attendance
        var attendance = attendanceRowIdx !== null ? String(data[attendanceRowIdx][colIdx] || '').trim() : '';

        // Exit Ticket
        var etRaw = exitTicketRowIdx !== null ? data[exitTicketRowIdx][colIdx] : '';
        var etValue = parseFloat(etRaw);
        var etDisplay = isNaN(etValue) ? '' : etValue;

        // GRADES string
        var gradesStr = gradesRowIdx !== null ? String(data[gradesRowIdx][colIdx] || '').trim().toUpperCase() : '';

        // Calculate participation % from GRADES
        var participationPct = null;
        if (gradesStr && gradesStr !== '—') {
          var validChars = 0;
          for (var c = 0; c < gradesStr.length; c++) {
            if (gradesStr[c] !== 'X') validChars++;
          }
          participationPct = Math.round((validChars / 6) * 100);
        }

        // Count attendance totals
        var attLower = attendance.toLowerCase();
        if (attLower === 'present') totalPresent++;
        else if (attLower === 'tardy') totalTardy++;
        else if (attLower === 'absent') totalAbsent++;
        else if (attLower.indexOf('not s') > -1 || attLower.indexOf('not scheduled') > -1) totalNotScheduled++;

        dateData.push({
          date: dateCols[d].dateStr,
          dayOfWeek: dateCols[d].dayOfWeek,
          attendance: attendance || '—',
          exitTicket: etDisplay,
          exitTicketPct: !isNaN(etValue) ? Math.round((etValue / 4) * 100) : null,
          gradesStr: gradesStr || '—',
          participationPct: participationPct
        });
      }

      students.push({
        name: name,
        period: period,
        fellow: fellow,
        letterGrade: letterGrade,
        dates: dateData,
        summary: {
          totalPresent: totalPresent,
          totalTardy: totalTardy,
          totalAbsent: totalAbsent,
          totalNotScheduled: totalNotScheduled,
          totalDays: dateCols.length
        }
      });

      i += 3; // Skip to next student block
    }

    return {
      success: true,
      students: students,
      dateRange: { start: startDate, end: endDate },
      dateCount: dateCols.length,
      studentCount: students.length,
      dateHeaders: dateCols.map(function(d) { return { date: d.dateStr, dayOfWeek: d.dayOfWeek }; }),
      gradeLookupMsg: config.gradesSheetName ? (gradeLookup.error || (Object.keys(gradeMap).length > 0 ? 'Grades loaded' : 'No grades found in "' + config.gradesSheetName + '"')) : ''
    };
  } catch(e) {
    return { error: 'Activity report error: ' + e.message };
  }
}

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

// ─── Scoping Helper Scopes Keys by Tutor Email ───
function getUserScopedKey(baseKey) {
  try {
    var email = Session.getActiveUser().getEmail();
    if (email) {
      return baseKey + '_' + email.toLowerCase().trim();
    }
  } catch (e) {
    // fallback if getEmail fails
  }
  return baseKey;
}

// ─── User Preference Memory (FERPA Compliant / Private to User) ───
function saveUserPreference(key, data) {
  try {
    var props = PropertiesService.getUserProperties();
    var scopedKey = getUserScopedKey(key);
    props.setProperty(scopedKey, JSON.stringify(data));
    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
}

// ─── Module B: Translate Comment via Google Translate (LanguageApp) ───
// Uses the built-in LanguageApp service — no API key or external quota needed.
// targetLang: any BCP-47 language code ('es', 'ar', 'fr', 'so', 'zh', 'vi', etc.)
function translateComment(text, targetLang) {
  try {
    if (!text || !targetLang || targetLang === 'en') {
      return { success: true, translated: text, lang: 'en' };
    }
    var translated = LanguageApp.translate(text, 'en', targetLang);
    return { success: true, translated: translated, lang: targetLang };
  } catch (e) {
    return { error: 'Translation failed: ' + e.message };
  }
}
function loadUserPreference(key) {
  try {
    var props = PropertiesService.getUserProperties();
    var scopedKey = getUserScopedKey(key);
    var val = props.getProperty(scopedKey);
    return val ? JSON.parse(val) : null;
  } catch (e) {
    return null;
  }
}

// ─── Web App Entry Point ───
function doGet(e) {
  var params = (e && e.parameter) || {};

  // Route to Student Portal when ?portal=student
  if (params.portal === 'student') {
    return HtmlService.createHtmlOutputFromFile('StudentPortal')
      .setTitle('Blueprint Student Portal')
      .setFaviconUrl('https://www.gstatic.com/images/branding/product/1x/apps_script_48dp.png')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

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

function normalizeLanguageCode(lang) {
  var code = String(lang || 'en').toLowerCase().trim();
  if (!code || code === 'english') return 'en';
  if (code === 'spanish') return 'es';
  if (code === 'portuguese') return 'pt';
  if (code === 'french') return 'fr';
  if (code === 'arabic') return 'ar';
  if (code === 'chinese') return 'zh';
  if (code === 'chinese (simplified)') return 'zh-CN';
  if (code === 'chinese (traditional)') return 'zh-TW';
  if (code === 'haitian creole') return 'ht';
  if (code === 'vietnamese') return 'vi';
  if (code === 'bengali') return 'bn';
  if (code === 'urdu') return 'ur';
  if (code === 'korean') return 'ko';
  if (code === 'russian') return 'ru';
  return code;
}

function translateOnTheFly(text, targetLang) {
  var content = String(text || '');
  var target = normalizeLanguageCode(targetLang);
  if (!content || !target || target === 'en') return content;
  try {
    return LanguageApp.translate(content, 'en', target);
  } catch (e) {
    return content;
  }
}

function calcAttendancePct(presentCount, tardyCount, scheduledCount) {
  var scheduled = Number(scheduledCount || 0);
  if (scheduled <= 0) return null;
  return Math.round(((Number(presentCount || 0) + Number(tardyCount || 0)) / scheduled) * 100);
}

// ─── Get Teacher Info ───
function getTeacherInfo() {
  var email = Session.getActiveUser().getEmail();
  return { email: email };
}

// ─── Get All Sheet Tab Names ───
function getSheetNames(spreadsheetId) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheets = ss.getSheets();
    var names = [];
    for (var i = 0; i < sheets.length; i++) {
      names.push(sheets[i].getName());
    }
    return { success: true, names: names };
  } catch (e) {
    return { error: 'Could not access spreadsheet: ' + e.message };
  }
}

// ─── ONE-SHOT Initialization: replaces getSheetNames + all sub-calls ───
// Opens the spreadsheet once and returns everything the UI needs in one call.
function initializeSpreadsheet(spreadsheetId) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheets = ss.getSheets();
    var allNames = [];
    var activitySheet = null, gradesSheet = null, emailSheet = null;

    // ── Step 1: Collect names and auto-detect tabs by keyword ──
    for (var i = 0; i < sheets.length; i++) {
      var name = sheets[i].getName();
      allNames.push(name);
      var lc = name.toLowerCase();
      if (!activitySheet && (lc.indexOf('activity') > -1 || lc.indexOf('data') > -1)) activitySheet = sheets[i];
      if (!gradesSheet  && (lc.indexOf('grade') > -1 || lc.indexOf('score') > -1))   gradesSheet  = sheets[i];
      if (!emailSheet   && (lc.indexOf('email') > -1 || lc.indexOf('parent') > -1 || lc.indexOf('contact') > -1 || lc.indexOf('directory') > -1 || lc.indexOf('roster') > -1 || lc.indexOf('student') > -1)) emailSheet = sheets[i];
    }

    // ── Step 2: Fellows from Activity Sheet ──
    var fellows = [], hasFellowColumn = false;
    if (activitySheet) {
      var lastRow = activitySheet.getLastRow();
      if (lastRow >= 5) {
        var firstDataRow = activitySheet.getRange(5, 1, 1, 4).getValues()[0];
        var colC = String(firstDataRow[2] || '').trim().toLowerCase();
        if (colC !== 'attendance' && colC !== 'exit ticket' && colC !== 'grades') {
          hasFellowColumn = true;
          var fellowData = activitySheet.getRange(5, 3, lastRow - 4, 1).getValues();
          var fellowSet = {};
          for (var f = 0; f < fellowData.length; f++) {
            var fn = String(fellowData[f][0] || '').trim();
            if (fn && !fellowSet[fn]) { fellowSet[fn] = true; fellows.push(fn); }
          }
          fellows.sort();
        }
      }
    }

    // ── Step 3: Grade Headers from Grades Sheet ──
    var gradeHeaders = [], gradeSampleData = {};
    if (gradesSheet) {
      var lastCol = gradesSheet.getLastColumn();
      var gradeLastRow = gradesSheet.getLastRow();
      // Scan rows 2,3,4 and pick the one with the most non-empty cells (likely the header)
      var bestHeaderRow = 3, bestHeaderCount = 0;
      for (var tryRow = 2; tryRow <= Math.min(5, gradeLastRow); tryRow++) {
        var rowVals = gradesSheet.getRange(tryRow, 1, 1, lastCol).getValues()[0];
        var nonEmpty = rowVals.filter(function(v){ return String(v).trim() !== ''; }).length;
        if (nonEmpty > bestHeaderCount) { bestHeaderCount = nonEmpty; bestHeaderRow = tryRow; }
      }
      var headerValues = gradesSheet.getRange(bestHeaderRow, 1, 1, lastCol).getValues()[0];
      // Top-level section headers (row 1, merged cells filled-forward)
      var row1Values = gradesSheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
      var topHeaders = {}, currentSection = '';
      for (var c = 0; c < row1Values.length; c++) {
        var v = String(row1Values[c] || '').trim();
        if (v) currentSection = v;
        topHeaders[indexToCol(c + 1)] = currentSection;
      }
      for (var c = 0; c < headerValues.length; c++) {
        var txt = String(headerValues[c] || '').trim();
        if (txt) {
          gradeHeaders.push({ col: indexToCol(c + 1), colIndex: c + 1, header: txt, topHeader: topHeaders[indexToCol(c + 1)] || '' });
        }
      }
      // Sample data (rows after header row)
      var dataStartRow = bestHeaderRow + 1;
      var sampleCount = Math.min(10, gradeLastRow - bestHeaderRow);
      if (sampleCount > 0) {
        var sampleRange = gradesSheet.getRange(dataStartRow, 1, sampleCount, lastCol).getValues();
        for (var c = 0; c < gradeHeaders.length; c++) {
          var colIdx = gradeHeaders[c].colIndex - 1;
          var samples = [];
          for (var r = 0; r < sampleRange.length; r++) {
            var sv = String(sampleRange[r][colIdx] || '').trim();
            if (sv) samples.push(sv);
          }
          gradeSampleData[gradeHeaders[c].col] = samples.slice(0, 5);
        }
      }
    }

    // ── Step 4: Email Config from Email Sheet ──
    var emailConfig = null;
    if (emailSheet) {
      var maxSearchRows = Math.min(emailSheet.getLastRow(), 5);
      if (maxSearchRows < 1) maxSearchRows = 1;
      var allEHeaders = emailSheet.getRange(1, 1, maxSearchRows, Math.min(emailSheet.getLastColumn(), 26)).getValues();
      var eNameCol = '', eParentEmailCol = '', eStudentEmailCol = '', eHeaderRow = 1, foundHeaders = [];
      for (var r = 0; r < allEHeaders.length; r++) {
        var rowH = allEHeaders[r], hasEmail = false, hasName = false;
        for (var j = 0; j < rowH.length; j++) {
          var h = String(rowH[j]).toLowerCase();
          if (h.indexOf('email') > -1 || h.indexOf('e-mail') > -1) hasEmail = true;
          if (h.indexOf('name') > -1 || h.indexOf('student') > -1 || h.indexOf('fellow') > -1) hasName = true;
        }
        if (hasEmail && hasName) { foundHeaders = rowH; eHeaderRow = r + 1; break; }
      }
      if (foundHeaders.length === 0) { foundHeaders = allEHeaders[0]; eHeaderRow = 1; }
      for (var j = 0; j < foundHeaders.length; j++) {
        var rawH = String(foundHeaders[j]).toLowerCase();
        var h = rawH.replace(/[^a-z0-9]/g, '');
        var colL = String.fromCharCode(65 + j);
        if ((h.indexOf('name') > -1 || h.indexOf('student') > -1 || h.indexOf('fellow') > -1) && !eNameCol && h.indexOf('email') === -1) eNameCol = colL;
        if (h.indexOf('email') > -1 && (h.indexOf('parent') > -1 || h.indexOf('guardian') > -1 || h.indexOf('contact') > -1) && !eParentEmailCol) eParentEmailCol = colL;
        if (h.indexOf('email') > -1 && h.indexOf('student') > -1 && !eStudentEmailCol) eStudentEmailCol = colL;
      }
      if (!eParentEmailCol) {
        for (var j = 0; j < foundHeaders.length; j++) {
          var h = String(foundHeaders[j]).toLowerCase();
          var colL = String.fromCharCode(65 + j);
          if (h.indexOf('email') > -1 && colL !== eStudentEmailCol) { eParentEmailCol = colL; break; }
        }
      }
      if (eParentEmailCol || eStudentEmailCol) {
        emailConfig = { sheetName: emailSheet.getName(), headerRow: eHeaderRow, nameCol: eNameCol || 'A', parentEmailCol: eParentEmailCol || '', studentEmailCol: eStudentEmailCol || '', allSheetNames: allNames };
      }
    }

    return {
      success: true,
      names: allNames,
      detectedActivity: activitySheet ? activitySheet.getName() : '',
      detectedGrades:   gradesSheet  ? gradesSheet.getName()  : '',
      detectedEmail:    emailSheet   ? emailSheet.getName()   : '',
      fellows: fellows,
      hasFellowColumn: hasFellowColumn,
      gradeHeaders: gradeHeaders,
      gradeSampleData: gradeSampleData,
      emailConfig: emailConfig
    };
  } catch (e) {
    return { error: 'Could not access spreadsheet: ' + e.message };
  }
}


// ─── Get Column Headers from a Sheet ───
function getSheetHeaders(spreadsheetId, sheetName, headerRow) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      return { error: 'Sheet tab "' + sheetName + '" not found.' };
    }

    var row = parseInt(headerRow) || 3;
    var lastCol = sheet.getLastColumn();
    if (lastCol < 1) return { error: 'Sheet appears to be empty.' };

    var values = sheet.getRange(row, 1, 1, lastCol).getValues()[0];
    var headers = [];

    for (var i = 0; i < values.length; i++) {
      var text = String(values[i] || '').trim();
      if (text) {
        headers.push({
          col: indexToCol(i + 1),
          colIndex: i + 1,
          header: text
        });
      }
    }

    // Also grab a small sample of data rows (up to 10) for smarter auto-detection
    var lastRow = sheet.getLastRow();
    var sampleRows = Math.min(10, lastRow - row);
    var sampleData = {};
    if (sampleRows > 0) {
      var dataRange = sheet.getRange(row + 1, 1, sampleRows, lastCol).getValues();
      for (var c = 0; c < headers.length; c++) {
        var colIdx = headers[c].colIndex - 1;
        var samples = [];
        for (var r = 0; r < dataRange.length; r++) {
          var val = String(dataRange[r][colIdx] || '').trim();
          if (val) samples.push(val);
        }
        sampleData[headers[c].col] = samples.slice(0, 5); // max 5 samples per column
      }
    }

    // Read Row 1 (top-level section headers like "Full Year", "Semester 2", etc.)
    // These are typically merged cells, so we read the display values
    var row1Values = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    // Build a map of colIndex -> topHeader. For merged cells, only the leftmost cell has text.
    // We need to "fill forward" to cover the merged span.
    var topHeaders = {};
    var currentSection = '';
    for (var i = 0; i < row1Values.length; i++) {
      var val = String(row1Values[i] || '').trim();
      if (val) currentSection = val;
      topHeaders[indexToCol(i + 1)] = currentSection;
    }

    // Attach the top-level section header to each column header object
    for (var h = 0; h < headers.length; h++) {
      headers[h].topHeader = topHeaders[headers[h].col] || '';
    }

    // Also detect the first row of data (row after header)
    var dataStartRow = row + 1;

    return { success: true, headers: headers, headerRow: row, dataStartRow: dataStartRow, sampleData: sampleData, topHeaders: topHeaders };
  } catch (e) {
    return { error: 'Could not read headers: ' + e.message };
  }
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
  var parentEmailCol = colToIndex(config.emailSheetEmailCol || 'B');
  var studentEmailCol = config.emailSheetStudentEmailCol ? colToIndex(config.emailSheetStudentEmailCol) : 0;
  
  var maxCol = Math.max(nameCol, parentEmailCol, studentEmailCol);
  var lastRow = emailSheet.getLastRow();
  var headerRow = config.emailSheetHeaderRow || 1;
  var startRow = headerRow + 1;
  
  if (lastRow < startRow) return { map: lookup, rawNames: [], sheetFound: true };

  var data = emailSheet.getRange(startRow, 1, lastRow - startRow + 1, maxCol).getValues();
  var rawNames = [];

  for (var i = 0; i < data.length; i++) {
    var name = String(data[i][nameCol - 1] || '').trim();
    var parentEmail = String(data[i][parentEmailCol - 1] || '').trim();
    var studentEmail = studentEmailCol > 0 ? String(data[i][studentEmailCol - 1] || '').trim() : '';
    
    if (name && (parentEmail || studentEmail)) {
      rawNames.push(name);
      // Store all name variants for flexible matching
      var keys = nameVariants(name);
      for (var k = 0; k < keys.length; k++) {
        lookup[keys[k]] = { parentEmail: parentEmail, studentEmail: studentEmail };
      }
    }
  }

  return { map: lookup, rawNames: rawNames, sheetFound: true };
}

// Helper: Clean name for robust comparison (lowercase, strip punctuation/initials)
function cleanNameForMatching(name) {
  if (!name) return '';
  var cleaned = name.toLowerCase()
    .replace(/[.,'\-]/g, ' ') // replace punctuation with space
    .replace(/\s+/g, ' ')     // collapse spaces
    .trim();
  
  // Remove middle initials (single letters surrounded by spaces or at the end)
  cleaned = cleaned.replace(/\s[a-z]\s/g, ' ')
                   .replace(/\s[a-z]$/g, '');
  return cleaned;
}

// Helper: Token-based flexible name comparison
function areNamesMatching(nameA, nameB) {
  var cleanA = cleanNameForMatching(nameA);
  var cleanB = cleanNameForMatching(nameB);
  if (!cleanA || !cleanB) return false;
  if (cleanA === cleanB) return true;

  // Split into individual word tokens
  var tokensA = cleanA.split(' ');
  var tokensB = cleanB.split(' ');

  // Filter out single-character initials
  tokensA = tokensA.filter(function(t) { return t.length > 1; });
  tokensB = tokensB.filter(function(t) { return t.length > 1; });

  if (tokensA.length === 0 || tokensB.length === 0) return false;

  // Check if all tokens of one name are present in the other (order independent)
  var matchCount = 0;
  for (var i = 0; i < tokensA.length; i++) {
    if (tokensB.indexOf(tokensA[i]) > -1) {
      matchCount++;
    }
  }
  
  // Require at least 2 tokens to match (or all if name has only 1 token)
  var minRequired = Math.min(tokensA.length, tokensB.length, 2);
  return matchCount >= minRequired;
}

// Helper: Look up email using multiple name format attempts and robust fuzzy fallback
function lookupEmail(emailMap, studentName) {
  if (!emailMap || Object.keys(emailMap).length === 0) return null;
  
  // 1. Try exact matches on name variants first (very fast)
  var keys = nameVariants(studentName);
  for (var i = 0; i < keys.length; i++) {
    if (emailMap[keys[i]]) return emailMap[keys[i]];
  }
  
  // 2. Token-based fuzzy match fallback
  var allKeys = Object.keys(emailMap);
  for (var j = 0; j < allKeys.length; j++) {
    if (areNamesMatching(allKeys[j], studentName)) {
      return emailMap[allKeys[j]];
    }
  }
  
  return null;
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
     try {
      var s = emailData.students[i];
      // Extract first name for greeting
      var firstName = s.name.indexOf(',') > -1
        ? (s.name.split(',')[1] || '').trim()
        : s.name.split(',')[0].trim();
      if (!firstName) firstName = s.name;

      var grade = s.grade || '';
      var tardies = s.tardies || 0;
      var absences = s.absences || 0;
      var teacherName = emailData.teacherName || teacherEmail;

      // Localization & Translation
      var lang = s.lang || 'en';
      var translatedParentComment = s.parentComment;
      var translatedStudentComment = s.studentComment;
      var translatedCustomMessage = emailData.customMessage;

      if (lang && lang !== 'en') {
        try {
          if (s.parentComment) {
            translatedParentComment = LanguageApp.translate(s.parentComment, 'en', lang);
          }
        } catch(e) { Logger.log('Parent comment translate error: ' + e.message); }
        try {
          if (s.studentComment) {
            translatedStudentComment = LanguageApp.translate(s.studentComment, 'en', lang);
          }
        } catch(e) { Logger.log('Student comment translate error: ' + e.message); }
        try {
          if (emailData.customMessage) {
            translatedCustomMessage = LanguageApp.translate(emailData.customMessage, 'en', lang);
          }
        } catch(e) { Logger.log('Custom message translate error: ' + e.message); }
      }

      var subject = emailData.subject.replace('{student}', firstName);
      if (lang && lang !== 'en') {
        try {
          subject = LanguageApp.translate(subject, 'en', lang);
        } catch(e) { Logger.log('Subject translate error: ' + e.message); }
      }

      // Helper function to build HTML
      function buildHtmlEmail(recipientType, comment) {
        var isParent = (recipientType === 'parent');
        var greetingText = isParent
          ? getLocalizedText('dearParent', lang, 'Dear Parent/Guardian of {student},', firstName)
          : getLocalizedText('dearStudent', lang, 'Dear {student},', firstName);

        // Apply RTL to ALL Arabic emails (both parent and student)
        var isRtl = (lang === 'ar');
        var commentDirStyle = isRtl
          ? 'dir="rtl" style="direction:rtl;text-align:right;border-right:4px solid #6bb8c9;border-left:none;padding:12px 16px;background:#f0f9fa;margin:0 0 20px;font-size:14px;line-height:1.6;"'
          : 'dir="ltr" style="direction:ltr;text-align:left;border-left:4px solid #6bb8c9;border-right:none;padding:12px 16px;background:#f0f9fa;margin:0 0 20px;font-size:14px;line-height:1.6;"';

        var htmlBody = ''
          + '<!DOCTYPE html><html' + (isRtl ? ' dir="rtl"' : '') + '><head><meta name="viewport" content="width=device-width,initial-scale=1">'
          + '<style>@media(max-width:600px){.email-wrap{width:100%!important;max-width:100%!important;padding:0!important}.email-body{padding:16px!important}.email-table td{display:block!important;width:100%!important;' + (isRtl ? 'text-align:right' : 'text-align:left') + '!important;padding:4px 0!important}}</style></head><body style="margin:0;padding:0;background:#f0f2f5;' + (isRtl ? 'direction:rtl;text-align:right;' : 'direction:ltr;text-align:left;') + '">'
          + '<div class="email-wrap" style="width:100%;max-width:680px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#333;' + (isRtl ? 'direction:rtl;' : 'direction:ltr;') + '">'
          + '<div style="background:#2c3e50;padding:20px 24px;border-radius:8px 8px 0 0;' + (isRtl ? 'direction:rtl;' : '') + '">'
          + '<table width="100%" cellpadding="0" cellspacing="0" ' + (isRtl ? 'dir="rtl"' : '') + '><tr>'
          + '<td style="color:#fff;font-size:18px;font-weight:bold;' + (isRtl ? 'text-align:right;' : 'text-align:left;') + '">' + getLocalizedText('reportTitle', lang, 'Biweekly Progress Report') + '</td>'
          + '<td style="' + (isRtl ? 'text-align:left;' : 'text-align:right;') + '">'
          + '<span style="color:#6bb8c9;font-size:22px;font-weight:bold;">blueprint</span><br>'
          + '<span style="color:#6bb8c9;font-size:11px;">schools network</span>'
          + '</td></tr></table></div>'
          + '<div class="email-body" style="padding:24px;background:#fff;border-left:1px solid #ddd;border-right:1px solid #ddd;' + (isRtl ? 'direction:rtl;text-align:right;' : 'direction:ltr;text-align:left;') + '">'
          + '<p style="margin:0 0 16px;font-size:15px;' + (isRtl ? 'text-align:right;' : 'text-align:left;') + '">' + greetingText + '</p>'
          + '<div style="background:#f8f9fa;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:0 0 20px;' + (isRtl ? 'direction:rtl;text-align:right;' : 'direction:ltr;text-align:left;') + '">'
          + '<div style="font-weight:bold;font-size:14px;margin-bottom:12px;color:#2c3e50;' + (isRtl ? 'text-align:right;' : 'text-align:left;') + '">' + getLocalizedText('studentSummary', lang, 'Student Summary') + '</div>'
          + '<table class="email-table" cellpadding="0" cellspacing="0" style="font-size:14px;width:100%;' + (isRtl ? 'direction:rtl;text-align:right;' : 'direction:ltr;text-align:left;') + '" ' + (isRtl ? 'dir="rtl"' : '') + '>'
          + '<tr><td style="padding:4px ' + (isRtl ? '0 4px 16px' : '16px 4px 0') + ';color:#666;width:110px;">' + getLocalizedText('student', lang, 'Student') + '</td><td style="font-weight:bold;">' + s.name + '</td></tr>'
          + '<tr><td style="padding:4px ' + (isRtl ? '0 4px 16px' : '16px 4px 0') + ';color:#666;">' + getLocalizedText('grade', lang, 'Grade') + '</td><td><span style="display:inline-block;padding:2px 10px;border-radius:4px;font-weight:bold;background:' + (grade === 'A' || grade === 'B' ? '#d1fae5;color:#059669' : grade === 'C' || grade === 'D' ? '#fef3c7;color:#d97706' : grade === 'F' ? '#fee2e2;color:#dc2626' : '#f3f4f6;color:#6b7280') + ';">' + (grade || '—') + '</span></td></tr>'
          + '<tr><td style="padding:4px ' + (isRtl ? '0 4px 16px' : '16px 4px 0') + ';color:#666;">' + getLocalizedText('tardies', lang, 'Tardies') + '</td><td>' + tardies + '</td></tr>'
          + '<tr><td style="padding:4px ' + (isRtl ? '0 4px 16px' : '16px 4px 0') + ';color:#666;">' + getLocalizedText('absences', lang, 'Absences') + '</td><td>' + absences + '</td></tr>'
          + '</table></div>'
          + '<div ' + commentDirStyle + '>'
          + comment
          + '</div>';

        if (translatedCustomMessage) {
          htmlBody += '<p style="font-size:14px;line-height:1.6;' + (isRtl ? 'direction:rtl;text-align:right;' : 'direction:ltr;text-align:left;') + '">' + translatedCustomMessage.replace(/\n/g, '<br>') + '</p>';
        }

        htmlBody += '<p style="font-size:14px;' + (isRtl ? 'direction:rtl;text-align:right;' : 'direction:ltr;text-align:left;') + '">' + getLocalizedText('questions', lang, 'If you have any questions or concerns, please do not hesitate to reach out.') + '</p>'
          + '<p style="font-size:14px;margin-bottom:0;' + (isRtl ? 'direction:rtl;text-align:right;' : 'direction:ltr;text-align:left;') + '">' + getLocalizedText('regards', lang, 'Best regards,') + '<br>'
          + '<strong>' + teacherName + '</strong><br>'
          + '<span style="color:#666;font-size:13px;">' + teacherEmail + '</span></p>'
          + '</div>'
          + '<div style="background:#f8f9fa;padding:12px 24px;text-align:center;border:1px solid #ddd;border-top:none;border-radius:0 0 8px 8px;' + (isRtl ? 'direction:rtl;' : 'direction:ltr;') + '">'
          + '<span style="color:#999;font-size:11px;">Blueprint Schools Network · ' + getLocalizedText('reportTitle', lang, 'Biweekly Progress Report') + '</span>'
          + '</div></div></body></html>';
        return htmlBody;
      }

      function buildPlainEmail(recipientType, comment) {
        var isParent = (recipientType === 'parent');
        var greeting = isParent
          ? getLocalizedText('dearParent', lang, 'Dear Parent/Guardian of {student},\n\n', firstName)
          : getLocalizedText('dearStudent', lang, 'Dear {student},\n\n', firstName);
        var plainBody = greeting + comment + '\n\n';
        if (translatedCustomMessage) {
          plainBody += translatedCustomMessage + '\n\n';
        }
        plainBody += getLocalizedText('questions', lang, 'If you have any questions or concerns, please do not hesitate to reach out.')
          + '\n\n'
          + getLocalizedText('regards', lang, 'Best regards,\n')
          + teacherName + '\n'
          + teacherEmail;
        return plainBody;
      }

      // Send to Parent
      if (s.parentEmail) {
        GmailApp.sendEmail(s.parentEmail, subject, buildPlainEmail('parent', translatedParentComment), {
          htmlBody: buildHtmlEmail('parent', translatedParentComment),
          name: emailData.teacherName || '',
          replyTo: teacherEmail
        });
        sent++;
      }

      // Send to Student
      if (s.studentEmail) {
        GmailApp.sendEmail(s.studentEmail, subject, buildPlainEmail('student', translatedStudentComment), {
          htmlBody: buildHtmlEmail('student', translatedStudentComment),
          name: emailData.teacherName || '',
          replyTo: teacherEmail
        });
        sent++;
      }
    } catch (e) {
      failed++;
      errors.push({ name: s.name, email: s.parentEmail || s.studentEmail, error: e.message });
    }
  }

  // Check remaining quota (removed due to permission issues)
  var remaining = 999;

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
    var msg = firstName + '- you have shown real potential this period, and you currently have a ' + grade + ' in the class.';
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
    var msg = firstName + '- I know you can improve, and I want to help you be successful. Right now your grade is an F.';
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
      msg += firstName + ' has perfect attendance this period with no tardies or absences. Their commitment to education is exemplary and we are very proud of their consistent effort and performance.';
    } else if (tardies > 0) {
      msg += firstName + ' has ' + spellNumber(tardies) + ' ' + (tardies === 1 ? 'tardy' : 'tardies') + ' and ' + (absences === 0 ? 'zero absences' : spellNumber(absences) + (absences === 1 ? ' absence' : ' absences')) + ' this period. Improving punctuality would help make the most of class time. We appreciate your support in encouraging on-time arrival.';
    } else {
      msg += firstName + ' has zero tardies and ' + (absences === 1 ? 'only one absence' : spellNumber(absences) + ' absences') + ' this period. Their consistent work ethic and focus in class are commendable. We are very pleased with their academic progress.';
    }
    return msg;
  }

  if (grade === 'C' || grade === 'D') {
    var msg = firstName + ' has shown positive effort this period and is currently maintaining a ' + grade + ' grade in the course.';
    if (tardies > 3) {
      msg += ' ' + firstName + ' has ' + spellNumber(tardies) + ' tardies this period and ' + (absences === 0 ? 'zero absences' : spellNumber(absences) + (absences === 1 ? ' absence' : ' absences')) + '. Improving punctuality would help make the most of class time and improve academic standing. We appreciate your support in encouraging on-time arrival.';
    } else if (absences > 0) {
      msg += ' ' + firstName + ' has ' + (tardies === 0 ? 'zero tardies' : spellNumber(tardies) + (tardies === 1 ? ' tardy' : ' tardies')) + ' and ' + (absences === 1 ? 'only one absence' : spellNumber(absences) + ' absences') + ' this period. We encourage continued focus on classwork and participation to further improve academic standing.';
    } else {
      msg += ' ' + firstName + ' has solid attendance with no tardies or absences. We hope to see continued consistency and work towards a higher grade.';
    }
    return msg;
  }

  if (grade === 'F') {
    var msg = firstName + ' has the ability to improve, and we want to partner with you to support that growth. At this time, they are struggling in the course with an F grade.';
    if (tardies > 0 || absences > 0) {
      var parts = [];
      if (tardies > 0) parts.push(spellNumber(tardies) + ' ' + (tardies === 1 ? 'tardy' : 'tardies'));
      if (absences > 0) parts.push(spellNumber(absences) + ' ' + (absences === 1 ? 'absence' : 'absences'));
      msg += ' ' + firstName + ' has accumulated ' + parts.join(' and ') + ' this period which is impacting their ability to follow the curriculum consistently. We would like to work with you to ensure they have the support needed to improve their academic performance.';
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
 * Quickly extract unique fellow names from column C of an activity sheet.
 * Called when the user selects a sheet tab, before loading dates.
 */
function getActivityFellows(spreadsheetId, sheetName) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return { fellows: [], hasFellowColumn: false };

    var lastRow = sheet.getLastRow();
    if (lastRow < 5) return { fellows: [], hasFellowColumn: false };

    // Auto-detect if Fellow column is missing
    var firstDataRow = sheet.getRange(5, 1, 1, 4).getValues()[0];
    var colC = String(firstDataRow[2] || '').trim().toLowerCase();
    if (colC === 'attendance' || colC === 'exit ticket' || colC === 'grades') {
      return { fellows: [], hasFellowColumn: false };
    }

    // Column C = column 3, start reading from row 5 (after headers)
    var data = sheet.getRange(5, 3, lastRow - 4, 1).getValues();
    var fellowSet = {};
    var fellows = [];
    for (var i = 0; i < data.length; i++) {
      var name = String(data[i][0] || '').trim();
      if (name && !fellowSet[name]) {
        fellowSet[name] = true;
        fellows.push(name);
      }
    }
    fellows.sort();
    return { fellows: fellows, hasFellowColumn: true };
  } catch (e) {
    return { fellows: [], hasFellowColumn: false };
  }
}

/**
 * Parse a display date string like "2/20/2026" or "2/20/26" into components.
 * Returns { month, day, year, dateObj, dayOfWeek (0=Sun..6=Sat) } or null.
 * Uses explicit year/month/day construction to avoid timezone shifts.
 */
function parseDateStr(str) {
  if (!str) return null;
  var s = String(str).trim();
  var parts = s.split('/');
  if (parts.length !== 3) return null;
  var m = parseInt(parts[0]);
  var d = parseInt(parts[1]);
  var y = parseInt(parts[2]);
  if (isNaN(m) || isNaN(d) || isNaN(y)) return null;
  if (y < 100) y += 2000;
  // Construct date from explicit components — day-of-week is always correct
  var dateObj = new Date(y, m - 1, d);
  return {
    month: m,
    day: d,
    year: y,
    dateObj: dateObj,
    dayOfWeek: dateObj.getDay(), // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
    isoDate: y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'),
    dateStr: s
  };
}

/**
 * Scan row 4 of the activity sheet for date columns.
 * Returns all available dates for the date-range picker.
 * Uses getDisplayValues() to read dates as raw strings, avoiding timezone shifts.
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
    var row4 = sheet.getRange(dateRow, 1, 1, lastCol).getDisplayValues()[0];

    var todayIso = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

    var dates = [];
    for (var i = 0; i < row4.length; i++) {
      var parsed = parseDateStr(row4[i]);
      if (!parsed) continue;
      if (parsed.isoDate > todayIso) continue; // skip future dates
      var dow = parsed.dayOfWeek; // 0=Sun, 6=Sat
      if (dow === 0 || dow === 6) continue; // Skip Sat & Sun
      dates.push({
        col: i + 1,
        dateStr: parsed.dateStr,
        isoDate: parsed.isoDate,
        dayOfWeek: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow]
      });
    }

    if (dates.length === 0) {
      return { error: 'No dates found in row ' + dateRow + '. Make sure the activity sheet has dates in row ' + dateRow + '.' };
    }

    // Extract unique fellow names from column C (0-based index 2)
    var FELLOW_COL = 2; // Column C
    var lastRow = sheet.getLastRow();
    var dataStartRow = dateRow + 1;
    var fellows = [];
    var hasFellowColumn = true;
    
    if (lastRow >= dataStartRow) {
      // Auto-detect if Fellow column is missing
      var firstDataRow = sheet.getRange(dataStartRow, 1, 1, 4).getValues()[0];
      var colC = String(firstDataRow[2] || '').trim().toLowerCase();
      if (colC === 'attendance' || colC === 'exit ticket' || colC === 'grades') {
        hasFellowColumn = false;
        FELLOW_COL = null;
      }
      
      if (hasFellowColumn) {
        var fellowData = sheet.getRange(dataStartRow, FELLOW_COL + 1, lastRow - dataStartRow + 1, 1).getValues();
        var fellowSet = {};
        for (var f = 0; f < fellowData.length; f++) {
          var name = String(fellowData[f][0] || '').trim();
          if (name && !fellowSet[name]) {
            fellowSet[name] = true;
            fellows.push(name);
          }
        }
        fellows.sort();
      }
    }

    return { success: true, dates: dates, total: dates.length, fellows: fellows, hasFellowColumn: hasFellowColumn };
  } catch(e) {
    return { error: 'Could not load dates: ' + e.message };
  }
}

/**
 * Build a name → grade lookup from a separate grades tab.
 * Returns { map: { "name": "A", ... }, found: true/false }
 * 
 * Uses config.gradesGradeCol (user-selected column) as the primary source.
 * Falls back to scanning for "Full Year" → "Letter Grade" if no column specified.
 */
function buildGradeLookup(ss, config, endDate) {
  var lookup = {};
  if (!config.gradesSheetName) return { map: lookup, found: false };

  var gradeSheet = ss.getSheetByName(config.gradesSheetName);
  if (!gradeSheet) return { map: lookup, found: false, error: 'Sheet "' + config.gradesSheetName + '" not found' };

  var lastCol = gradeSheet.getLastColumn();
  var lastRow = gradeSheet.getLastRow();
  var nameCol = colToIndex(config.gradesNameCol || 'B') - 1; // 0-based
  var startRow = parseInt(config.gradesStartRow) || 5;

  // ── Primary: Use user-selected grade column ──
  var targetCol = null;
  if (config.gradesGradeCol) {
    targetCol = colToIndex(config.gradesGradeCol) - 1; // 0-based
  }

  // ── Fallback: Scan for "Full Year" → "Letter Grade" in rows 2 & 4 ──
  if (targetCol === null) {
    var row2 = gradeSheet.getRange(2, 1, 1, lastCol).getValues()[0];
    var row4 = gradeSheet.getRange(4, 1, 1, lastCol).getValues()[0];

    for (var c = 0; c < row2.length; c++) {
      var r2Label = String(row2[c] || '').toLowerCase();
      
      // Look for Year-long grade column
      if (r2Label.indexOf('full year') > -1 || r2Label.indexOf('year grade') > -1 || r2Label.indexOf('full-year') > -1) {
        for (var lc = c; lc < row4.length; lc++) {
          var header = String(row4[lc] || '').toLowerCase();
          // If we hit the next period in row 2, stop looking in this section
          if (lc > c && row2[lc] && row2[lc] !== row2[c]) break;
          
          if (header.indexOf('letter grade') > -1 || header.indexOf('grade') === 0) {
            targetCol = lc;
            break;
          }
        }
      }
      if (targetCol !== null) break;
    }
  }

  // ── Emergency Fallback: Scan the header row (startRow - 1) for any "grade" column ──
  if (targetCol === null) {
    try {
      var headerRowIdx = Math.max(1, startRow - 1);
      var headers = gradeSheet.getRange(headerRowIdx, 1, 1, lastCol).getValues()[0];
      for (var c = 0; c < headers.length; c++) {
        var h = String(headers[c] || '').toLowerCase();
        if (h.indexOf('letter grade') > -1 || h === 'grade' || h.indexOf('grade') > -1) {
          targetCol = c;
          break;
        }
      }
    } catch(e) {}
  }

  if (targetCol === null) {
    return { map: lookup, found: false, error: 'No grade column found — select one in the Grade Lookup settings' };
  }


  if (lastRow < startRow) return { map: lookup, found: false, error: 'No data in grades sheet starting from row ' + startRow };

  // Read data
  var maxCol = Math.max(nameCol, targetCol) + 1;
  var data = gradeSheet.getRange(startRow, 1, lastRow - startRow + 1, maxCol).getValues();

  for (var i = 0; i < data.length; i++) {
    var name = String(data[i][nameCol] || '').trim();
    var grade = String(data[i][targetCol] || '').trim().toUpperCase();
    
    if (name && grade) {
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

    // Parse start/end as numeric YYYYMMDD for clean comparison (no timezone)
    var startParts = startDate.split('-');
    var endParts = endDate.split('-');
    var startNum = parseInt(startParts[0]) * 10000 + parseInt(startParts[1]) * 100 + parseInt(startParts[2]);
    var endNum = parseInt(endParts[0]) * 10000 + parseInt(endParts[1]) * 100 + parseInt(endParts[2]);

    // Scan row 4 for date columns within range (using display values to avoid timezone shifts)
    var row4 = sheet.getRange(dateRow, 1, 1, lastCol).getDisplayValues()[0];
    var dateCols = [];
    for (var i = 0; i < row4.length; i++) {
      var parsed = parseDateStr(row4[i]);
      if (!parsed) continue;
      var dow = parsed.dayOfWeek; // 0=Sun, 6=Sat
      if (dow === 0 || dow === 6) continue; // Skip weekends
      var dateNum = parsed.year * 10000 + parsed.month * 100 + parsed.day;
      if (dateNum >= startNum && dateNum <= endNum) {
        dateCols.push({
          colIdx: i,
          date: parsed.dateObj,
          dateStr: parsed.dateStr,
          isoDate: parsed.isoDate,
          dayOfWeek: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow]
        });
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

    // Auto-detect if Fellow column is missing
    var firstDataRow = sheet.getRange(dataStartRow, 1, 1, 4).getValues()[0];
    var colC = String(firstDataRow[2] || '').trim().toLowerCase();
    var hasFellowColumn = true;
    if (colC === 'attendance' || colC === 'exit ticket' || colC === 'grades') {
      hasFellowColumn = false;
      FELLOW_COL = null;
      COMPONENT_COL = 2;
    }

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
      var fellow = FELLOW_COL !== null ? String(data[i][FELLOW_COL] || '').trim() : '';

      // Look up letter grade from the grades sheet
      var letterGrade = '';
      if (Object.keys(gradeMap).length > 0) {
        letterGrade = lookupEmail(gradeMap, name) || ''; // reuse the flexible name lookup
      }

      // Extract data for each date column
      var dateData = [];
      var totalPresent = 0, totalTardy = 0, totalAbsent = 0, totalNotScheduled = 0, totalScheduledDays = 0;

      for (var d = 0; d < dateCols.length; d++) {
        var colIdx = dateCols[d].colIdx;

        // Attendance
        var attendance = attendanceRowIdx !== null ? String(data[attendanceRowIdx][colIdx] || '').trim() : '';
        var attLower = attendance.toLowerCase();
        var isAbsent = (attLower === 'absent');

        // Exit Ticket (skip if absent)
        var etRaw = (isAbsent || exitTicketRowIdx === null) ? '' : data[exitTicketRowIdx][colIdx];
        var etValue = parseFloat(etRaw);
        var etDisplay = isNaN(etValue) ? '' : etValue;

        // GRADES string (skip if absent)
        var gradesStr = (isAbsent || gradesRowIdx === null) ? '—' : String(data[gradesRowIdx][colIdx] || '').trim().toUpperCase();

        // Calculate participation % from GRADES (skip if absent)
        var participationPct = null;
        if (!isAbsent && gradesStr && gradesStr !== '—') {
          var pointsEarned = 0;
          var totalPossible = 6;
          var showPoints = false;
          for (var c = 0; c < gradesStr.length; c++) {
            var char = gradesStr[c];
            if (char === 'X') {
              totalPossible--;
            } else if (/[GRADES]/.test(char)) {
              pointsEarned++;
            }
          }
          if (gradesStr && gradesStr !== '—') {
            showPoints = true;
          }
          if (totalPossible < 0) totalPossible = 0;
          participationPct = totalPossible > 0 ? Math.round((pointsEarned / totalPossible) * 100) : 100;
        }

        // Count attendance totals

        if (attLower === 'present') { totalPresent++; totalScheduledDays++; }
        else if (attLower === 'tardy') { totalTardy++; totalScheduledDays++; }
        else if (attLower === 'absent') { totalAbsent++; totalScheduledDays++; }
        else if (attLower.indexOf('not s') > -1 || attLower.indexOf('not scheduled') > -1) totalNotScheduled++;

        dateData.push({
          date: dateCols[d].dateStr,
          dayOfWeek: dateCols[d].dayOfWeek,
          attendance: attendance || '—',
          exitTicket: etDisplay,
          exitTicketPct: !isNaN(etValue) ? Math.round((etValue / 4) * 100) : null,
          gradesStr: gradesStr || '—',
          participationPct: participationPct,
          participationPoints: showPoints ? (pointsEarned + '/' + totalPossible) : null
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
          totalDays: dateCols.length,
          totalScheduledDays: totalScheduledDays,
          attendancePct: calcAttendancePct(totalPresent, totalTardy, totalScheduledDays)
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

// ═══════════════════════════════════════════════════
// ─── Generate Comments from Activity Data ───
// ═══════════════════════════════════════════════════


// ─── Auto-Detect Email Config ───
function autoDetectEmailConfig(spreadsheetId, forceSheetName) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheets = ss.getSheets();
    var emailSheet = null;
    var allSheetNames = [];
    
    // Collect all names and find the target sheet
    for (var i = 0; i < sheets.length; i++) {
      var name = sheets[i].getName();
      allSheetNames.push(name);
      
      if (forceSheetName && name === forceSheetName) {
        emailSheet = sheets[i];
      } else if (!forceSheetName && !emailSheet) {
        var lowerName = name.toLowerCase();
        if (lowerName.indexOf('email') > -1 || lowerName.indexOf('parent') > -1 || lowerName.indexOf('contact') > -1 || lowerName.indexOf('directory') > -1 || lowerName.indexOf('roster') > -1 || lowerName.indexOf('student') > -1) {
          emailSheet = sheets[i];
        }
      }
    }

    if (!emailSheet) {
      return { 
        error: "Could not auto-detect an Email sheet. Please select your email/contacts sheet from the Email Sheet Tab dropdown.",
        allSheetNames: allSheetNames
      };
    }
    
    var maxSearchRows = Math.min(emailSheet.getLastRow(), 5);
    if (maxSearchRows < 1) maxSearchRows = 1;
    var allHeaders = emailSheet.getRange(1, 1, maxSearchRows, Math.min(emailSheet.getLastColumn(), 26)).getValues();
    
    var nameCol = '', parentEmailCol = '', studentEmailCol = '';
    var headerRow = 1;
    var foundHeaders = [];

    // Find which row looks most like a header row
    for (var r = 0; r < allHeaders.length; r++) {
      var rowHeaders = allHeaders[r];
      var hasEmailWord = false;
      var hasNameWord = false;
      
      for (var j = 0; j < rowHeaders.length; j++) {
         var h = String(rowHeaders[j]).toLowerCase();
         if (h.indexOf('email') > -1 || h.indexOf('e-mail') > -1) hasEmailWord = true;
         if (h.indexOf('name') > -1 || h.indexOf('student') > -1 || h.indexOf('fellow') > -1) hasNameWord = true;
      }
      
      if (hasEmailWord && hasNameWord) {
        foundHeaders = rowHeaders;
        headerRow = r + 1; // 1-indexed
        break;
      }
    }
    
    if (foundHeaders.length === 0) {
      foundHeaders = allHeaders[0];
      headerRow = 1;
    }
    
    for (var j = 0; j < foundHeaders.length; j++) {
      var rawH = String(foundHeaders[j]).toLowerCase();
      var h = rawH.replace(/[^a-z0-9]/g, ''); // strip spaces and special chars
      var colLetter = String.fromCharCode(65 + j); // A, B, C...
      
      if ((h.indexOf('name') > -1 || h.indexOf('student') > -1 || h.indexOf('fellow') > -1) && !nameCol && h.indexOf('email') === -1) {
        nameCol = colLetter;
      }
      if (h.indexOf('email') > -1 && (h.indexOf('parent') > -1 || h.indexOf('guardian') > -1 || h.indexOf('mother') > -1 || h.indexOf('father') > -1 || h.indexOf('contact') > -1 || h.indexOf('pemail') > -1) && !parentEmailCol) {
        parentEmailCol = colLetter;
      }
      if (h.indexOf('email') > -1 && (h.indexOf('student') > -1 || h.indexOf('semail') > -1) && !studentEmailCol) {
        studentEmailCol = colLetter;
      }
    }
    
    // Fallbacks if columns not found explicitly
    if (!parentEmailCol) {
      for (var j = 0; j < foundHeaders.length; j++) {
        var h = String(foundHeaders[j]).toLowerCase();
        var colLetter = String.fromCharCode(65 + j);
        if (h.indexOf('email') > -1 && colLetter !== studentEmailCol) {
          parentEmailCol = colLetter;
          break;
        }
      }
    }
    
    // If we found a name but NO emails, it's likely the wrong sheet
    if (!parentEmailCol && !studentEmailCol) {
      return { 
        error: "We found student names but no email columns in this sheet. Please make sure your sheet has columns for 'Student Email' and 'Parent Email'.",
        allSheetNames: allSheetNames
      };
    }

    // NEW: Validate that the detected columns actually contain email-looking data
    var hasActualEmails = false;
    var lastRow = emailSheet.getLastRow();
    if (lastRow > headerRow) {
       // Check first 10 rows of data for at least one '@' symbol in the email columns
       var checkRows = Math.min(lastRow - headerRow, 10);
       var checkData = emailSheet.getRange(headerRow + 1, 1, checkRows, Math.min(emailSheet.getLastColumn(), 26)).getValues();
       for (var r = 0; r < checkData.length; r++) {
          if (parentEmailCol) {
             var pIdx = colToIndex(parentEmailCol) - 1;
             if (pIdx < checkData[r].length && String(checkData[r][pIdx]).indexOf('@') > -1) { hasActualEmails = true; break; }
          }
          if (studentEmailCol) {
             var sIdx = colToIndex(studentEmailCol) - 1;
             if (sIdx < checkData[r].length && String(checkData[r][sIdx]).indexOf('@') > -1) { hasActualEmails = true; break; }
          }
       }
    }

    if (!hasActualEmails) {
      return { 
        error: "We identified columns that might be for emails, but we couldn't find any actual email addresses (no '@' symbols) in the data rows. Please make sure you have selected the correct sheet.",
        allSheetNames: allSheetNames
      };
    }
    
    return {
      sheetName: emailSheet.getName(),
      headerRow: headerRow,
      nameCol: nameCol || 'A',
      parentEmailCol: parentEmailCol || '',
      studentEmailCol: studentEmailCol || '',
      allSheetNames: allSheetNames
    };
    
  } catch (e) {
    return { error: e.message };
  }
}

// ─── Send Activity Emails ───
function sendActivityEmails(spreadsheetId, emailConfig, payload, teacherName, subject, customMessage, periodName, dateRange, recipientSelection, className) {
  var sent = 0;
  var failed = 0;
  var errors = [];
  var teacherEmail = Session.getActiveUser().getEmail();
  var logoBlob = null;
  try {
    logoBlob = UrlFetchApp.fetch("https://blueprintschools.org/wp-content/uploads/2017/09/Blueprint-Horizontal-Logo-Large-768x244.png").getBlob().setName("logo");
  } catch (e) {
    // If logo fetch fails, we'll just fall back to no image
  }

  try {
    // 1. Build Email Lookup
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var mappedConfig = {
      emailSheetName: emailConfig.sheetName,
      emailSheetNameCol: emailConfig.nameCol,
      emailSheetEmailCol: emailConfig.parentEmailCol,
      emailSheetStudentEmailCol: emailConfig.studentEmailCol,
      emailSheetHeaderRow: emailConfig.headerRow
    };
    
    if (!mappedConfig.emailSheetName) {
      return { error: 'No email sheet selected or auto-detected. Please check your settings.' };
    }

    var emailLookupResult = buildEmailLookup(ss, mappedConfig);
    if (emailLookupResult.sheetError) {
      return { error: 'Email Sheet Error: ' + emailLookupResult.sheetError };
    }
    
    var emailMap = emailLookupResult.map;
    if (Object.keys(emailMap).length === 0) {
      return { error: 'No email addresses found in sheet "' + mappedConfig.emailSheetName + '". Please check the column mapping.' };
    }

    function collectChartSeries(dates, key) {
      var rows = [];
      for (var k = 0; k < (dates || []).length; k++) {
        var day = dates[k] || {};
        var val = day[key];
        if (val === null || val === undefined || isNaN(val)) continue;
        rows.push({ label: String(day.date || ('Day ' + (k + 1))), value: Math.max(0, Math.min(100, Number(val))) });
      }
      return rows.slice(-6);
    }

    function buildSeriesChart(rows, color) {
      if (!rows || rows.length === 0) {
        return '<div style="font-size:12px;color:#64748b;">No graded data in selected range.</div>';
      }
      var html = '<div style="font-size:12px;color:#334155;">';
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        html += '<div style="display:flex;align-items:center;gap:8px;margin:6px 0;">'
          + '<span style="min-width:54px;color:#64748b;font-size:11px;">' + row.label + '</span>'
          + '<div style="flex:1;background:#e2e8f0;height:8px;border-radius:999px;overflow:hidden;">'
          + '<div style="height:8px;width:' + row.value + '%;background:' + color + ';"></div>'
          + '</div>'
          + '<span style="min-width:34px;text-align:right;font-weight:600;">' + row.value + '%</span>'
          + '</div>';
      }
      html += '</div>';
      return html;
    }

    function getAttendanceStats(summary, dates) {
      var scheduled = Number(summary.totalScheduledDays || 0);
      var presentCount = Number(summary.totalPresent || 0);
      var tardyCount = Number(summary.totalTardy || 0);
      if (!scheduled && dates && dates.length) {
        for (var a = 0; a < dates.length; a++) {
          var att = String((dates[a] || {}).attendance || '').toLowerCase();
          if (att === 'present') { presentCount++; scheduled++; }
          else if (att === 'tardy') { tardyCount++; scheduled++; }
          else if (att === 'absent') { scheduled++; }
        }
      }
      return { scheduled: scheduled, present: presentCount, tardy: tardyCount };
    }

    function buildAttendanceGraph(summary, dates) {
      var stats = getAttendanceStats(summary, dates);
      var scheduled = stats.scheduled;
      if (!scheduled) {
        return '<div style="font-size:12px;color:#64748b;">No scheduled attendance days in selected range.</div>';
      }
      var presentPct = Math.round((stats.present / scheduled) * 100);
      var tardyPct = Math.round((stats.tardy / scheduled) * 100);
      var absentPct = Math.max(0, 100 - presentPct - tardyPct);
      return ''
        + '<div style="margin-top:4px;">'
        + '<div style="display:flex;width:100%;height:12px;border-radius:999px;overflow:hidden;background:#e2e8f0;">'
        + '<div style="width:' + presentPct + '%;background:#10b981;"></div>'
        + '<div style="width:' + tardyPct + '%;background:#f59e0b;"></div>'
        + '<div style="width:' + absentPct + '%;background:#ef4444;"></div>'
        + '</div>'
        + '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;font-size:11px;color:#334155;">'
        + '<span>Present: <strong>' + presentPct + '%</strong></span>'
        + '<span>Tardy: <strong>' + tardyPct + '%</strong></span>'
        + '<span>Absent: <strong>' + absentPct + '%</strong></span>'
        + '<span>Scheduled Days: <strong>' + scheduled + '</strong></span>'
        + '</div></div>';
    }

    // 2. Loop through students and send emails
    for (var i = 0; i < payload.length; i++) {
      var s = payload[i];
      var emails = lookupEmail(emailMap, s.name) || { parentEmail: '', studentEmail: '' };

      if (!emails.parentEmail && !emails.studentEmail) {
        failed++;
        errors.push({ name: s.name, error: 'Missing email address' });
        continue;
      }

      // Extract first name
      var firstName = s.name.indexOf(',') > -1
        ? (s.name.split(',')[1] || '').trim()
        : s.name.split(',')[0].trim();
      if (!firstName) firstName = s.name;

    var emailSubject = subject.replace('{student}', firstName);

      // ─── Module 5.2: Dynamic Translation & Curated Localization ───
      var lang = s.lang || 'en';
      var translatedParentComment = s.parentComment;
      var translatedStudentComment = s.studentComment;
      var translatedCustomMessage = customMessage;

      if (lang && lang !== 'en') {
        try {
          if (s.parentComment) {
            translatedParentComment = LanguageApp.translate(s.parentComment, 'en', lang);
          }
        } catch(e) { Logger.log('Parent comment translate error: ' + e.message); }
        try {
          if (s.studentComment) {
            translatedStudentComment = LanguageApp.translate(s.studentComment, 'en', lang);
          }
        } catch(e) { Logger.log('Student comment translate error: ' + e.message); }
        try {
          if (customMessage) {
            translatedCustomMessage = LanguageApp.translate(customMessage, 'en', lang);
          }
        } catch(e) { Logger.log('Custom message translate error: ' + e.message); }
      }

      var emailSubject = subject.replace('{student}', firstName);
      if (lang && lang !== 'en') {
        try {
          emailSubject = LanguageApp.translate(emailSubject, 'en', lang);
        } catch(e) { Logger.log('Subject translate error: ' + e.message); }
      }

      // Build the three native charts
      var totalDaysChart = s.dates ? s.dates.length : 0;
      var presentCount = 0, tardyCount = 0, absentCount = 0;
      if (s.dates) {
        s.dates.forEach(function(d) {
          var a = (d.attendance || '').toLowerCase();
          if (a === 'present') presentCount++;
          else if (a === 'tardy') tardyCount++;
          else if (a === 'absent') absentCount++;
        });
      }

      var partBarBlob = buildBarChartNative(s.dates || [], 'participationPct', 100, '#2563eb', getLocalizedText('participation', lang, 'Participation'));
      var etBarBlob = buildBarChartNative(s.dates || [], 'exitTicketPct', 100, '#7c3aed', getLocalizedText('exitTicket', lang, 'Exit Ticket'));

      var studentInlineImages = {};
      if (logoBlob) studentInlineImages['logo'] = logoBlob;
      if (partBarBlob) studentInlineImages['partBarChart'] = partBarBlob;
      if (etBarBlob) studentInlineImages['etBarChart'] = etBarBlob;

      var partImg = partBarBlob ? '<img src="cid:partBarChart" width="220" height="202" style="display:inline-block;vertical-align:middle;margin:0 auto;border:none;max-width:100%;" alt="Participation">' : '';
      var etImg = etBarBlob ? '<img src="cid:etBarChart" width="220" height="202" style="display:inline-block;vertical-align:middle;margin:0 auto;border:none;max-width:100%;" alt="Exit Ticket">' : '';

      // Grade badge color
      var gradeG = s.grade || '';
      var gradeBg = gradeG === 'A' || gradeG === 'B' ? '#d1fae5' : gradeG === 'C' || gradeG === 'D' ? '#fef3c7' : gradeG === 'F' ? '#fee2e2' : '#f3f4f6';
      var gradeColor = gradeG === 'A' || gradeG === 'B' ? '#059669' : gradeG === 'C' || gradeG === 'D' ? '#d97706' : gradeG === 'F' ? '#dc2626' : '#6b7280';

      function buildHtml(recipientType, comment) {
        var isParent = (recipientType === 'parent');
        var greetingText = isParent 
          ? getLocalizedText('dearParent', lang, 'Dear Parent/Guardian of {student},', firstName)
          : getLocalizedText('dearStudent', lang, 'Dear {student},', firstName);

        // Apply RTL to ALL Arabic emails (both parent and student)
        var isRtl = (lang === 'ar');
        var commentDirStyle = isRtl 
          ? 'dir="rtl" style="direction:rtl;text-align:right;border-right:4px solid #2563eb;border-left:none;padding:14px 18px;background:#eff6ff;margin:0 0 20px;border-radius:8px 0 0 8px;font-size:14px;line-height:1.7;color:#1e293b;"' 
          : 'dir="ltr" style="direction:ltr;text-align:left;border-left:4px solid #2563eb;border-right:none;padding:14px 18px;background:#eff6ff;margin:0 0 20px;border-radius:0 8px 8px 0;font-size:14px;line-height:1.7;color:#1e293b;"';

        var summaryTitle = getLocalizedText('studentSummary', lang, 'Student Summary');
        var performanceTitle = getLocalizedText('performanceSnapshot', lang, 'Performance Snapshot');
        var activityLogTitle = getLocalizedText('dailyActivityLog', lang, 'Daily Activity Log');

        var gradeCalTitle = getLocalizedText('grade', lang, 'Grade');
        if (lang === 'es') gradeCalTitle = 'Grade / Calificación';
        else if (lang === 'ar') gradeCalTitle = 'الدرجة / Grade';

        var gradeBubbleHtml = '<table cellpadding="0" cellspacing="0" style="margin-bottom:20px;' + (isRtl ? 'direction:rtl;text-align:right;' : 'direction:ltr;text-align:left;') + '"><tr>'
          + '<td style="font-size:15px;font-weight:bold;color:#475569;padding-right:8px;vertical-align:middle;">' + gradeCalTitle + '</td>'
          + '<td style="vertical-align:middle;"><span style="display:inline-block;padding:4px 14px;border-radius:20px;font-weight:bold;font-size:14px;background:#e0f2fe;color:#0284c7;">' + (gradeG || '&mdash;') + '</span></td>'
          + '</tr></table>';

        var streakVal = 0;
        if (s.dates && s.dates.length > 0) {
          for (var si = s.dates.length - 1; si >= 0; si--) {
            var attStatus = String(s.dates[si].attendance || '').toLowerCase().trim();
            if (attStatus === 'present') {
              streakVal++;
            } else if (attStatus === 'tardy' || attStatus === 'absent') {
              break;
            }
          }
        }

        var chartsHtml = '';
        if (partBarBlob || etBarBlob) {
          chartsHtml += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:0 0 20px;box-shadow:0 1px 3px rgba(0,0,0,0.05);' + (isRtl ? 'direction:rtl;text-align:right;' : 'direction:ltr;text-align:left;') + '">'
            + '<table class="chart-row" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0;padding:0;' + (isRtl ? 'direction:rtl;' : 'direction:ltr;') + '" ' + (isRtl ? 'dir="rtl"' : '') + '><tr>';
            
          var partTitle = getLocalizedText('participation', lang, 'Participation');
          if (lang === 'es') partTitle = 'Participación / Participation';
          else if (lang === 'ar') partTitle = 'المشاركة / Participation';
          
          var etTitle = getLocalizedText('exitTicket', lang, 'Exit Ticket');
          if (lang === 'es') etTitle = 'Exit Ticket / Boleto de Salida';
          else if (lang === 'ar') etTitle = 'تذكرة الخروج / Exit Ticket';

          if (partBarBlob && etBarBlob) {
            chartsHtml += '<td class="chart-cell" style="width:50%;padding:8px;text-align:center;' + (isRtl ? 'border-left:1px solid #f1f5f9;' : 'border-right:1px solid #f1f5f9;') + 'vertical-align:top;">'
              + '<div style="font-weight:bold;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#475569;margin-bottom:12px;">' + partTitle + '</div>'
              + partImg
              + '</td>'
              + '<td class="chart-cell" style="width:50%;padding:8px;text-align:center;vertical-align:top;">'
              + '<div style="font-weight:bold;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#475569;margin-bottom:12px;">' + etTitle + '</div>'
              + etImg
              + '</td>';
          } else if (partBarBlob) {
            chartsHtml += '<td class="chart-cell" style="width:100%;padding:8px;text-align:center;vertical-align:top;">'
              + '<div style="font-weight:bold;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#475569;margin-bottom:12px;">' + partTitle + '</div>'
              + partImg
              + '</td>';
          } else if (etBarBlob) {
            chartsHtml += '<td class="chart-cell" style="width:100%;padding:8px;text-align:center;vertical-align:top;">'
              + '<div style="font-weight:bold;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#475569;margin-bottom:12px;">' + etTitle + '</div>'
              + etImg
              + '</td>';
          }
          
          chartsHtml += '</tr></table></div>';
        }

        var attendanceHtml = '';
        if (presentCount + tardyCount + absentCount > 0) {
          var totalAtt = presentCount + tardyCount + absentCount;
          var pPct = Math.round((presentCount / totalAtt) * 100);
          var tPct = Math.round((tardyCount / totalAtt) * 100);
          var aPct = Math.max(0, 100 - pPct - tPct);
          
          var attTitle = getLocalizedText('attendance', lang, 'Attendance');
          if (lang === 'es') attTitle = 'Asistencia / Attendance';
          else if (lang === 'ar') attTitle = 'الحضور / Attendance';
          
          var presText = getLocalizedText('present', lang, 'Pres');
          var tardText = getLocalizedText('tardy', lang, 'Tardy');
          var absText = getLocalizedText('absent', lang, 'Abs');
          
          var streakHtml = '';
          if (streakVal >= 3) {
            var streakLabel = streakVal + '-day streak';
            if (lang === 'es') streakLabel = 'racha de ' + streakVal + ' días';
            else if (lang === 'ar') streakLabel = 'سلسلة حضور ' + streakVal + ' أيام';
            streakHtml = '<div style="display:inline-block;padding:3px 10px;border-radius:12px;background:#d1fae5;color:#065f46;font-size:11px;font-weight:bold;margin-top:8px;">'
              + '&#x2605; ' + streakLabel
              + '</div>';
          }

          attendanceHtml += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:0 0 20px;box-shadow:0 1px 3px rgba(0,0,0,0.05);' + (isRtl ? 'direction:rtl;text-align:right;' : 'direction:ltr;text-align:left;') + '">'
            + '<div style="font-weight:bold;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:#475569;margin-bottom:8px;">' + attTitle + '</div>'
            + '<div style="width:100%;height:10px;background:#f1f5f9;border-radius:5px;overflow:hidden;display:flex;margin-bottom:8px;' + (isRtl ? 'direction:ltr;' : '') + '">'
            + (pPct > 0 ? '<div style="width:' + pPct + '%;background:#10b981;height:100%;"></div>' : '')
            + (tPct > 0 ? '<div style="width:' + tPct + '%;background:#f59e0b;height:100%;"></div>' : '')
            + (aPct > 0 ? '<div style="width:' + aPct + '%;background:#ef4444;height:100%;"></div>' : '')
            + '</div>'
            + '<div style="font-size:12px;color:#64748b;line-height:1.5;' + (isRtl ? 'direction:rtl;text-align:right;' : '') + '">'
            + '<span style="color:#059669;font-weight:bold;">&#x25CF; ' + presText + ': ' + presentCount + '</span>'
            + '<span style="color:#d97706;font-weight:bold;' + (isRtl ? 'margin-right:12px;' : 'margin-left:12px;') + '">&#x25CF; ' + tardText + ': ' + tardyCount + '</span>'
            + '<span style="color:#dc2626;font-weight:bold;' + (isRtl ? 'margin-right:12px;' : 'margin-left:12px;') + '">&#x25CF; ' + absText + ': ' + absentCount + '</span>'
            + '</div>'
            + streakHtml
            + '</div>';
        }

        var htmlBody = ''
          + '<!DOCTYPE html><html' + (isRtl ? ' dir="rtl"' : '') + '><head><meta name="viewport" content="width=device-width,initial-scale=1">'
          + '<style>@media(max-width:600px){.ew{width:96%!important;max-width:96%!important}.eb{padding:16px!important}.chart-row, .chart-row tr, .chart-row td{display:block!important;width:100%!important;box-sizing:border-box!important}.chart-cell{border-right:none!important;border-bottom:1px solid #f1f5f9!important;padding:16px 0!important}.chart-cell:last-child{border-bottom:none!important}img{max-width:100%!important;height:auto!important}}</style>'
          + '</head><body style="margin:0;padding:0;background:#f0f2f5;' + (isRtl ? 'direction:rtl;text-align:right;' : 'direction:ltr;text-align:left;') + '">'
          + '<div class="ew" style="width:92%;max-width:880px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#333;' + (isRtl ? 'direction:rtl;text-align:right;' : 'direction:ltr;text-align:left;') + '">'
          // Header
          + '<div style="background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%);padding:20px 24px;border-radius:8px 8px 0 0;' + (isRtl ? 'direction:rtl;' : 'direction:ltr;') + '">'
          + '<table width="100%" cellpadding="0" cellspacing="0" ' + (isRtl ? 'dir="rtl"' : '') + '><tr>'
          + '<td style="color:#fff;font-size:17px;font-weight:bold;letter-spacing:-0.3px;' + (isRtl ? 'text-align:right;' : 'text-align:left;') + '">' 
          + getLocalizedText('reportTitle', lang, 'Biweekly Progress Report') 
          + '</td>'
          + '<td style="' + (isRtl ? 'text-align:left;' : 'text-align:right;') + '">'
          + (logoBlob ? '<img src="cid:logo" alt="Blueprint Schools" style="height:32px;width:auto;">' : '<span style="color:#93c5fd;font-size:16px;font-weight:bold;">blueprint</span>')
          + '</td></tr></table></div>'
          // Body
          + '<div class="eb" style="padding:24px;background:#fff;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;' + (isRtl ? 'direction:rtl;text-align:right;' : 'direction:ltr;text-align:left;') + '">'
          + '<p style="margin:0 0 20px;font-size:15px;color:#1e293b;' + (isRtl ? 'text-align:right;' : 'text-align:left;') + '">' + greetingText + '</p>'
          // Top Grade Bubble
          + gradeBubbleHtml
          // Summary card
          + '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:0 0 20px;' + (isRtl ? 'direction:rtl;text-align:right;' : 'direction:ltr;text-align:left;') + '">'
          + '<div style="font-weight:bold;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;margin-bottom:12px;' + (isRtl ? 'text-align:right;' : 'text-align:left;') + '">' + summaryTitle + '</div>'
          + '<table cellpadding="0" cellspacing="0" style="font-size:14px;width:100%;' + (isRtl ? 'direction:rtl;text-align:right;' : 'direction:ltr;text-align:left;') + '" ' + (isRtl ? 'dir="rtl"' : '') + '><tbody>'
          + '<tr><td style="padding:4px 0;color:#64748b;width:110px;' + (isRtl ? 'text-align:right;' : 'text-align:left;') + '">' + getLocalizedText('student', lang, 'Student') + '</td><td style="font-weight:bold;color:#0f172a;' + (isRtl ? 'text-align:right;' : 'text-align:left;') + '">' + s.name + '</td></tr>'
          + (className ? '<tr><td style="padding:4px 0;color:#64748b;' + (isRtl ? 'text-align:right;' : 'text-align:left;') + '">' + getLocalizedText('class', lang, 'Class') + '</td><td style="font-weight:bold;' + (isRtl ? 'text-align:right;' : 'text-align:left;') + '">' + className + '</td></tr>' : '')
          + '<tr><td style="padding:4px 0;color:#64748b;' + (isRtl ? 'text-align:right;' : 'text-align:left;') + '">' + getLocalizedText('period', lang, 'Period') + '</td><td style="font-weight:bold;' + (isRtl ? 'text-align:right;' : 'text-align:left;') + '">' + (dateRange && dateRange.start ? dateRange.start + ' &ndash; ' + dateRange.end : 'N/A') + '</td></tr>'
          + '<tr><td style="padding:4px 0;color:#64748b;' + (isRtl ? 'text-align:right;' : 'text-align:left;') + '">' + getLocalizedText('tardies', lang, 'Tardies') + '</td><td style="font-weight:600;color:' + (s.tardies > 0 ? '#d97706' : '#0f172a') + ';' + (isRtl ? 'text-align:right;' : 'text-align:left;') + '">' + s.tardies + '</td></tr>'
          + '<tr><td style="padding:4px 0;color:#64748b;' + (isRtl ? 'text-align:right;' : 'text-align:left;') + '">' + getLocalizedText('absences', lang, 'Absences') + '</td><td style="font-weight:600;color:' + (s.absences > 0 ? '#dc2626' : '#0f172a') + ';' + (isRtl ? 'text-align:right;' : 'text-align:left;') + '">' + s.absences + '</td></tr>'
          + '</tbody></table></div>'
          // 📊 Performance Charts (Side-by-Side Dual Charts Card)
          + chartsHtml
          // 📈 Attendance Progress Bar Block
          + attendanceHtml
          // Comment / message
          + '<div ' + commentDirStyle + '>'
          + comment
          + '</div>';

        // Add Detailed Daily Activity Table if available
        if (s.dates && s.dates.length > 0) {
          htmlBody += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;margin:0 0 20px;overflow:hidden;' + (isRtl ? 'direction:rtl;' : 'direction:ltr;') + '">'
            + '<div style="background:#0f172a;padding:10px 16px;' + (isRtl ? 'text-align:right;' : 'text-align:left;') + '"><span style="color:#fff;font-weight:bold;font-size:13px;">&#x1F4C5; ' + activityLogTitle + '</span></div>'
            + '<div style="overflow-x:auto;"><table cellpadding="0" cellspacing="0" style="width:100%;font-size:13px;' + (isRtl ? 'text-align:right;direction:rtl;' : 'text-align:left;direction:ltr;') + 'border-collapse:collapse;" ' + (isRtl ? 'dir="rtl"' : '') + '>'
            + '<thead><tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">'
            + '<th style="padding:10px 14px;color:#475569;font-weight:600;white-space:nowrap;' + (isRtl ? 'text-align:right;' : 'text-align:left;') + '">' + getLocalizedText('date', lang, 'Date') + '</th>'
            + '<th style="padding:10px 14px;color:#475569;font-weight:600;' + (isRtl ? 'text-align:right;' : 'text-align:left;') + '">' + getLocalizedText('attendance', lang, 'Attendance') + '</th>'
            + '<th style="padding:10px 14px;color:#475569;font-weight:600;' + (isRtl ? 'text-align:right;' : 'text-align:left;') + '">' + getLocalizedText('grades', lang, 'Grades') + '</th>'
            + '<th style="padding:10px 14px;color:#475569;font-weight:600;text-align:center;">' + getLocalizedText('partPct', lang, 'Part. %') + '</th>'
            + '<th style="padding:10px 14px;color:#475569;font-weight:600;text-align:center;">' + getLocalizedText('exitTicket', lang, 'Exit Ticket') + '</th>'
            + '</tr></thead><tbody>';

          for (var d = 0; d < s.dates.length; d++) {
            var day = s.dates[d];
            var attLower = (day.attendance || '').toLowerCase();
            var attColor = attLower === 'absent' ? '#dc2626' : attLower === 'tardy' ? '#d97706' : '#059669';
            var attBg = attLower === 'absent' ? '#fef2f2' : attLower === 'tardy' ? '#fffbeb' : '#f0fdf4';
            var bg = d % 2 === 0 ? '#ffffff' : '#f8fafc';

            // Participation % bar inline
            var pPct = (day.participationPct !== null && day.participationPct !== undefined) ? day.participationPct : null;
            var pBarColor = pPct !== null ? (pPct >= 80 ? '#059669' : pPct >= 60 ? '#d97706' : '#dc2626') : '#e2e8f0';
            var pStr = pPct !== null ? (pPct + '%') : '&mdash;';
            var pBar = pPct !== null
              ? '<div style="background:#e2e8f0;border-radius:3px;height:6px;width:80px;margin:3px auto 0;"><div style="background:' + pBarColor + ';width:' + pPct + '%;height:100%;border-radius:3px;"></div></div>'
              : '';

            var etPct = (day.exitTicketPct !== null && day.exitTicketPct !== undefined) ? day.exitTicketPct : null;
            var etStr = day.exitTicket !== '' && day.exitTicket != null ? day.exitTicket : '&mdash;';
            if (etPct !== null) etStr += ' <span style="font-size:11px;color:#64748b;">(' + etPct + '%)</span>';

            // Display numerical participation points alongside grades string
            var gradesDisplay = (day.gradesStr && day.gradesStr !== '&mdash;' && day.gradesStr !== '\u2014') ? day.gradesStr : '&mdash;';
            if (day.participationPoints && day.gradesStr !== '&mdash;') {
              gradesDisplay += ' <span style="font-size:11px;color:#64748b;">(' + day.participationPoints + ')</span>';
            }

            htmlBody += '<tr style="background:' + bg + ';border-bottom:1px solid #f1f5f9;">'
              + '<td style="padding:9px 14px;color:#334155;white-space:nowrap;font-size:12px;' + (isRtl ? 'text-align:right;' : 'text-align:left;') + '">' + day.date + '</td>'
              + '<td style="padding:9px 14px;' + (isRtl ? 'text-align:right;' : 'text-align:left;') + '"><span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:' + attBg + ';color:' + attColor + ';">' + getLocalizedText(attLower, lang, day.attendance) + '</span></td>'
              + '<td style="padding:9px 14px;font-family:monospace;font-size:12px;color:#334155;' + (isRtl ? 'text-align:right;' : 'text-align:left;') + '">' + gradesDisplay + '</td>'
              + '<td style="padding:9px 14px;text-align:center;"><span style="font-weight:600;font-size:12px;color:' + (pPct !== null ? pBarColor : '#94a3b8') + ';">' + pStr + '</span>' + pBar + '</td>'
              + '<td style="padding:9px 14px;text-align:center;color:#334155;font-size:12px;">' + etStr + '</td>'
              + '</tr>';
          }
          htmlBody += '</tbody></table></div></div>';
        }

        if (translatedCustomMessage) {
          htmlBody += '<p style="font-size:14px;line-height:1.6;color:#334155;' + (isRtl ? 'direction:rtl;text-align:right;' : 'direction:ltr;text-align:left;') + '">' + translatedCustomMessage.replace(/\n/g, '<br>') + '</p>';
        }

        htmlBody += '<p style="font-size:14px;color:#334155;' + (isRtl ? 'direction:rtl;text-align:right;' : 'direction:ltr;text-align:left;') + '">' + getLocalizedText('questions', lang, 'If you have any questions or concerns, please do not hesitate to reach out.') + '</p>'
          + '<p style="font-size:14px;margin-bottom:0;color:#334155;' + (isRtl ? 'direction:rtl;text-align:right;' : 'direction:ltr;text-align:left;') + '">' + getLocalizedText('regards', lang, 'Best regards,') + '<br>'
          + '<strong>' + teacherName + '</strong><br>'
          + '<span style="color:#64748b;font-size:13px;">' + teacherEmail + '</span></p>'
          + '</div>'
          // Footer
          + '<div style="background:#f8fafc;padding:12px 24px;text-align:center;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;' + (isRtl ? 'direction:rtl;' : 'direction:ltr;') + '">'
          + '<span style="color:#94a3b8;font-size:11px;">Blueprint Schools Network &middot; ' + getLocalizedText('reportTitle', lang, 'Biweekly Progress Report') + '</span>'
          + '</div></div></body></html>';
        return htmlBody;
      }

      function buildPlain(recipientType, comment) {
        var isParent = (recipientType === 'parent');
        var greeting = isParent
          ? getLocalizedText('dearParent', lang, 'Dear Parent/Guardian of {student},\n\n', firstName) 
          : getLocalizedText('dearStudent', lang, 'Dear {student},\n\n', firstName);
        var body = greeting + comment + '\n\n';
        if (translatedCustomMessage) body += translatedCustomMessage + '\n\n';
        body += getLocalizedText('questions', lang, 'If you have any questions or concerns, please do not hesitate to reach out.') 
          + '\n\n' + getLocalizedText('regards', lang, 'Best regards,') + '\n' + teacherName + '\n' + teacherEmail;
        return body;
      }

      var sendToParent = (recipientSelection === 'both' || recipientSelection === 'parents') && emails.parentEmail;
      var sendToStudent = (recipientSelection === 'both' || recipientSelection === 'students') && emails.studentEmail;

      if (sendToParent) {
        var mailOptions = {
          subject: emailSubject,
          body: buildPlain('parent', translatedParentComment),
          htmlBody: buildHtml('parent', translatedParentComment),
          name: teacherName || '',
          replyTo: teacherEmail,
          inlineImages: studentInlineImages
        };
        GmailApp.sendEmail(emails.parentEmail, emailSubject, mailOptions.body, mailOptions);
        sent++;
      }

      if (sendToStudent) {
        var mailOptions = {
          subject: emailSubject,
          body: buildPlain('student', translatedStudentComment),
          htmlBody: buildHtml('student', translatedStudentComment),
          name: teacherName || '',
          replyTo: teacherEmail,
          inlineImages: studentInlineImages
        };
        GmailApp.sendEmail(emails.studentEmail, emailSubject, mailOptions.body, mailOptions);
        sent++;
      }
    }

    return {
      success: true,
      sent: sent,
      failed: failed,
      errors: errors,
      remainingQuota: 999
    };

  } catch (e) {
    return { error: 'Failed to send emails: ' + e.message };
  }
}

// ─── Module 4.2: Export School Roster by Email ───
function exportRosterByEmail(adminEmail, rosterData, tutorName, dateRange) {
  try {
    var teacherEmail = Session.getActiveUser().getEmail();
    var dateStr = '';
    if (dateRange && dateRange.start) {
      dateStr = dateRange.start + ' – ' + (dateRange.end || '');
    }

    var rows = '';
    var num = 0;
    rosterData.forEach(function(s) {
      num++;
      var gradeStyle = s.grade === 'A' || s.grade === 'B'
        ? 'background:#d1fae5;color:#059669'
        : s.grade === 'C' || s.grade === 'D'
        ? 'background:#fef3c7;color:#d97706'
        : s.grade === 'F'
        ? 'background:#fee2e2;color:#dc2626'
        : 'background:#f3f4f6;color:#6b7280';
      rows += '<tr>'
        + '<td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">' + num + '</td>'
        + '<td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600;">' + s.name + '</td>'
        + '<td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">' + (s.period || '—') + '</td>'
        + '<td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">'
        + (s.grade ? '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-weight:700;font-size:11px;' + gradeStyle + ';">' + s.grade + '</span>' : '—')
        + '</td>'
        + '<td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:#059669;font-weight:600;">' + (s.present || 0) + '</td>'
        + '<td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:#d97706;font-weight:600;">' + (s.tardy || 0) + '</td>'
        + '<td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:#dc2626;font-weight:600;">' + (s.absent || 0) + '</td>'
        + '</tr>';
    });

    var htmlBody = '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<style>body{font-family:Arial,Helvetica,sans-serif;color:#333;margin:0;padding:0;background:#f0f2f5}'
      + 'table{border-collapse:collapse;width:100%}th{background:#1e3a8a;color:#fff;padding:10px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;text-align:left}'
      + 'tr:nth-child(even){background:#f8fafc}</style></head><body>'
      + '<div style="max-width:700px;margin:20px auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">'
      + '<div style="background:#1e3a8a;padding:20px 24px;">'
      + '<div style="color:#fff;font-size:18px;font-weight:bold;">Blueprint School Roster</div>'
      + '<div style="color:#93c5fd;font-size:12px;margin-top:4px;">Tutor: ' + (tutorName || 'N/A') + ' · ' + dateStr + '</div>'
      + '</div>'
      + '<div style="padding:0;">'
      + '<table><thead><tr>'
      + '<th>#</th><th>Student Name</th><th style="text-align:center;">Period</th>'
      + '<th style="text-align:center;">Grade</th><th style="text-align:center;">Present</th>'
      + '<th style="text-align:center;">Tardy</th><th style="text-align:center;">Absent</th>'
      + '</tr></thead><tbody>' + rows + '</tbody></table>'
      + '</div>'
      + '<div style="padding:12px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center;">'
      + 'Blueprint Schools Network · ' + rosterData.length + ' students · Sent by ' + teacherEmail
      + '</div></div></body></html>';

    var plainBody = 'Blueprint School Roster\n'
      + 'Tutor: ' + (tutorName || 'N/A') + ' · ' + dateStr + '\n'
      + rosterData.length + ' students\n\n'
      + rosterData.map(function(s, i) {
          return (i + 1) + '. ' + s.name + ' | Period: ' + (s.period || '—') + ' | Grade: ' + (s.grade || '—') + ' | Present: ' + (s.present || 0) + ' | Absent: ' + (s.absent || 0);
        }).join('\n');

    GmailApp.sendEmail(
      adminEmail,
      'Blueprint School Roster – ' + (tutorName || teacherEmail) + (dateStr ? ' · ' + dateStr : ''),
      plainBody,
      { htmlBody: htmlBody, replyTo: teacherEmail, name: tutorName || 'Blueprint Tools' }
    );

    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
}

// ─── Module 5.1: Global Email Localization & Native Chart Generation ───
var EMAIL_LOCALIZATION = {
  'es': {
    reportTitle: 'Informe de Progreso Bisemanal',
    studentSummary: 'Resumen del Estudiante',
    student: 'Estudiante',
    grade: 'Calificación',
    tardies: 'Tardanzas',
    absences: 'Ausencias',
    class: 'Clase',
    period: 'Período',
    performanceSnapshot: 'Instantánea de Rendimiento',
    attendance: 'Asistencia',
    participation: 'Participación',
    exitTicket: 'Boleto de Salida',
    dailyActivityLog: 'Registro de Actividad Diaria',
    date: 'Fecha',
    grades: 'Calificaciones',
    partPct: 'Part. %',
    present: 'Presente',
    tardy: 'Tarde',
    absent: 'Ausente',
    notScheduled: 'No Programado',
    questions: 'Si tiene alguna pregunta o inquietud, no dude en comunicarse.',
    regards: 'Atentamente,',
    dearParent: 'Estimado padre/tutor de {student},',
    dearStudent: 'Estimado {student},'
  },
  'ar': {
    reportTitle: 'تقرير التقدم نصف الأسبوعي',
    studentSummary: 'ملخص الطالب',
    student: 'الطالب',
    grade: 'الدرجة',
    tardies: 'التأخيرات',
    absences: 'الغيابات',
    class: 'الصف',
    period: 'الفترة',
    performanceSnapshot: 'لقطة الأداء',
    attendance: 'الحضور',
    participation: 'المشاركة',
    exitTicket: 'تذكرة الخروج',
    dailyActivityLog: 'سجل النشاط اليومي',
    date: 'التاريخ',
    grades: 'الدرجات',
    partPct: 'نسبة المشاركة',
    present: 'حاضر',
    tardy: 'متأخر',
    absent: 'غائب',
    notScheduled: 'غير مقرر',
    questions: 'إذا كان لديك أي أسئلة أو استفسارات، فلا تتردد في التواصل معنا.',
    regards: 'أطيب التحيات،',
    dearParent: 'عزيزي ولي أمر/وصي {student}،',
    dearStudent: 'عزيزي {student}،'
  },
  'fr': {
    reportTitle: 'Rapport de Progrès Bimensuel',
    studentSummary: 'Résumé de l\'Étudiant',
    student: 'Étudiant',
    grade: 'Note',
    tardies: 'Retards',
    absences: 'Absences',
    class: 'Classe',
    period: 'Période',
    performanceSnapshot: 'Aperçu des Performances',
    attendance: 'Présence',
    participation: 'Participation',
    exitTicket: 'Ticket de Sortie',
    dailyActivityLog: 'Journal d\'Activité Quotidien',
    date: 'Date',
    grades: 'Notes',
    partPct: 'Part. %',
    present: 'Présent',
    tardy: 'En retard',
    absent: 'Absent',
    notScheduled: 'Non programmé',
    questions: 'Si vous avez des questions ou des préoccupations, n\'hésitez pas à nous contacter.',
    regards: 'Cordialement,',
    dearParent: 'Cher parent/tuteur de {student},',
    dearStudent: 'Cher {student},'
  },
  'so': {
    reportTitle: 'Warbixinta Horumarka Laba-todobaadlaha ah',
    studentSummary: 'Koobidda Ardayga',
    student: 'Ardayga',
    grade: 'Darajada',
    tardies: 'Dahabitaanka',
    absences: 'Maqnaanshaha',
    class: 'Fasalka',
    period: 'Muddada',
    performanceSnapshot: 'Sawirka Waxqabadka',
    attendance: 'Ilaalinta',
    participation: 'Ka Qaybgalka',
    exitTicket: 'Warqadda Ka Bixidda',
    dailyActivityLog: 'Diiwaanka Waxqabadka Maalinlaha ah',
    date: 'Taariikhda',
    grades: 'Darajooyinka',
    partPct: 'Boqolkiiba Ka Qaybgalka',
    present: 'Halkan jooga',
    tardy: 'Dahashay',
    absent: 'Maqan',
    notScheduled: 'Aan loo qorsheyn',
    questions: 'Haddii aad qabtid wax su\'aalo ah ama walaac ah, fadlan ha ka waaban inaad nala soo xiriirto.',
    regards: 'Mahadsanid,',
    dearParent: 'Gacaliye Waalid/Madaariyaha {student},',
    dearStudent: 'Gacaliye {student},'
  },
  'zh': {
    reportTitle: '双周进度报告',
    studentSummary: '学生概况',
    student: '学生',
    grade: '成绩',
    tardies: '迟到',
    absences: '缺勤',
    class: '班级',
    period: '期间',
    performanceSnapshot: '表现概览',
    attendance: '出勤',
    participation: '参与率',
    exitTicket: '出口小票',
    dailyActivityLog: '每日活动日志',
    date: '日期',
    grades: '评分',
    partPct: '参与百分比',
    present: '出勤',
    tardy: '迟到',
    absent: '缺勤',
    notScheduled: '未安排',
    questions: '如有任何疑问或关切，请随时与我们联系。',
    regards: '此致敬礼，',
    dearParent: '尊敬的 {student} 家长/监护人：',
    dearStudent: '亲爱的 {student}：'
  },
  'vi': {
    reportTitle: 'Báo Cáo Tiến Độ Hai Tuần Một Lần',
    studentSummary: 'Tóm Tắt Về Học Sinh',
    student: 'Học sinh',
    grade: 'Điểm số',
    tardies: 'Đi muộn',
    absences: 'Vắng mặt',
    class: 'Lớp học',
    period: 'Thời gian',
    performanceSnapshot: 'Sơ Lược Về Thành Tích',
    attendance: 'Điểm danh',
    participation: 'Tham gia',
    exitTicket: 'Phiếu kiểm tra nhanh',
    dailyActivityLog: 'Nhật Ký Hoạt Động Hàng Ngày',
    date: 'Ngày',
    grades: 'Điểm',
    partPct: 'Tỷ lệ tham gia',
    present: 'Có mặt',
    tardy: 'Đi muộn',
    absent: 'Vắng mặt',
    notScheduled: 'Không có lịch',
    questions: 'Nếu bạn có bất kỳ câu hỏi hoặc thắc mắc nào, xin vui lòng liên hệ.',
    regards: 'Trân trọng,',
    dearParent: 'Kính gửi Phụ huynh/Người giám hộ của {student},',
    dearStudent: 'Thân gửi {student},'
  },
  'hy': {
    reportTitle: 'Երկշաբաթյա առաջադիմության հաշվետվություն',
    studentSummary: 'Ուսանողի ամփոփագիր',
    student: 'Ուսանող',
    grade: 'Գնահատական',
    tardies: 'Ուշացումներ',
    absences: 'Բացակայություններ',
    class: 'Դասարան',
    period: 'Ժամանակահատված',
    performanceSnapshot: 'Կատարողականի ամփոփում',
    attendance: 'Հաճախելիություն',
    participation: 'Մասնակցություն',
    exitTicket: 'Ելքի տոմս',
    dailyActivityLog: 'Օրական գործունեության մատյան',
    date: 'Ամսաթիվ',
    grades: 'Գնահատականներ',
    partPct: 'Մասնակցության %',
    present: 'Ներկա',
    tardy: 'Ուշացած',
    absent: 'Բացակա',
    notScheduled: 'Չնախատեսված',
    questions: 'Հարցերի կամ մտահոգությունների դեպքում խնդրում ենք կապ հաստատել մեզ հետ:',
    regards: 'Հարգանքներով՝',
    dearParent: 'Հարգելի {student}-ի ծնող/խնամակալ,',
    dearStudent: 'Սիրելի {student},'
  }
};

function getLocalizedText(key, lang, defaultText, studentName) {
  var langMap = EMAIL_LOCALIZATION[lang];
  var text = (langMap && langMap[key]) ? langMap[key] : defaultText;
  if (studentName) {
    text = text.replace('{student}', studentName);
  }
  return text;
}

function buildAttendanceChartNative(present, tardy, absent) {
  try {
    var total = present + tardy + absent;
    if (total === 0) return null;
    
    var dataTable = Charts.newDataTable()
      .addColumn(Charts.ColumnType.STRING, 'Status')
      .addColumn(Charts.ColumnType.NUMBER, 'Days')
      .addRow(['Present', present])
      .addRow(['Tardy', tardy])
      .addRow(['Absent', absent])
      .build();
      
    var chart = Charts.newPieChart()
      .setDataTable(dataTable)
      .setColors(['#10b981', '#f59e0b', '#ef4444']) // Vibrant modern colors
      .setDimensions(220, 220)
      .setBackgroundColor('#ffffff') // Clean seamless white
      .setOption('pieHole', 0.65) // Clean modern donut ring
      .setOption('legend', 'none')
      .setOption('pieSliceText', 'none') // Banish overlapping slice labels!
      .setOption('chartArea', { left: '10%', top: '10%', width: '80%', height: '80%' })
      .build();
      
    return chart.getAs('image/png');
  } catch (e) {
    Logger.log('Error creating attendance chart: ' + e.message);
    return null;
  }
}

function buildBarChartNative(dates, valueKey, maxVal, barColor, title) {
  try {
    if (!dates || dates.length === 0) return null;
    
    var dataTable = Charts.newDataTable()
      .addColumn(Charts.ColumnType.STRING, 'Date')
      .addColumn(Charts.ColumnType.NUMBER, title);
      
    var addedRows = 0;
    dates.forEach(function(d) {
      var val = d[valueKey];
      if (val !== null && val !== undefined) {
        var dateStr = '';
        if (d.date && d.date.indexOf('-') > -1) {
          var p = d.date.split('-');
          dateStr = p[1] + '/' + p[2];
        } else {
          dateStr = String(d.date || '');
        }
        dataTable.addRow([dateStr, val]);
        addedRows++;
      }
    });
    
    if (addedRows === 0) return null;
    
    var gw = Math.floor(190 / addedRows * 0.65);
    if (gw > 24) gw = 24;
    
    var chart = Charts.newColumnChart()
      .setDataTable(dataTable.build())
      .setColors([barColor])
      .setDimensions(240, 220)
      .setBackgroundColor('#ffffff') // Clean seamless white
      .setOption('legend', 'none')
      .setOption('bar', { groupWidth: gw }) // Dynamically scaled sleek bars
      .setOption('hAxis', {
        textStyle: { color: '#64748b', fontSize: 9, fontName: 'Helvetica Neue, Helvetica, Arial' },
        gridlines: { count: 0 },
        slantedText: true,
        slantedTextAngle: 45
      })
      .setOption('vAxis', {
        textStyle: { color: '#94a3b8', fontSize: 10, fontName: 'Helvetica Neue, Helvetica, Arial' },
        gridlines: { color: '#f8fafc' },
        baselineColor: '#cbd5e1',
        minValue: 0,
        maxValue: maxVal
      })
      .setOption('chartArea', { left: 35, top: 15, width: 190, height: 155 })
      .build();
      
    return chart.getAs('image/png');
  } catch (e) {
    Logger.log('Error creating bar chart: ' + e.message);
    return null;
  }
}


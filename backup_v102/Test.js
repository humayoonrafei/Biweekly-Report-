/**
 * Test.gs — Backend Test Suite for Biweekly Report Tool
 *
 * HOW TO RUN:
 *   1. Push this file:  npm run push
 *   2. Open Apps Script editor:  npm run open:script
 *   3. In the editor, select "runAllTests" from the function dropdown (top toolbar)
 *   4. Click ▶ Run
 *   5. View → Execution log  to see results
 *
 * Each test logs ✅ PASS or ❌ FAIL with details.
 */

// ═══════════════════════════════════════════════════════════
//                    TEST CONFIGURATION
// ═══════════════════════════════════════════════════════════

var TEST_SPREADSHEET_ID = '1FD4AzAhPr0XffnxgmcSkZ7J2AdsDsSq1xsBsf-3FYkc';
var TEST_ACTIVITY_SHEET = '';   // Will be auto-detected
var TEST_GRADES_SHEET = '';     // Will be auto-detected

// ═══════════════════════════════════════════════════════════
//                     TEST RUNNER
// ═══════════════════════════════════════════════════════════

function runAllTests() {
  Logger.log('═══════════════════════════════════════');
  Logger.log('  BIWEEKLY REPORT — BACKEND TEST SUITE');
  Logger.log('  ' + new Date().toLocaleString());
  Logger.log('═══════════════════════════════════════\n');

  var results = { passed: 0, failed: 0, errors: [] };

  // Run each test
  testGetSheetNames(results);
  testGetSheetHeaders(results);
  testGetSheetHeadersWithSampleData(results);
  testGetSheetHeadersTopHeaders(results);
  testGetActivityDates(results);
  testGetActivityReport(results);
  testColHelpers(results);
  testSpellNumber(results);
  testNameVariants(results);

  // Summary
  Logger.log('\n═══════════════════════════════════════');
  Logger.log('  RESULTS: ' + results.passed + ' passed, ' + results.failed + ' failed');
  Logger.log('═══════════════════════════════════════');

  if (results.errors.length > 0) {
    Logger.log('\n❌ FAILURES:');
    results.errors.forEach(function (e) {
      Logger.log('  • ' + e);
    });
  }
}

// ═══════════════════════════════════════════════════════════
//                       TESTS
// ═══════════════════════════════════════════════════════════

// ─── TEST 1: getSheetNames ───
function testGetSheetNames(results) {
  Logger.log('─── TEST 1: getSheetNames ───');
  try {
    var result = getSheetNames(TEST_SPREADSHEET_ID);

    assert(results, '1a', !result.error, 'No error returned', result.error);
    assert(results, '1b', result.success === true, 'success === true');
    assert(results, '1c', result.names && result.names.length > 0, 'Has at least 1 sheet tab, got ' + (result.names ? result.names.length : 0));

    // Check that a "Grade Calculator" type sheet exists
    var hasGradeSheet = result.names.some(function (n) { return /grade/i.test(n); });
    assert(results, '1d', hasGradeSheet, 'Has a sheet with "grade" in the name');

    // Auto-detect sheet names for later tests
    if (result.names) {
      result.names.forEach(function (n) {
        if (!TEST_GRADES_SHEET && /grade\s*calc/i.test(n)) TEST_GRADES_SHEET = n;
        if (!TEST_ACTIVITY_SHEET && /daily|activity|tracker|data/i.test(n)) TEST_ACTIVITY_SHEET = n;
      });
      // Fallback: use first sheet for activity if not found
      if (!TEST_ACTIVITY_SHEET && result.names.length > 0) TEST_ACTIVITY_SHEET = result.names[0];
      if (!TEST_GRADES_SHEET) TEST_GRADES_SHEET = result.names.filter(function (n) { return /grade/i.test(n); })[0] || '';
    }
    Logger.log('   Auto-detected Activity Sheet: "' + TEST_ACTIVITY_SHEET + '"');
    Logger.log('   Auto-detected Grades Sheet: "' + TEST_GRADES_SHEET + '"');
  } catch (e) {
    fail(results, '1', 'Exception: ' + e.message);
  }
  Logger.log('');
}

// ─── TEST 2: getSheetHeaders ───
function testGetSheetHeaders(results) {
  Logger.log('─── TEST 2: getSheetHeaders ───');
  if (!TEST_GRADES_SHEET) { skip(results, '2', 'No grades sheet detected'); return; }
  try {
    var result = getSheetHeaders(TEST_SPREADSHEET_ID, TEST_GRADES_SHEET, '3');

    assert(results, '2a', !result.error, 'No error returned', result.error);
    assert(results, '2b', result.headers && result.headers.length > 0, 'Has headers, got ' + (result.headers ? result.headers.length : 0));
    assert(results, '2c', result.headerRow === 3, 'Header row is 3, got ' + result.headerRow);
    assert(results, '2d', result.dataStartRow === 4, 'Data starts at row 4, got ' + result.dataStartRow);

    // Check header objects have required fields
    if (result.headers && result.headers.length > 0) {
      var h = result.headers[0];
      assert(results, '2e', !!h.col, 'Header has .col property');
      assert(results, '2f', !!h.colIndex, 'Header has .colIndex property');
      assert(results, '2g', !!h.header, 'Header has .header property');
    }
  } catch (e) {
    fail(results, '2', 'Exception: ' + e.message);
  }
  Logger.log('');
}

// ─── TEST 3: getSheetHeaders returns sampleData ───
function testGetSheetHeadersWithSampleData(results) {
  Logger.log('─── TEST 3: getSheetHeaders sampleData ───');
  if (!TEST_GRADES_SHEET) { skip(results, '3', 'No grades sheet detected'); return; }
  try {
    var result = getSheetHeaders(TEST_SPREADSHEET_ID, TEST_GRADES_SHEET, '3');

    assert(results, '3a', result.sampleData !== undefined, 'sampleData exists in response');
    assert(results, '3b', typeof result.sampleData === 'object', 'sampleData is an object');

    // Check that at least one column has sample data
    var cols = Object.keys(result.sampleData || {});
    assert(results, '3c', cols.length > 0, 'Has sample data for at least 1 column, got ' + cols.length);

    // Check a sample looks like student names (column B typically)
    if (result.sampleData['B'] && result.sampleData['B'].length > 0) {
      var sample = result.sampleData['B'][0];
      var looksLikeName = /[a-zA-Z]/.test(sample) && sample.length > 2;
      assert(results, '3d', looksLikeName, 'Column B sample looks like a name: "' + sample + '"');
    }
  } catch (e) {
    fail(results, '3', 'Exception: ' + e.message);
  }
  Logger.log('');
}

// ─── TEST 4: getSheetHeaders returns topHeaders (Row 1) ───
function testGetSheetHeadersTopHeaders(results) {
  Logger.log('─── TEST 4: getSheetHeaders topHeaders ───');
  if (!TEST_GRADES_SHEET) { skip(results, '4', 'No grades sheet detected'); return; }
  try {
    var result = getSheetHeaders(TEST_SPREADSHEET_ID, TEST_GRADES_SHEET, '3');

    assert(results, '4a', result.topHeaders !== undefined, 'topHeaders exists in response');
    assert(results, '4b', typeof result.topHeaders === 'object', 'topHeaders is an object');

    // Check that "Full Year" section exists
    var hasFullYear = Object.values(result.topHeaders).some(function (v) { return /full\s*year/i.test(v); });
    assert(results, '4c', hasFullYear, 'Found "Full Year" in topHeaders');

    // Check that header objects have .topHeader attached
    if (result.headers && result.headers.length > 0) {
      var lastHeader = result.headers[result.headers.length - 1];
      assert(results, '4d', lastHeader.topHeader !== undefined, 'Last header has .topHeader: "' + lastHeader.topHeader + '"');
    }
  } catch (e) {
    fail(results, '4', 'Exception: ' + e.message);
  }
  Logger.log('');
}

// ─── TEST 5: getActivityDates ───
function testGetActivityDates(results) {
  Logger.log('─── TEST 5: getActivityDates ───');
  if (!TEST_ACTIVITY_SHEET) { skip(results, '5', 'No activity sheet detected'); return; }
  try {
    var config = {
      spreadsheetId: TEST_SPREADSHEET_ID,
      activitySheetName: TEST_ACTIVITY_SHEET
    };
    var result = getActivityDates(config);

    assert(results, '5a', !result.error, 'No error returned', result.error);
    assert(results, '5b', result.dates && result.dates.length > 0, 'Has dates, got ' + (result.dates ? result.dates.length : 0));
    assert(results, '5c', result.total > 0, 'Total > 0, got ' + result.total);

    // Check date object structure
    if (result.dates && result.dates.length > 0) {
      var d = result.dates[0];
      assert(results, '5d', !!d.isoDate, 'Date has .isoDate: "' + d.isoDate + '"');
      assert(results, '5e', !!d.dateStr, 'Date has .dateStr: "' + d.dateStr + '"');
      assert(results, '5f', !!d.dayOfWeek, 'Date has .dayOfWeek: "' + d.dayOfWeek + '"');
    }

    // Check fellows list
    assert(results, '5g', result.fellows && result.fellows.length > 0, 'Has fellows list, got ' + (result.fellows ? result.fellows.length : 0));
  } catch (e) {
    fail(results, '5', 'Exception: ' + e.message);
  }
  Logger.log('');
}

// ─── TEST 6: getActivityReport ───
function testGetActivityReport(results) {
  Logger.log('─── TEST 6: getActivityReport ───');
  if (!TEST_ACTIVITY_SHEET) { skip(results, '6', 'No activity sheet detected'); return; }
  try {
    // First get dates to pick a valid range
    var config = {
      spreadsheetId: TEST_SPREADSHEET_ID,
      activitySheetName: TEST_ACTIVITY_SHEET,
      gradesSheetName: TEST_GRADES_SHEET,
      gradesNameCol: 'B',
      gradesGradeCol: 'GO',
      gradesStartRow: '4'
    };
    var datesResult = getActivityDates(config);
    if (!datesResult.dates || datesResult.dates.length === 0) {
      skip(results, '6', 'No dates available');
      return;
    }

    // Use last 5 dates (or all if fewer)
    var startIdx = Math.max(0, datesResult.dates.length - 5);
    var startDate = datesResult.dates[startIdx].isoDate;
    var endDate = datesResult.dates[datesResult.dates.length - 1].isoDate;

    var report = getActivityReport(config, startDate, endDate);

    assert(results, '6a', !report.error, 'No error returned', report.error);
    assert(results, '6b', report.students && report.students.length > 0, 'Has students, got ' + (report.students ? report.students.length : 0));

    // Check student structure
    if (report.students && report.students.length > 0) {
      var s = report.students[0];
      assert(results, '6c', !!s.name, 'Student has .name: "' + s.name + '"');
      assert(results, '6d', s.period !== undefined, 'Student has .period: "' + s.period + '"');
      assert(results, '6e', !!s.fellow, 'Student has .fellow: "' + s.fellow + '"');
      assert(results, '6f', s.dates && s.dates.length > 0, 'Student has .dates array');
      assert(results, '6g', s.summary !== undefined, 'Student has .summary');

      // Check letter grade was looked up
      if (TEST_GRADES_SHEET) {
        var hasGrade = report.students.some(function (st) { return !!st.letterGrade; });
        assert(results, '6h', hasGrade, 'At least one student has a letterGrade from grades sheet');
      }

      // Check summary fields
      if (s.summary) {
        assert(results, '6i', s.summary.totalPresent !== undefined, 'Summary has .totalPresent');
        assert(results, '6j', s.summary.totalDays !== undefined, 'Summary has .totalDays');
      }
    }

    // Check date range metadata
    assert(results, '6k', report.dateRange !== undefined, 'Report has .dateRange');
    assert(results, '6l', report.studentCount > 0, 'Report has .studentCount > 0: ' + report.studentCount);
  } catch (e) {
    fail(results, '6', 'Exception: ' + e.message);
  }
  Logger.log('');
}

// ─── TEST 7: Column Helper Functions ───
function testColHelpers(results) {
  Logger.log('─── TEST 7: colToIndex / indexToCol ───');
  try {
    assert(results, '7a', colToIndex('A') === 1, 'colToIndex("A") === 1, got ' + colToIndex('A'));
    assert(results, '7b', colToIndex('B') === 2, 'colToIndex("B") === 2, got ' + colToIndex('B'));
    assert(results, '7c', colToIndex('Z') === 26, 'colToIndex("Z") === 26, got ' + colToIndex('Z'));
    assert(results, '7d', colToIndex('AA') === 27, 'colToIndex("AA") === 27, got ' + colToIndex('AA'));
    assert(results, '7e', colToIndex('GO') === 197, 'colToIndex("GO") === 197, got ' + colToIndex('GO'));

    assert(results, '7f', indexToCol(1) === 'A', 'indexToCol(1) === "A", got "' + indexToCol(1) + '"');
    assert(results, '7g', indexToCol(26) === 'Z', 'indexToCol(26) === "Z", got "' + indexToCol(26) + '"');
    assert(results, '7h', indexToCol(27) === 'AA', 'indexToCol(27) === "AA", got "' + indexToCol(27) + '"');
    assert(results, '7i', indexToCol(197) === 'GO', 'indexToCol(197) === "GO", got "' + indexToCol(197) + '"');
  } catch (e) {
    fail(results, '7', 'Exception: ' + e.message);
  }
  Logger.log('');
}

// ─── TEST 8: spellNumber ───
function testSpellNumber(results) {
  Logger.log('─── TEST 8: spellNumber ───');
  try {
    assert(results, '8a', spellNumber(0) === 'zero', 'spellNumber(0) === "zero"');
    assert(results, '8b', spellNumber(3) === 'three', 'spellNumber(3) === "three"');
    assert(results, '8c', spellNumber(10) === 'ten', 'spellNumber(10) === "ten"');
    assert(results, '8d', spellNumber(15) === '15', 'spellNumber(15) === "15" (number > 10)');
  } catch (e) {
    fail(results, '8', 'Exception: ' + e.message);
  }
  Logger.log('');
}

// ─── TEST 9: nameVariants ───
function testNameVariants(results) {
  Logger.log('─── TEST 9: nameVariants ───');
  try {
    var v1 = nameVariants('Chao, Hailey');
    assert(results, '9a', v1.length >= 2, '"Chao, Hailey" produces ≥2 variants, got ' + v1.length);
    assert(results, '9b', v1.indexOf('chao, hailey') > -1, 'Contains "chao, hailey"');
    assert(results, '9c', v1.indexOf('hailey chao') > -1, 'Contains "hailey chao" (reversed)');

    var v2 = nameVariants('John Smith');
    assert(results, '9d', v2.length >= 1, '"John Smith" produces ≥1 variant');
    assert(results, '9e', v2.indexOf('john smith') > -1, 'Contains "john smith"');
  } catch (e) {
    fail(results, '9', 'Exception: ' + e.message);
  }
  Logger.log('');
}


// ═══════════════════════════════════════════════════════════
//                    HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

function assert(results, id, condition, message, detail) {
  if (condition) {
    Logger.log('  ✅ ' + id + ': ' + message);
    results.passed++;
  } else {
    var msg = id + ': FAILED — ' + message + (detail ? ' (' + detail + ')' : '');
    Logger.log('  ❌ ' + msg);
    results.failed++;
    results.errors.push(msg);
  }
}

function fail(results, id, message) {
  Logger.log('  ❌ ' + id + ': ' + message);
  results.failed++;
  results.errors.push(id + ': ' + message);
}

function skip(results, id, reason) {
  Logger.log('  ⏭️ ' + id + ': SKIPPED — ' + reason);
}

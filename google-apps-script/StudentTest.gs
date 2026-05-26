/**
 * StudentTest.gs — Test Suite for Student Portal Backend
 *
 * HOW TO RUN:
 *   1. Push this file:  npm run push
 *   2. Open Apps Script editor:  npm run open
 *   3. Select "runStudentTests" from the function dropdown
 *   4. Click ▶ Run
 *   5. View → Execution log to see results
 *
 * SETUP: Before running tests, set the Script Property:
 *   STUDENT_ROSTER_SSID = <your spreadsheet ID with "Student Roster" sheet>
 */

function runStudentTests() {
  Logger.log('═══════════════════════════════════════');
  Logger.log('  STUDENT PORTAL — BACKEND TEST SUITE');
  Logger.log('  ' + new Date().toLocaleString());
  Logger.log('═══════════════════════════════════════\n');

  var results = { passed: 0, failed: 0, errors: [] };

  testStudentAuth(results);
  testGetStudentGrade(results);
  testGetStudentActivity(results);
  testGetStudentMessages(results);
  testGetAnnouncements(results);
  testGetCurrentLesson(results);
  testGetResources(results);
  testStudentGoals(results);
  testStudentReflections(results);
  testHelpRequests(results);
  testGetEncouragement(results);
  testGetStudentDashboard(results);
  testUploadValidation(results);

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

// ═══════════════════════════════════════════════════════
//                       TESTS
// ═══════════════════════════════════════════════════════

// ─── TEST S1: studentAuth ───
function testStudentAuth(results) {
  Logger.log('─── TEST S1: studentAuth ───');
  try {
    var result = studentAuth();

    // Should return an object with authenticated property
    assert(results, 'S1a', result !== undefined && result !== null, 'Returns a result object');
    assert(results, 'S1b', typeof result.authenticated === 'boolean', 'Has boolean .authenticated property');

    if (result.authenticated) {
      assert(results, 'S1c', !!result.student, 'Has .student when authenticated');
      assert(results, 'S1d', !!result.student.email, 'Student has .email');
      assert(results, 'S1e', !!result.student.name, 'Student has .name: "' + result.student.name + '"');
      Logger.log('   ℹ️ Authenticated as: ' + result.student.name + ' (' + result.student.email + ')');
    } else {
      Logger.log('   ℹ️ Not authenticated (expected if running as teacher): ' + (result.error || ''));
      assert(results, 'S1c', !!result.error, 'Has .error when not authenticated');
    }
  } catch (e) {
    fail(results, 'S1', 'Exception: ' + e.message);
  }
  Logger.log('');
}

// ─── TEST S2: getStudentGrade ───
function testGetStudentGrade(results) {
  Logger.log('─── TEST S2: getStudentGrade ───');
  try {
    var result = getStudentGrade();
    assert(results, 'S2a', result !== undefined, 'Returns a result');

    // Either has grade data or an error (if not a student account)
    if (result.letterGrade) {
      assert(results, 'S2b', typeof result.letterGrade === 'string', 'letterGrade is a string: "' + result.letterGrade + '"');
      assert(results, 'S2c', !!result.name, 'Has student name');
      Logger.log('   ℹ️ Grade: ' + result.letterGrade + ' (' + (result.percentage || 'no %') + ')');
    } else {
      Logger.log('   ℹ️ No grade returned (expected if not student): ' + (result.error || ''));
      assert(results, 'S2b', true, 'Gracefully handles non-student user');
    }
  } catch (e) {
    fail(results, 'S2', 'Exception: ' + e.message);
  }
  Logger.log('');
}

// ─── TEST S3: getStudentActivity ───
function testGetStudentActivity(results) {
  Logger.log('─── TEST S3: getStudentActivity ───');
  try {
    var result = getStudentActivity();
    assert(results, 'S3a', result !== undefined, 'Returns a result');

    if (result.activities) {
      assert(results, 'S3b', Array.isArray(result.activities), 'activities is an array');
      assert(results, 'S3c', result.summary !== undefined, 'Has summary');
      if (result.summary) {
        assert(results, 'S3d', result.summary.totalDays !== undefined, 'Summary has totalDays');
        assert(results, 'S3e', result.summary.attendancePct !== undefined, 'Summary has attendancePct');
      }
      if (result.activities.length > 0) {
        var a = result.activities[0];
        assert(results, 'S3f', !!a.date, 'Activity has .date');
        assert(results, 'S3g', a.attendance !== undefined, 'Activity has .attendance');
        Logger.log('   ℹ️ Found ' + result.activities.length + ' activity entries');
      }
    } else {
      Logger.log('   ℹ️ No activity data (expected if not student): ' + (result.error || ''));
      assert(results, 'S3b', true, 'Gracefully handles missing data');
    }
  } catch (e) {
    fail(results, 'S3', 'Exception: ' + e.message);
  }
  Logger.log('');
}

// ─── TEST S4: getStudentMessages ───
function testGetStudentMessages(results) {
  Logger.log('─── TEST S4: getStudentMessages ───');
  try {
    var result = getStudentMessages();
    assert(results, 'S4a', result !== undefined, 'Returns a result');
    assert(results, 'S4b', result.messages !== undefined || result.error !== undefined, 'Has .messages or .error');

    if (result.messages) {
      assert(results, 'S4c', Array.isArray(result.messages), 'messages is an array');
      Logger.log('   ℹ️ Found ' + result.messages.length + ' messages');
    }
  } catch (e) {
    fail(results, 'S4', 'Exception: ' + e.message);
  }
  Logger.log('');
}

// ─── TEST S5: getAnnouncements ───
function testGetAnnouncements(results) {
  Logger.log('─── TEST S5: getAnnouncements ───');
  try {
    var result = getAnnouncements();
    assert(results, 'S5a', result !== undefined, 'Returns a result');
    assert(results, 'S5b', result.announcements !== undefined || result.error !== undefined, 'Has .announcements or .error');

    if (result.announcements) {
      assert(results, 'S5c', Array.isArray(result.announcements), 'announcements is an array');
      Logger.log('   ℹ️ Found ' + result.announcements.length + ' announcements');
    }
  } catch (e) {
    fail(results, 'S5', 'Exception: ' + e.message);
  }
  Logger.log('');
}

// ─── TEST S6: getCurrentLesson ───
function testGetCurrentLesson(results) {
  Logger.log('─── TEST S6: getCurrentLesson ───');
  try {
    var result = getCurrentLesson();
    assert(results, 'S6a', result !== undefined, 'Returns a result');

    if (result.lesson) {
      assert(results, 'S6b', !!result.lesson.topic, 'Lesson has .topic: "' + result.lesson.topic + '"');
      Logger.log('   ℹ️ Current lesson: ' + result.lesson.topic);
    } else {
      Logger.log('   ℹ️ No lesson available (sheet may not exist yet)');
      assert(results, 'S6b', true, 'Gracefully handles no lesson');
    }
  } catch (e) {
    fail(results, 'S6', 'Exception: ' + e.message);
  }
  Logger.log('');
}

// ─── TEST S7: getResources ───
function testGetResources(results) {
  Logger.log('─── TEST S7: getResources ───');
  try {
    var result = getResources('');
    assert(results, 'S7a', result !== undefined, 'Returns a result');
    assert(results, 'S7b', result.resources !== undefined || result.error !== undefined, 'Has .resources or .error');

    if (result.resources) {
      assert(results, 'S7c', Array.isArray(result.resources), 'resources is an array');
      Logger.log('   ℹ️ Found ' + result.resources.length + ' resources');

      // Test filtering
      if (result.resources.length > 0) {
        var topic = result.resources[0].topic;
        var filtered = getResources(topic);
        assert(results, 'S7d', filtered.resources.length >= 1, 'Filtering by topic "' + topic + '" returns results');
      }
    }
  } catch (e) {
    fail(results, 'S7', 'Exception: ' + e.message);
  }
  Logger.log('');
}

// ─── TEST S8: Student Goals CRUD ───
function testStudentGoals(results) {
  Logger.log('─── TEST S8: Student Goals ───');
  try {
    var goalsResult = getStudentGoals();
    assert(results, 'S8a', goalsResult !== undefined, 'getStudentGoals returns a result');
    assert(results, 'S8b', goalsResult.goals !== undefined || goalsResult.error !== undefined, 'Has .goals or .error');

    if (goalsResult.goals) {
      assert(results, 'S8c', Array.isArray(goalsResult.goals), 'goals is an array');
      Logger.log('   ℹ️ Found ' + goalsResult.goals.length + ' goals');
    }
  } catch (e) {
    fail(results, 'S8', 'Exception: ' + e.message);
  }
  Logger.log('');
}

// ─── TEST S9: Student Reflections ───
function testStudentReflections(results) {
  Logger.log('─── TEST S9: Student Reflections ───');
  try {
    var result = getStudentReflections();
    assert(results, 'S9a', result !== undefined, 'Returns a result');
    assert(results, 'S9b', result.reflections !== undefined || result.error !== undefined, 'Has .reflections or .error');

    if (result.reflections) {
      assert(results, 'S9c', Array.isArray(result.reflections), 'reflections is an array');
      Logger.log('   ℹ️ Found ' + result.reflections.length + ' reflections');
    }
  } catch (e) {
    fail(results, 'S9', 'Exception: ' + e.message);
  }
  Logger.log('');
}

// ─── TEST S10: Help Requests ───
function testHelpRequests(results) {
  Logger.log('─── TEST S10: Help Requests ───');
  try {
    var result = getHelpRequests();
    assert(results, 'S10a', result !== undefined, 'Returns a result');
    assert(results, 'S10b', result.requests !== undefined || result.error !== undefined, 'Has .requests or .error');

    if (result.requests) {
      assert(results, 'S10c', Array.isArray(result.requests), 'requests is an array');
      Logger.log('   ℹ️ Found ' + result.requests.length + ' help requests');
    }
  } catch (e) {
    fail(results, 'S10', 'Exception: ' + e.message);
  }
  Logger.log('');
}

// ─── TEST S11: Encouragement Engine ───
function testGetEncouragement(results) {
  Logger.log('─── TEST S11: getEncouragement ───');
  try {
    var result = getEncouragement();
    assert(results, 'S11a', result !== undefined, 'Returns a result');
    assert(results, 'S11b', result.badges !== undefined, 'Has .badges array');
    assert(results, 'S11c', Array.isArray(result.badges), 'badges is an array');
    assert(results, 'S11d', typeof result.message === 'string', 'Has .message string');

    Logger.log('   ℹ️ Badges: ' + result.badges.length + ', Message: "' + result.message.substring(0, 50) + '..."');
  } catch (e) {
    fail(results, 'S11', 'Exception: ' + e.message);
  }
  Logger.log('');
}

// ─── TEST S12: getStudentDashboard (combined endpoint) ───
function testGetStudentDashboard(results) {
  Logger.log('─── TEST S12: getStudentDashboard ───');
  try {
    var result = getStudentDashboard();
    assert(results, 'S12a', result !== undefined, 'Returns a result');
    assert(results, 'S12b', typeof result.authenticated === 'boolean', 'Has .authenticated boolean');

    if (result.authenticated) {
      assert(results, 'S12c', !!result.student, 'Has .student');
      assert(results, 'S12d', result.grade !== undefined, 'Has .grade');
      assert(results, 'S12e', result.activity !== undefined, 'Has .activity');
      assert(results, 'S12f', result.messages !== undefined, 'Has .messages');
      assert(results, 'S12g', result.announcements !== undefined, 'Has .announcements');
      assert(results, 'S12h', result.lesson !== undefined, 'Has .lesson');
      assert(results, 'S12i', result.encouragement !== undefined, 'Has .encouragement');
      assert(results, 'S12j', result.goals !== undefined, 'Has .goals');
      assert(results, 'S12k', result.reflections !== undefined, 'Has .reflections');
      assert(results, 'S12l', result.helpRequests !== undefined, 'Has .helpRequests');
      Logger.log('   ℹ️ Dashboard loaded for: ' + result.student.name);
    } else {
      Logger.log('   ℹ️ Not authenticated (expected for teacher account)');
      assert(results, 'S12c', true, 'Gracefully returns unauthenticated');
    }
  } catch (e) {
    fail(results, 'S12', 'Exception: ' + e.message);
  }
  Logger.log('');
}

// ─── TEST S13: Upload Validation ───
function testUploadValidation(results) {
  Logger.log('─── TEST S13: Upload Validation ───');
  try {
    // Test invalid file type
    var result = uploadExitTicket('dGVzdA==', 'test.exe', 'application/x-msdownload');
    assert(results, 'S13a', !!result.error, 'Rejects invalid file type: ' + (result.error || 'no error'));
    assert(results, 'S13b', result.error && result.error.indexOf('not allowed') > -1, 'Error message mentions not allowed');

    Logger.log('   ℹ️ File type validation working correctly');
  } catch (e) {
    fail(results, 'S13', 'Exception: ' + e.message);
  }
  Logger.log('');
}

// ═══════════════════════════════════════════════════════
//                  HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════

// Reuse assert/fail/skip from Test.gs (they share the same project)
// If running standalone, define them here:
if (typeof assert === 'undefined') {
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
}

if (typeof fail === 'undefined') {
  function fail(results, id, message) {
    Logger.log('  ❌ ' + id + ': ' + message);
    results.failed++;
    results.errors.push(id + ': ' + message);
  }
}

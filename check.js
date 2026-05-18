    // ─── State ───
    var generatedResults = [];
    var teacherEmail = '';
    var _lastLoadedSheetId = {};  // track per input so we don't re-fetch the same ID

    // ─── Handle Paste on Spreadsheet ID fields ───
    function handleSpreadsheetPaste(inputId) {
      // Delay so the pasted value is committed to the input before we read it
      setTimeout(function () { loadSheetNames(inputId); }, 150);
    }

    // ─── Load Sheet Names into Dropdowns ───
    function loadSheetNames(inputId) {
      var rawId = document.getElementById(inputId).value.trim();

      // If the field was cleared, reset the dedup cache so the next paste re-triggers
      if (!rawId) {
        delete _lastLoadedSheetId[inputId];
        return;
      }

      var cleanId = extractSpreadsheetId(rawId);
      if (!cleanId) return;

      // Update the field to show the clean ID
      if (cleanId !== rawId) {
        document.getElementById(inputId).value = cleanId;
      }

      // Don't re-fetch if we already loaded this ID for this input
      if (_lastLoadedSheetId[inputId] === cleanId) return;
      _lastLoadedSheetId[inputId] = cleanId;

      // Determine which set of dropdowns to populate
      var dropdowns;
      if (inputId === 'spreadsheetId') {
        dropdowns = ['sheetName', 'emailSheetName'];
      } else if (inputId === 'actSpreadsheetId') {
        dropdowns = ['actSheetName', 'actGradesSheet'];
      } else if (inputId === 'commSpreadsheetId') {
        dropdowns = ['commSheetName', 'commGradesSheet', 'emailSheetName'];
      } else {
        return;
      }

      // Show loading state
      dropdowns.forEach(function (selId) {
        var sel = document.getElementById(selId);
        sel.innerHTML = '<option value="" disabled selected>Loading sheets...</option>';
      });

      google.script.run
        .withSuccessHandler(function (result) {
          if (result.error) {
            dropdowns.forEach(function (selId) {
              var sel = document.getElementById(selId);
              sel.innerHTML = '<option value="" disabled selected>⚠️ Error loading sheets</option>';
            });
            return;
          }

          dropdowns.forEach(function (selId) {
            var sel = document.getElementById(selId);
            var isOptional = (selId === 'emailSheetName' || selId === 'actGradesSheet');
            sel.innerHTML = '';

            // Add a "none" option for optional fields
            if (isOptional) {
              var noneOpt = document.createElement('option');
              noneOpt.value = '';
              noneOpt.textContent = '— none —';
              sel.appendChild(noneOpt);
            }

            result.names.forEach(function (name) {
              var opt = document.createElement('option');
              opt.value = name;
              opt.textContent = name;
              sel.appendChild(opt);
            });

            // Auto-select the grades sheet if it matches common patterns
            if (selId === 'actGradesSheet') {
              var gradePatterns = [
                /grade\s*calculator/i,
                /grade\s*calc/i,
                /grades/i,
                /grade\s*book/i,
                /gradebook/i
              ];
              for (var p = 0; p < gradePatterns.length; p++) {
                var matched = false;
                for (var n = 0; n < result.names.length; n++) {
                  if (gradePatterns[p].test(result.names[n])) {
                    sel.value = result.names[n];
                    matched = true;
                    break;
                  }
                }
                if (matched) {
                  // Trigger header loading for the auto-selected grades sheet
                  loadActGradesHeaders();
                  break;
                }
              }
            }
          });
        })
        .withFailureHandler(function (err) {
          dropdowns.forEach(function (selId) {
            var sel = document.getElementById(selId);
            sel.innerHTML = '<option value="" disabled selected>⚠️ ' + err.message + '</option>';
          });
        })
        .getSheetNames(cleanId);
    }

    // ─── Column Toggle ───
    function toggleColumns() {
      var grid = document.getElementById('columnsGrid');
      var arrow = document.getElementById('colArrow');
      grid.classList.toggle('show');
      arrow.classList.toggle('open');
    }

    function toggleEmailConfig() {
      var grid = document.getElementById('emailGrid');
      var arrow = document.getElementById('emailArrow');
      var isShown = grid.style.display === 'grid';
      grid.style.display = isShown ? 'none' : 'grid';
      arrow.classList.toggle('open');
    }

    // ─── Populate a <select> with header options ───
    function populateHeaderSelect(selectId, headers, autoValue) {
      var sel = document.getElementById(selectId);
      sel.innerHTML = '';
      // Add a blank/unselected option
      var blank = document.createElement('option');
      blank.value = '';
      blank.textContent = '— select column —';
      sel.appendChild(blank);

      headers.forEach(function (h) {
        var opt = document.createElement('option');
        opt.value = h.col;
        opt.textContent = h.col + ' — ' + h.header;
        sel.appendChild(opt);
      });

      // Auto-select if we have a match
      if (autoValue) {
        sel.value = autoValue;
      }
    }

    // ─── Auto-Detect Column Mapping ───
    // Returns { fieldId: colLetter } for best-guess matches
    function autoDetectColumns(headers) {
      var rules = {
        studentNameCol: [/\bstudent\s*name\b/i, /\bname\b/i, /\bstudent\b/i],
        studentCommentCol: [/\bstudent\s*comment/i, /\bcomment\b/i],
        parentCommentCol: [/\bparent\s*comment/i, /\bparent\b.*comment/i, /\bguardian/i],
        gradeCol: [/\bletter\s*grade\b/i, /\bcurrent\s*grade\b/i, /\bgrade\b/i],
        tardiesCol: [/\btardies\b/i, /\btardy\b/i, /\btard/i],
        absencesCol: [/\babsences\b/i, /\babsence\b/i, /\babsent/i]
      };

      var detected = {};

      // For each field, find the first header that matches any pattern
      Object.keys(rules).forEach(function (field) {
        var patterns = rules[field];
        for (var p = 0; p < patterns.length; p++) {
          for (var h = 0; h < headers.length; h++) {
            if (patterns[p].test(headers[h].header)) {
              if (!detected[field]) {
                detected[field] = headers[h].col;
              }
              break;
            }
          }
          if (detected[field]) break;
        }
      });

      return detected;
    }

    // ─── Load Column Headers (Comments Mode) ───
    function loadColumnHeaders() {
      var spreadsheetId = extractSpreadsheetId(document.getElementById('spreadsheetId').value.trim());
      var sheetName = document.getElementById('sheetName').value.trim();
      var headerRow = document.getElementById('headerRow').value.trim() || '3';

      if (!spreadsheetId || !sheetName) return;

      // Show loading state on all column selects
      var colFields = ['studentNameCol', 'studentCommentCol', 'parentCommentCol', 'gradeCol', 'tardiesCol', 'absencesCol'];
      colFields.forEach(function (id) {
        var sel = document.getElementById(id);
        sel.innerHTML = '<option value="" disabled selected>Loading headers...</option>';
      });

      google.script.run
        .withSuccessHandler(function (result) {
          if (result.error) {
            colFields.forEach(function (id) {
              var sel = document.getElementById(id);
              sel.innerHTML = '<option value="" disabled selected>⚠️ ' + result.error + '</option>';
            });
            document.getElementById('colMapStatus').textContent = '';
            return;
          }

          // Auto-detect columns
          var detected = autoDetectColumns(result.headers);
          var detectedCount = Object.keys(detected).length;

          // Populate each dropdown
          colFields.forEach(function (id) {
            populateHeaderSelect(id, result.headers, detected[id] || '');
          });

          // Update data start row to match
          if (result.dataStartRow) {
            document.getElementById('dataStartRow').value = result.dataStartRow;
          }

          // Show status and auto-expand
          if (detectedCount > 0) {
            document.getElementById('colMapStatus').textContent = '✓ ' + detectedCount + '/6 auto-detected';
            // Auto-expand the column mapping section
            var grid = document.getElementById('columnsGrid');
            var arrow = document.getElementById('colArrow');
            if (!grid.classList.contains('show')) {
              grid.classList.add('show');
              arrow.classList.add('open');
            }
          } else {
            document.getElementById('colMapStatus').textContent = '⚠ could not auto-detect — please select manually';
            document.getElementById('colMapStatus').style.color = 'var(--warning)';
            // Auto-expand so user can select
            var grid = document.getElementById('columnsGrid');
            var arrow = document.getElementById('colArrow');
            if (!grid.classList.contains('show')) {
              grid.classList.add('show');
              arrow.classList.add('open');
            }
          }
        })
        .withFailureHandler(function (err) {
          colFields.forEach(function (id) {
            var sel = document.getElementById(id);
            sel.innerHTML = '<option value="" disabled selected>⚠️ Error</option>';
          });
        })
        .getSheetHeaders(spreadsheetId, sheetName, headerRow);
    }

    // ─── Load Email Sheet Headers ───
    function loadEmailHeaders() {
      var spreadsheetId = extractSpreadsheetId(document.getElementById('spreadsheetId').value.trim());
      var emailSheet = document.getElementById('emailSheetName').value.trim();

      if (!spreadsheetId || !emailSheet) {
        // Reset to defaults if "none" selected
        document.getElementById('emailSheetNameCol').innerHTML = '<option value="A">— select email sheet —</option>';
        document.getElementById('emailSheetEmailCol').innerHTML = '<option value="B">— select email sheet —</option>';
        return;
      }

      var fields = ['emailSheetNameCol', 'emailSheetEmailCol'];
      fields.forEach(function (id) {
        document.getElementById(id).innerHTML = '<option value="" disabled selected>Loading...</option>';
      });

      google.script.run
        .withSuccessHandler(function (result) {
          if (result.error) {
            fields.forEach(function (id) {
              document.getElementById(id).innerHTML = '<option value="" disabled>⚠️ Error</option>';
            });
            return;
          }

          // Auto-detect name and email columns
          var nameCol = '', emailCol = '';
          for (var i = 0; i < result.headers.length; i++) {
            var h = result.headers[i].header.toLowerCase();
            if (!nameCol && (/\bname\b/.test(h) || /\bstudent\b/.test(h))) {
              nameCol = result.headers[i].col;
            }
            if (!emailCol && (/\bemail\b/.test(h) || /\be-mail\b/.test(h) || /\bparent.*email\b/.test(h))) {
              emailCol = result.headers[i].col;
            }
          }

          populateHeaderSelect('emailSheetNameCol', result.headers, nameCol);
          populateHeaderSelect('emailSheetEmailCol', result.headers, emailCol);
        })
        .withFailureHandler(function (err) {
          fields.forEach(function (id) {
            document.getElementById(id).innerHTML = '<option value="" disabled>⚠️ Error</option>';
          });
        })
        .getSheetHeaders(spreadsheetId, emailSheet, '1');
    }

    // ─── (Activity Mode) Not used for column headers — just placeholder ───
    function loadGradesSheetHeaders() {
      // The actSheetName is the activity sheet — no column mapping needed for it
      // (columns A-D are fixed: Period, Name, Fellow, Component)
    }

    // ─── Load Fellows from Activity Sheet (column C) ───
    function loadActivityFellows() {
      var spreadsheetId = extractSpreadsheetId(document.getElementById('actSpreadsheetId').value.trim());
      var sheetName = document.getElementById('actSheetName').value.trim();
      if (!spreadsheetId || !sheetName) return;

      var sel = document.getElementById('actFellowFilter');
      sel.innerHTML = '<option value="">Loading fellows...</option>';

      google.script.run
        .withSuccessHandler(function (result) {
          if (result.hasFellowColumn === false) {
            sel.innerHTML = '<option value="">No Fellow Column identified</option>';
            sel.disabled = true;
            document.getElementById('actFellowHint').textContent = 'No Fellow column detected in the spreadsheet.';
          } else {
            sel.innerHTML = '<option value="">All Fellows</option>';
            sel.disabled = false;
            document.getElementById('actFellowHint').textContent = 'Generate report for all or one fellow';
            if (result.fellows && result.fellows.length > 0) {
              result.fellows.forEach(function (f) {
                var opt = document.createElement('option');
                opt.value = f;
                opt.textContent = f;
                sel.appendChild(opt);
              });
            }
          }
        })
        .withFailureHandler(function () {
          sel.innerHTML = '<option value="">All Fellows</option>';
        })
        .getActivityFellows(spreadsheetId, sheetName);
    }

    // ─── Load Activity Grades Sheet Headers ───
    function loadActGradesHeaders() {
      var spreadsheetId = extractSpreadsheetId(document.getElementById('actSpreadsheetId').value.trim());
      var gradesSheet = document.getElementById('actGradesSheet').value.trim();

      if (!spreadsheetId || !gradesSheet) {
        document.getElementById('actGradesNameCol').innerHTML = '<option value="B">— select grades sheet —</option>';
        document.getElementById('actGradesGradeCol').innerHTML = '<option value="E">— select grades sheet —</option>';
        return;
      }

      var fields = ['actGradesNameCol', 'actGradesGradeCol'];
      fields.forEach(function (id) {
        document.getElementById(id).innerHTML = '<option value="" disabled selected>Loading...</option>';
      });

      var startRow = document.getElementById('actGradesStartRow').value.trim() || '4';

      google.script.run
        .withSuccessHandler(function (result) {
          if (result.error) {
            fields.forEach(function (id) {
              document.getElementById(id).innerHTML = '<option value="" disabled>⚠️ Error</option>';
            });
            document.getElementById('gradeColMapStatus').textContent = '';
            return;
          }

          // Auto-detect name and grade columns
          var nameCol = '', gradeCol = '';

          // Pass 1: Check header text for obvious matches
          // For grade: collect ALL grade candidates, then prefer the one under "Full Year"
          var gradeCandidates = [];
          for (var i = 0; i < result.headers.length; i++) {
            // Normalize: collapse newlines, slashes, extra whitespace
            var h = result.headers[i].header.replace(/[\n\r\/]+/g, ' ').replace(/\s+/g, ' ').toLowerCase().trim();
            if (!nameCol && (/\bname\b/.test(h) || /\bstudent\b/.test(h))) {
              nameCol = result.headers[i].col;
            }
            if (/letter\s*grade/i.test(h) || /\bgrade\b/.test(h)) {
              gradeCandidates.push(result.headers[i]);
            }
          }

          // Pick the grade column: prefer the one under "Full Year" top header
          if (gradeCandidates.length > 0) {
            var fullYearGrade = gradeCandidates.filter(function (gc) {
              return gc.topHeader && /full\s*year/i.test(gc.topHeader);
            });
            if (fullYearGrade.length > 0) {
              gradeCol = fullYearGrade[fullYearGrade.length - 1].col;
            } else {
              gradeCol = gradeCandidates[gradeCandidates.length - 1].col;
            }
          }

          // Pass 2.5: If grade column still not found, inspect sample data for letter grades
          // Look for a column where most values are single letter grades (A, B, C, D, F)
          if (!gradeCol && result.sampleData) {
            var bestGradeCol = '';
            var bestGradeScore = 0;

            for (var i = 0; i < result.headers.length; i++) {
              var col = result.headers[i].col;
              var samples = result.sampleData[col] || [];
              if (samples.length === 0) continue;

              var gradeScore = 0;
              for (var j = 0; j < samples.length; j++) {
                var val = samples[j].trim().toUpperCase();
                // Match single letter grades: A, B, C, D, F (with optional +/-)
                if (/^[ABCDF][+\-]?$/.test(val)) {
                  gradeScore += 3;
                }
              }

              var normalized = gradeScore / samples.length;
              // Prefer columns under "Full Year"
              var isFullYear = result.headers[i].topHeader && /full\s*year/i.test(result.headers[i].topHeader);
              if (isFullYear) normalized += 1; // bonus for Full Year section

              if (normalized > bestGradeScore) {
                bestGradeScore = normalized;
                bestGradeCol = col;
              }
            }

            if (bestGradeScore >= 1.5) {
              gradeCol = bestGradeCol;
            }
          }

          // Pass 2: If name column not found by header, inspect sample data
          // Look for the column where most values look like human names
          // (e.g. "Last, First" or two+ word text strings, no pure numbers/dates)
          if (!nameCol && result.sampleData) {
            var bestCol = '';
            var bestScore = 0;

            for (var i = 0; i < result.headers.length; i++) {
              var col = result.headers[i].col;
              var samples = result.sampleData[col] || [];
              if (samples.length === 0) continue;

              var nameScore = 0;
              for (var j = 0; j < samples.length; j++) {
                var val = samples[j];
                // Skip if it's a pure number, date, or single character
                if (/^\d+(\.\d+)?%?$/.test(val)) continue; // numbers/percentages
                if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(val)) continue; // dates
                if (val.length < 3) continue; // too short

                // Positive signals: comma-separated (Last, First), or 2+ words, or contains letters
                if (/,/.test(val) && /[a-zA-Z]/.test(val)) {
                  nameScore += 3; // strong signal: "Doe, John"
                } else if (/\s/.test(val) && /^[a-zA-Z\s\-']+$/.test(val)) {
                  nameScore += 2; // "John Doe"
                } else if (/^[a-zA-Z\-']+$/.test(val) && val.length > 2) {
                  nameScore += 1; // single word name
                }
              }

              // Normalize by sample count
              var normalized = nameScore / samples.length;
              if (normalized > bestScore) {
                bestScore = normalized;
                bestCol = col;
              }
            }

            // Only auto-select if we found a strong enough signal (at least 1.5 avg score)
            if (bestScore >= 1.5) {
              nameCol = bestCol;
            }
          }

          populateHeaderSelect('actGradesNameCol', result.headers, nameCol);
          populateHeaderSelect('actGradesGradeCol', result.headers, gradeCol);

          // Show status
          var detectedCount = (nameCol ? 1 : 0) + (gradeCol ? 1 : 0);
          if (detectedCount > 0) {
            document.getElementById('gradeColMapStatus').textContent = '✓ ' + detectedCount + '/2 auto-detected';
            // Auto-expand
            var grid = document.getElementById('gradesGrid');
            var arrow = document.getElementById('gradesArrow');
            if (grid.style.display !== 'grid') {
              grid.style.display = 'grid';
              arrow.classList.add('open');
            }
          }
        })
        .withFailureHandler(function (err) {
          fields.forEach(function (id) {
            document.getElementById(id).innerHTML = '<option value="" disabled>⚠️ Error</option>';
          });
        })
        .getSheetHeaders(spreadsheetId, gradesSheet, startRow);
    }

    // ─── Step Management ───
    function setStep(n) {
      for (var i = 1; i <= 4; i++) {
        var pill = document.getElementById('step' + i + 'pill');
        pill.className = 'step-pill' + (i < n ? ' done' : (i === n ? ' active' : ''));
      }
    }

    // ─── Extract Spreadsheet ID from URL or raw ID ───
    function extractSpreadsheetId(input) {
      input = input.trim();
      // If it looks like a URL, extract the ID between /d/ and the next /
      var match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
      if (match) return match[1];
      // Otherwise, treat the whole input as the ID
      return input;
    }

    // ─── Build Config Object ───
    function getConfig() {
      var rawId = document.getElementById('spreadsheetId').value.trim();
      var cleanId = extractSpreadsheetId(rawId);

      // If we extracted an ID from a URL, update the input field so the teacher sees what was used
      if (cleanId !== rawId) {
        document.getElementById('spreadsheetId').value = cleanId;
      }

      return {
        spreadsheetId: cleanId,
        sheetName: document.getElementById('sheetName').value.trim(),
        studentNameCol: document.getElementById('studentNameCol').value.trim().toUpperCase(),
        studentCommentCol: document.getElementById('studentCommentCol').value.trim().toUpperCase(),
        parentCommentCol: document.getElementById('parentCommentCol').value.trim().toUpperCase(),
        gradeCol: document.getElementById('gradeCol').value.trim().toUpperCase(),
        tardiesCol: document.getElementById('tardiesCol').value.trim().toUpperCase(),
        absencesCol: document.getElementById('absencesCol').value.trim().toUpperCase(),
        emailSheetName: document.getElementById('emailSheetName').value.trim(),
        emailSheetNameCol: document.getElementById('emailSheetNameCol').value.trim().toUpperCase() || 'A',
        emailSheetEmailCol: document.getElementById('emailSheetEmailCol').value.trim().toUpperCase() || 'B',
        headerRow: document.getElementById('headerRow').value.trim(),
        dataStartRow: document.getElementById('dataStartRow').value.trim()
      };
    }

    // ─── Show Status ───
    function showStatus(id, type, message) {
      var el = document.getElementById(id);
      el.className = 'status show ' + type;
      el.innerHTML = message;
    }

    function hideStatus(id) {
      document.getElementById(id).className = 'status';
    }

    // ─── Grade Badge ───
    function gradeBadge(grade) {
      if (!grade) return '<span class="badge badge-none">—</span>';
      var cls = 'badge-' + grade.toLowerCase().charAt(0);
      return '<span class="badge ' + cls + '">' + grade + '</span>';
    }

    // ─── Generate Email Reports ───
    function generateEmailReports() {
      var config = getActivityConfig('comm');
      
      // Get Email Sheet Config
      config.emailSheetName = document.getElementById('emailSheetName').value.trim();
      config.emailSheetNameCol = document.getElementById('emailSheetNameCol').value.trim().toUpperCase() || 'A';
      config.emailSheetEmailCol = document.getElementById('emailSheetEmailCol').value.trim().toUpperCase() || 'B';
      config.emailSheetStudentEmailCol = document.getElementById('emailSheetStudentEmailCol').value.trim().toUpperCase() || '';
      
      var startSel = document.getElementById('commStartDate');
      var endSel = document.getElementById('commEndDate');
      
      if (!startSel.value || !endSel.value) {
        showStatus('commDateStatus', 'error', '⚠️ Please load and select dates first.');
        return;
      }

      config.startDate = startSel.options[startSel.selectedIndex].text;
      config.endDate = endSel.options[endSel.selectedIndex].text;
      config.fellowFilter = document.getElementById('commFellowFilter').value;

      var btn = document.getElementById('genCommentsBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Generating...';
      hideStatus('commDateStatus');

      google.script.run
        .withSuccessHandler(function (result) {
          btn.disabled = false;
          btn.innerHTML = '📊 Preview & Generate';

          if (result.error) {
            showStatus('commDateStatus', 'error', '❌ ' + result.error);
            return;
          }

          var emailCount = result.students.filter(function (s) { return s.parentEmail || s.studentEmail; }).length;
          
          var statusMsg = '✅ Done! Generated reports for <strong>' + result.totalRows + '</strong> students.';
          if (emailCount > 0) {
            statusMsg += ' (<strong>' + emailCount + '</strong> have email addresses)';
          }
          if (result.emailDiag) {
            statusMsg += '<br><span style="font-size:12px;opacity:0.85;">' + result.emailDiag + '</span>';
          }
          
          showStatus('commDateStatus', emailCount > 0 || !result.emailDiag ? 'success' : 'warning', statusMsg);

          // Store globally for sending
          generatedResults = result.students;
          showEmailSection(result.students);

          if (emailCount === 0) {
            showStatus('emailStatus', 'warning',
              '⚠️ No email addresses found. Expand <strong>"Parent & Student Email Sheet"</strong> in step 1 to configure your email columns.');
          }

          // Get teacher info for email sender display
          google.script.run
            .withSuccessHandler(function (info) {
              teacherEmail = info.email;
              document.getElementById('teacherEmailDisplay').textContent = info.email;
            })
            .getTeacherInfo();

        })
        .withFailureHandler(function (err) {
          btn.disabled = false;
          btn.innerHTML = '📊 Preview & Generate';
          showStatus('commDateStatus', 'error', '❌ Error: ' + err.message);
        })
        .getActivityCommentsAndEmails(config);
    }


    // ─── Email Section ───
    function showEmailSection(results) {
      setStep(3);
      var container = document.getElementById('emailCards');
      container.innerHTML = '';

      var selectableCount = 0;

      results.forEach(function (r, idx) {
        var hasEmail = !!(r.parentEmail || r.studentEmail);
        if (hasEmail) selectableCount++;

        var card = document.createElement('div');
        card.className = 'email-card' + (hasEmail ? ' selected' : ' no-email');
        card.id = 'emailCard' + idx;

        var emailDisplay = '';
        if (r.parentEmail) emailDisplay += '<div>Parent: ✉ ' + r.parentEmail + '</div>';
        if (r.studentEmail) emailDisplay += '<div style="margin-top:2px;">Student: ✉ ' + r.studentEmail + '</div>';
        if (!hasEmail) emailDisplay = '⚠ No email addresses';

        card.innerHTML =
          '<div class="email-card-header">' +
          '<input type="checkbox" id="emailCheck' + idx + '" ' +
          (hasEmail ? 'checked' : 'disabled') +
          ' onchange="updateSelectCount()" data-idx="' + idx + '">' +
          '<div class="email-card-info">' +
          '<div class="email-card-name">' + r.name + '</div>' +
          '<div class="email-card-email ' + (hasEmail ? '' : 'missing') + '">' +
          emailDisplay +
          '</div>' +
          '</div>' +
          '<div class="email-card-grade">' + gradeBadge(r.grade) + '</div>' +
          '</div>' +
          '<div class="email-card-body">' +
          '<div class="form-group"><label>Parent Comment (Emailed to parent)</label>' +
          '<textarea id="parentCommentText' + idx + '" style="min-height:80px;">' + r.parentComment + '</textarea></div>' +
          '<div class="form-group" style="margin-top: 10px;"><label>Student Comment (Emailed to student)</label>' +
          '<textarea id="studentCommentText' + idx + '" style="min-height:80px;">' + r.studentComment + '</textarea></div>' +
          '</div>';

        container.appendChild(card);
      });

      document.getElementById('selectCount').textContent = selectableCount + ' selected';
      document.getElementById('emailSection').className = 'section-visible';

      // Scroll to email section
      document.getElementById('emailSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ─── Select All Toggle ───
    function toggleSelectAll() {
      var checked = document.getElementById('selectAll').checked;
      var boxes = document.querySelectorAll('#emailCards input[type="checkbox"]:not(:disabled)');
      boxes.forEach(function (cb) {
        cb.checked = checked;
        var idx = cb.getAttribute('data-idx');
        var card = document.getElementById('emailCard' + idx);
        card.className = 'email-card' + (checked ? ' selected' : '');
      });
      updateSelectCount();
    }

    function updateSelectCount() {
      var boxes = document.querySelectorAll('#emailCards input[type="checkbox"]:checked');
      document.getElementById('selectCount').textContent = boxes.length + ' selected';
    }

    // ─── Send Emails ───
    function sendEmails() {
      var subject = document.getElementById('emailSubject').value.trim();
      var teacherName = document.getElementById('teacherName').value.trim();
      var customMessage = document.getElementById('customMessage').value.trim();

      if (!subject) {
        showStatus('emailStatus', 'error', '⚠️ Please enter an email subject.');
        return;
      }

      // Gather selected students
      var selected = [];
      generatedResults.forEach(function (r, idx) {
        var cb = document.getElementById('emailCheck' + idx);
        if (cb && cb.checked && (r.parentEmail || r.studentEmail)) {
          var pTextArea = document.getElementById('parentCommentText' + idx);
          var sTextArea = document.getElementById('studentCommentText' + idx);
          
          selected.push({
            name: r.name,
            parentEmail: r.parentEmail,
            studentEmail: r.studentEmail,
            parentComment: pTextArea ? pTextArea.value : r.parentComment,
            studentComment: sTextArea ? sTextArea.value : r.studentComment,
            grade: r.grade || '',
            tardies: r.tardies || 0,
            absences: r.absences || 0
          });
        }
      });

      if (selected.length === 0) {
        showStatus('emailStatus', 'warning', '⚠️ No students selected. Check the boxes next to the parents you want to email.');
        return;
      }

      var btn = document.getElementById('sendBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Sending ' + selected.length + ' emails...';
      hideStatus('emailStatus');

      var emailPayload = {
        students: selected,
        subject: subject,
        teacherName: teacherName,
        customMessage: customMessage
      };

      google.script.run
        .withSuccessHandler(function (result) {
          btn.disabled = false;
          btn.innerHTML = '✉️ Send Selected Emails';

          if (result.error) {
            showStatus('emailStatus', 'error', '❌ ' + result.error);
            return;
          }

          var msg = '✅ <strong>' + result.sent + '</strong> emails sent successfully!';
          if (result.failed > 0) {
            msg += ' <strong>' + result.failed + '</strong> failed.';
          }
          msg += ' <br><span style="font-size:12px; opacity:0.8;">Daily email quota remaining: ' + result.remainingQuota + '</span>';

          showStatus('emailStatus', result.failed > 0 ? 'warning' : 'success', msg);

          // Mark sent/failed on cards
          if (result.errors && result.errors.length > 0) {
            result.errors.forEach(function (err) {
              // Find matching card and mark as failed
              generatedResults.forEach(function (r, idx) {
                if (r.name === err.name) {
                  var card = document.getElementById('emailCard' + idx);
                  if (card) {
                    var badge = document.createElement('span');
                    badge.className = 'sent-badge failed';
                    badge.textContent = '✗ Failed: ' + err.error;
                    card.querySelector('.email-card-header').appendChild(badge);
                  }
                }
              });
            });
          }

          // Mark successful ones
          generatedResults.forEach(function (r, idx) {
            var cb = document.getElementById('emailCheck' + idx);
            if (cb && cb.checked && r.parentEmail) {
              var isError = result.errors && result.errors.some(function (e) { return e.name === r.name; });
              if (!isError) {
                cb.checked = false;
                cb.disabled = true;
                var card = document.getElementById('emailCard' + idx);
                if (card) {
                  card.className = 'email-card';
                  var badge = document.createElement('span');
                  badge.className = 'sent-badge sent';
                  badge.textContent = '✓ Sent';
                  card.querySelector('.email-card-header').appendChild(badge);
                }
              }
            }
          });

          updateSelectCount();
        })
        .withFailureHandler(function (err) {
          btn.disabled = false;
          btn.innerHTML = '✉️ Send Selected Emails';
          showStatus('emailStatus', 'error', '❌ Error: ' + err.message);
        })
        .sendParentEmails(emailPayload);
    }

    // ─── Print Functions ───
    function openPrintView(mode) {
      if (!generatedResults || generatedResults.length === 0) {
        alert('No results to print. Please generate comments first.');
        return;
      }
      var w = window.open('', '_blank');
      if (!w) {
        alert('Pop-up blocked! Please allow pop-ups for this site and try again.');
        return;
      }
      var html;
      if (mode === 'summary') {
        html = buildSummaryHTML(generatedResults);
      } else {
        html = buildReportCardsHTML(generatedResults);
      }
      w.document.write(html);
      w.document.close();
    }

    function buildReportCardsHTML(results) {
      var css = '\
        @page { margin: 0.4in; size: letter; }\
        @media print { .report-card { page-break-after: always; } .report-card:last-child { page-break-after: auto; } .no-print { display: none !important; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }\
        * { margin: 0; padding: 0; box-sizing: border-box; }\
        body { font-family: Arial, Helvetica, sans-serif; color: #222; background: #f5f5f5; }\
        .no-print { background: #2c3e50; color: #fff; padding: 14px 24px; text-align: center; position: sticky; top: 0; z-index: 10; }\
        .no-print button { background: #6bb8c9; color: #fff; border: none; padding: 10px 28px; border-radius: 6px; font-size: 15px; font-weight: bold; cursor: pointer; margin: 0 8px; }\
        .no-print button:hover { background: #5ca8b8; }\
        .report-card { width: 7.5in; margin: 20px auto; background: #fff; border: 2px solid #333; }\
        .report-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 16px 20px 8px; }\
        .report-title { font-size: 18px; font-weight: bold; }\
        .report-logo { text-align: right; }\
        .logo-main { font-size: 26px; font-weight: bold; color: #6bb8c9; }\
        .logo-sub { font-size: 12px; color: #6bb8c9; letter-spacing: 1px; }\
        .report-info { padding: 8px 20px 12px; font-size: 14px; }\
        .report-info .row { display: flex; gap: 32px; margin-bottom: 6px; }\
        .field-line { border-bottom: 1px solid #333; display: inline-block; min-width: 180px; font-weight: bold; padding: 0 4px; }\
        .field-short { min-width: 80px; }\
        .grid-table { width: 100%; border-collapse: collapse; }\
        .grid-table th, .grid-table td { border: 1px solid #333; padding: 14px 12px; text-align: left; font-size: 13px; vertical-align: top; }\
        .grid-table th { background: #fafafa; font-weight: bold; width: 55px; text-align: center; }\
        .grades-cell { font-weight: bold; font-size: 13px; letter-spacing: 3px; }\
        .comments-cell { background: #fafafa; vertical-align: top; width: 35%; }\
        .comments-label { font-weight: bold; font-size: 13px; margin-bottom: 8px; }\
        .comments-text { font-size: 12px; line-height: 1.6; }\
        .signature-cell { font-weight: bold; font-size: 12px; }\
        .report-footer { padding: 8px 20px; font-size: 11px; color: #666; display: flex; justify-content: space-between; border-top: 1px solid #ccc; }\
      ';

      var html = '<!DOCTYPE html><html><head><meta charset="utf-8">';
      html += '<title>Blueprint Progress Reports</title>';
      html += '<style>' + css + '</style></head><body>';
      html += '<div class="no-print"><strong>Blueprint Progress Reports</strong> — ' + results.length + ' students &nbsp;';
      html += '<button onclick="window.print()">🖨️ Print / Save as PDF</button></div>';

      results.forEach(function (r) {
        html += buildSingleCard(r);
      });

      html += '</body></html>';
      return html;
    }

    function buildSingleCard(s) {
      var firstName = s.name.indexOf(',') > -1 ? (s.name.split(',')[1] || '').trim() : s.name;
      if (!firstName) firstName = s.name;

      var h = '<div class="report-card">';
      // Header
      h += '<div class="report-header">';
      h += '<div class="report-title">Blueprint Progress Report</div>';
      h += '<div class="report-logo"><img src="https://blueprintschools.org/wp-content/uploads/2017/09/Blueprint-Horizontal-Logo-Large-768x244.png" alt="Blueprint Schools Network" style="height: 48px; width: auto; display: block;"></div>';
      h += '</div>';
      // Info
      h += '<div class="report-info">';
      h += '<div class="row">Student Name: <span class="field-line">' + s.name + '</span> &nbsp;&nbsp; Period <span class="field-line field-short">&nbsp;</span></div>';
      h += '<div class="row">Week of <span class="field-line">&nbsp;</span> &nbsp;&nbsp; Current grade <span class="field-line field-short">' + (s.grade || '') + '</span></div>';
      h += '</div>';
      // Grid table
      h += '<table class="grid-table">';
      // Mon
      h += '<tr><th>Mon</th><td class="grades-cell">G R A D E S &nbsp; ET: ____</td><td class="grades-cell">G R A D E S &nbsp; ET: ____</td>';
      h += '<td class="comments-cell" rowspan="3"><div class="comments-label">Comments:</div><div class="comments-text">' + (s.studentComment || '') + '</div></td></tr>';
      // Tues
      h += '<tr><th>Tues</th><td class="grades-cell">G R A D E S &nbsp; ET: ____</td><td class="grades-cell">G R A D E S &nbsp; ET: ____</td></tr>';
      // Wed
      h += '<tr><th>Wed</th><td class="grades-cell">G R A D E S &nbsp; ET: ____</td><td class="grades-cell">G R A D E S &nbsp; ET: ____</td></tr>';
      // Thurs
      h += '<tr><th>Thurs</th><td class="grades-cell">G R A D E S &nbsp; ET: ____</td><td class="grades-cell">G R A D E S &nbsp; ET: ____</td>';
      h += '<td class="signature-cell">Signature (for 2 extra credit pts)</td></tr>';
      // Fri
      h += '<tr><th>Fri</th><td class="grades-cell">G R A D E S &nbsp; ET: ____</td><td class="grades-cell">G R A D E S &nbsp; ET: ____</td><td></td></tr>';
      h += '</table>';
      // Footer
      h += '<div class="report-footer"><span>Tardies: ' + (s.tardies || 0) + ' &nbsp;|&nbsp; Absences: ' + (s.absences || 0) + '</span><span>Grade: ' + (s.grade || '—') + '</span></div>';
      h += '</div>';
      return h;
    }

    function buildSummaryHTML(results) {
      var css = '\
        @page { margin: 0.5in; size: letter landscape; }\
        @media print { .no-print { display: none !important; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }\
        * { margin: 0; padding: 0; box-sizing: border-box; }\
        body { font-family: Arial, Helvetica, sans-serif; color: #222; background: #f5f5f5; }\
        .no-print { background: #2c3e50; color: #fff; padding: 14px 24px; text-align: center; position: sticky; top: 0; z-index: 10; }\
        .no-print button { background: #6bb8c9; color: #fff; border: none; padding: 10px 28px; border-radius: 6px; font-size: 15px; font-weight: bold; cursor: pointer; margin: 0 8px; }\
        .summary-wrap { max-width: 10in; margin: 20px auto; background: #fff; border: 1px solid #ccc; border-radius: 8px; padding: 24px; }\
        .summary-title { font-size: 20px; font-weight: bold; margin-bottom: 4px; }\
        .summary-sub { font-size: 13px; color: #666; margin-bottom: 20px; }\
        table { width: 100%; border-collapse: collapse; font-size: 12px; }\
        th { background: #2c3e50; color: #fff; padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }\
        td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }\
        tr:hover { background: #f8fafc; }\
        .grade-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; }\
        .grade-a { background: #d1fae5; color: #059669; }\
        .grade-b { background: #dbeafe; color: #2563eb; }\
        .grade-c { background: #fef3c7; color: #d97706; }\
        .grade-d { background: #fed7aa; color: #ea580c; }\
        .grade-f { background: #fee2e2; color: #dc2626; }\
        .grade-none { background: #f3f4f6; color: #6b7280; }\
      ';

      var html = '<!DOCTYPE html><html><head><meta charset="utf-8">';
      html += '<title>Class Summary</title>';
      html += '<style>' + css + '</style></head><body>';
      html += '<div class="no-print"><strong>Class Summary</strong> — ' + results.length + ' students &nbsp;';
      html += '<button onclick="window.print()">🖨️ Print / Save as PDF</button></div>';
      html += '<div class="summary-wrap">';
      html += '<div class="summary-title">Biweekly Class Summary</div>';
      html += '<div class="summary-sub">Generated on ' + new Date().toLocaleDateString() + ' · ' + results.length + ' students</div>';
      html += '<table><thead><tr><th>Row</th><th>Student Name</th><th>Grade</th><th>Tardies</th><th>Absences</th><th>Student Comment</th><th>Parent Comment</th></tr></thead><tbody>';

      results.forEach(function (r) {
        var gc = (r.grade || '').toLowerCase();
        var gcls = gc === 'a' ? 'grade-a' : gc === 'b' ? 'grade-b' : gc === 'c' ? 'grade-c' : gc === 'd' ? 'grade-d' : gc === 'f' ? 'grade-f' : 'grade-none';
        html += '<tr>';
        html += '<td>' + r.rowNum + '</td>';
        html += '<td><strong>' + r.name + '</strong></td>';
        html += '<td><span class="grade-badge ' + gcls + '">' + (r.grade || '—') + '</span></td>';
        html += '<td>' + (r.tardies || 0) + '</td>';
        html += '<td>' + (r.absences || 0) + '</td>';
        html += '<td style="max-width:250px;">' + (r.studentComment || '').substring(0, 120) + '...</td>';
        html += '<td style="max-width:250px;">' + (r.parentComment || '').substring(0, 120) + '...</td>';
        html += '</tr>';
      });

      html += '</tbody></table></div></body></html>';
      return html;
    }

    // ═══════════════════════════════════════════════
    // ─── Mode Switching ───
    // ═══════════════════════════════════════════════
    function switchMode(mode) {
      var modeComments = document.getElementById('modeComments');
      var modeActivity = document.getElementById('modeActivity');
      var modeCommentsBtn = document.getElementById('modeCommentsBtn');
      var modeActivityBtn = document.getElementById('modeActivityBtn');

      if (modeComments) modeComments.style.display = mode === 'comments' ? 'block' : 'none';
      if (modeActivity) modeActivity.style.display = mode === 'activity' ? 'block' : 'none';
      if (modeCommentsBtn) modeCommentsBtn.className = 'mode-btn' + (mode === 'comments' ? ' active' : '');
      if (modeActivityBtn) modeActivityBtn.className = 'mode-btn' + (mode === 'activity' ? ' active' : '');

      // Sync spreadsheet ID between modes
      if (mode === 'activity') {
        var spreadsheetEl = document.getElementById('spreadsheetId');
        var commentsId = spreadsheetEl ? spreadsheetEl.value : '';
        if (commentsId && !document.getElementById('actSpreadsheetId').value) {
          document.getElementById('actSpreadsheetId').value = commentsId;
        }
      }
    }

    function toggleGradesConfig() {
      var grid = document.getElementById('gradesGrid');
      var arrow = document.getElementById('gradesArrow');
      var isShown = grid.style.display === 'grid';
      grid.style.display = isShown ? 'none' : 'grid';
      arrow.classList.toggle('open');
    }

    // ═══════════════════════════════════════════════
    // ─── Activity Report Functions ───
    // ═══════════════════════════════════════════════
    var activityDates = [];
    var activityReport = null;

    function getActivityConfig(prefix) {
      var p = prefix || 'act';
      var rawId = document.getElementById(p + 'SpreadsheetId').value.trim();
      var cleanId = extractSpreadsheetId(rawId);
      if (cleanId !== rawId) {
        document.getElementById(p + 'SpreadsheetId').value = cleanId;
      }
      return {
        spreadsheetId: cleanId,
        activitySheetName: document.getElementById(p + 'SheetName').value.trim(),
        gradesSheetName: document.getElementById(p + 'GradesSheet').value.trim(),
        gradesNameCol: document.getElementById(p + 'GradesNameCol').value.trim().toUpperCase() || 'B',
        gradesGradeCol: document.getElementById(p + 'GradesGradeCol').value.trim().toUpperCase() || 'E',
        gradesStartRow: document.getElementById(p + 'GradesStartRow').value.trim() || '4'
      };
    }

    function loadActivityDates(prefix) {
      var p = prefix || 'act';
      var config = getActivityConfig(p);
      if (!config.spreadsheetId) {
        showStatus(p + 'ConfigStatus', 'error', '⚠️ Please enter a Spreadsheet ID.');
        return;
      }
      if (!config.activitySheetName) {
        showStatus(p + 'ConfigStatus', 'error', '⚠️ Please enter the Activity Sheet Tab name.');
        return;
      }

      var btnId = p === 'act' ? 'loadDatesBtn' : p + 'LoadDatesBtn';
      var btn = document.getElementById(btnId);
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Loading dates...';
      hideStatus(p + 'ConfigStatus');

      google.script.run
        .withSuccessHandler(function (result) {
          btn.disabled = false;
          btn.innerHTML = '📅 Load Available Dates';

          if (result.error) {
            showStatus(p + 'ConfigStatus', 'error', '❌ ' + result.error);
            return;
          }

          activityDates = result.dates;
          showStatus(p + 'ConfigStatus', 'success',
            '✅ Found <strong>' + result.total + '</strong> dates in the sheet.');

          // Populate date dropdowns
          var startSel = document.getElementById(p + 'StartDate');
          var endSel = document.getElementById(p + 'EndDate');
          startSel.innerHTML = '';
          endSel.innerHTML = '';

          result.dates.forEach(function (d) {
            var opt1 = document.createElement('option');
            opt1.value = d.isoDate;
            opt1.textContent = d.dateStr + ' (' + d.dayOfWeek + ')';
            startSel.appendChild(opt1);

            var opt2 = document.createElement('option');
            opt2.value = d.isoDate;
            opt2.textContent = d.dateStr + ' (' + d.dayOfWeek + ')';
            endSel.appendChild(opt2);
          });

          // Default: select last 5 dates
          if (result.dates.length > 5) {
            startSel.selectedIndex = result.dates.length - 5;
          }
          endSel.selectedIndex = result.dates.length - 1;

          // Populate Fellow Filter dropdown (preserve current selection)
          var fellowSel = document.getElementById(p + 'FellowFilter');
          var previousFellow = fellowSel.value; // save current selection

          if (result.hasFellowColumn === false) {
            fellowSel.innerHTML = '<option value="">No Fellow Column identified</option>';
            fellowSel.disabled = true;
            document.getElementById(p + 'FellowHint').textContent = 'No Fellow column detected in the spreadsheet.';
          } else {
            fellowSel.innerHTML = '<option value="">All Fellows</option>';
            fellowSel.disabled = false;
            document.getElementById(p + 'FellowHint').textContent = 'Generate report for all or one fellow';
            if (result.fellows && result.fellows.length > 0) {
              result.fellows.forEach(function (f) {
                var opt = document.createElement('option');
                opt.value = f;
                opt.textContent = f;
                fellowSel.appendChild(opt);
              });
              // Restore the previous selection if it still exists
              if (previousFellow) fellowSel.value = previousFellow;
            }
          }

          document.getElementById(p + 'DateSection').className = 'section-visible';
          document.getElementById(p + 'DateSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
        })
        .withFailureHandler(function (err) {
          btn.disabled = false;
          btn.innerHTML = '📅 Load Available Dates';
          showStatus(p + 'ConfigStatus', 'error', '❌ Error: ' + err.message);
        })
        .getActivityDates(config);
    }

    // ─── Modal Helpers ───
    function showModal(opts) {
      document.getElementById('modalIcon').textContent = opts.icon || '';
      document.getElementById('modalTitle').textContent = opts.title || '';
      document.getElementById('modalBody').innerHTML = opts.body || '';

      var btnsDiv = document.getElementById('modalBtns');
      btnsDiv.innerHTML = '';
      (opts.buttons || []).forEach(function (b) {
        var btn = document.createElement('button');
        btn.className = 'btn ' + (b.cls || 'btn-secondary');
        btn.textContent = b.label;
        btn.onclick = function () { closeModal(); if (b.action) b.action(); };
        btnsDiv.appendChild(btn);
      });

      document.getElementById('modalOverlay').classList.add('show');
    }

    function closeModal() {
      document.getElementById('modalOverlay').classList.remove('show');
    }

    function closeModalOnBackdrop(e) {
      if (e.target === document.getElementById('modalOverlay')) closeModal();
    }

    // ─── Generate Activity Report (with confirmation) ───
    function generateActivityReport() {
      try {
        var config = getActivityConfig();
        var startSel = document.getElementById('actStartDate');
        var endSel = document.getElementById('actEndDate');
        var startDate = startSel ? startSel.value : '';
        var endDate = endSel ? endSel.value : '';

        if (!startDate || !endDate) {
          showStatus('actDateStatus', 'error', '⚠️ Please select start and end dates.');
          return;
        }

        var sheetName = config.activitySheetName || '—';
        var gradesSheet = config.gradesSheetName || 'None';
        var startText = (startSel && startSel.selectedIndex >= 0) ? startSel.options[startSel.selectedIndex].text : startDate;
        var endText = (endSel && endSel.selectedIndex >= 0) ? endSel.options[endSel.selectedIndex].text : endDate;

        // Show confirmation modal
        var fellowFilter = document.getElementById('actFellowFilter');
        var fellowDisplay = (fellowFilter && fellowFilter.disabled)
          ? '<span style="color:var(--text-muted);">No Fellow Column identified</span>'
          : (fellowFilter && fellowFilter.value) ? fellowFilter.value : 'All Fellows';

        showModal({
          icon: '📊',
          title: 'Confirm Report Settings',
          body: '<div class="modal-details">' +
            '<div class="detail-row"><span class="detail-label">Activity Sheet</span><span class="detail-value">' + sheetName + '</span></div>' +
            '<div class="detail-row"><span class="detail-label">Fellow</span><span class="detail-value">' + fellowDisplay + '</span></div>' +
            '<div class="detail-row"><span class="detail-label">Start Date</span><span class="detail-value">' + startText + '</span></div>' +
            '<div class="detail-row"><span class="detail-label">End Date</span><span class="detail-value">' + endText + '</span></div>' +
            '<div class="detail-row"><span class="detail-label">Grades Sheet</span><span class="detail-value">' + gradesSheet + '</span></div>' +
            '</div>' +
            'Does this look correct?',
          buttons: [
            { label: 'Cancel', cls: 'btn-secondary' },
            { label: 'Generate Report', cls: 'btn-success', action: function () { doGenerateActivityReport(config, startDate, endDate); } }
          ]
        });
      } catch (e) {
        alert('Error in generateActivityReport: ' + e.message);
      }
    }

    function doGenerateActivityReport(config, startDate, endDate) {
      var btn = document.getElementById('genReportBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Generating...';
      hideStatus('actDateStatus');

      google.script.run
        .withSuccessHandler(function (result) {
          btn.disabled = false;
          btn.innerHTML = '📊 Generate Report';

          if (result.error) {
            showStatus('actDateStatus', 'error', '❌ ' + result.error);
            return;
          }

          // Preserve the fellow filter selection — do NOT rebuild the dropdown
          var fellowSel = document.getElementById('actFellowFilter');
          var currentFellow = fellowSel.value;

          // Apply fellow filter client-side
          var selectedFellow = document.getElementById('actFellowFilter').value;
          var filteredStudents = result.students;
          if (selectedFellow) {
            filteredStudents = result.students.filter(function (s) {
              return s.fellow === selectedFellow;
            });
          }

          // Check for no students after filtering
          if (filteredStudents.length === 0) {
            var noStudentMsg = selectedFellow
              ? 'No students found for fellow <strong>"' + selectedFellow + '"</strong> in sheet <strong>"' + config.activitySheetName + '"</strong>.'
              : 'The selected sheet <strong>"' + config.activitySheetName + '"</strong> returned <strong>0 students</strong>.';
            showModal({
              icon: '⚠️',
              title: 'No Students Found',
              body: noStudentMsg + '<br><br>This usually means the wrong sheet tab is selected, or the data format doesn\'t match the expected layout.',
              buttons: [
                { label: 'OK', cls: 'btn-primary' }
              ]
            });
            showStatus('actDateStatus', 'error', '⚠️ No students found. Please check your sheet tab and fellow filter selection.');
            return;
          }

          // Build a filtered copy of the result for rendering
          var filteredResult = {
            students: filteredStudents,
            dateRange: result.dateRange,
            dateCount: result.dateCount,
            studentCount: filteredStudents.length,
            dateHeaders: result.dateHeaders,
            gradeLookupMsg: result.gradeLookupMsg
          };

          activityReport = filteredResult;

          var fellowLabel = selectedFellow ? ' · Fellow: ' + selectedFellow : '';
          showStatus('actDateStatus', 'success',
            '✅ Report ready! <strong>' + filteredResult.studentCount + '</strong> students × <strong>' +
            filteredResult.dateCount + '</strong> days' + fellowLabel +
            (result.gradeLookupMsg ? ' · ' + result.gradeLookupMsg : ''));

          // Update title
          document.getElementById('actReportTitle').textContent =
            'Activity Report · ' + result.dateRange.start + ' to ' + result.dateRange.end +
            (selectedFellow ? ' · ' + selectedFellow : '');

          // Render report
          renderActivityReport(filteredResult);

          document.getElementById('actReportSection').className = 'section-visible';
          document.getElementById('actReportSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
        })
        .withFailureHandler(function (err) {
          btn.disabled = false;
          btn.innerHTML = '📊 Generate Report';
          showStatus('actDateStatus', 'error', '❌ Error: ' + err.message);
        })
        .getActivityReport(config, startDate, endDate);
    }

    function attendanceClass(att) {
      var a = att.toLowerCase();
      if (a === 'present') return 'att-present';
      if (a === 'tardy') return 'att-tardy';
      if (a === 'absent') return 'att-absent';
      if (a.indexOf('not s') > -1 || a.indexOf('not scheduled') > -1) return 'att-ns';
      return '';
    }

    function gradeClass(g) {
      if (!g) return '';
      var gl = g.toLowerCase();
      if (gl === 'a') return 'grade-a';
      if (gl === 'b') return 'grade-b';
      if (gl === 'c') return 'grade-c';
      if (gl === 'd') return 'grade-d';
      if (gl === 'f') return 'grade-f';
      return '';
    }

    // ─── Client-side Student Comment Generator (same templates as Code.gs) ───
    function spellNumberClient(n) {
      var words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
      return n <= 10 ? words[n] : String(n);
    }

    function generateStudentCommentClient(name, grade, tardies, absences) {
      var firstName = name.indexOf(',') > -1
        ? (name.split(',')[1] || '').trim()
        : name.split(',')[0].trim();
      if (!firstName) firstName = name;

      if (!grade && absences >= 5) {
        return firstName + '- you have ' + spellNumberClient(absences) + ' absences this biweekly period which is making it very difficult to keep up with the lessons. Please make sure to attend every class so we can help you succeed. Check in with me to find out what assignments you have missed.';
      }

      if (grade === 'A' || grade === 'B') {
        var msg = firstName + '- you are doing ' + (grade === 'A' ? 'an excellent' : 'a solid') + ' job in the class with ' + (grade === 'A' ? 'an' : 'a') + ' ' + grade + '.';
        if (tardies === 0 && absences === 0) {
          msg += ' You have perfect attendance with zero tardies and zero absences. Your dedication and hard work are truly impressive. Keep it up!';
        } else if (tardies > 0 && absences === 0) {
          msg += ' You have ' + spellNumberClient(tardies) + ' ' + (tardies === 1 ? 'tardy' : 'tardies') + ' this period - please try to arrive on time so you can start class strong. Keep up the great work!';
        } else if (tardies === 0 && absences > 0) {
          msg += ' You have zero tardies and ' + (absences === 1 ? 'only one absence' : spellNumberClient(absences) + ' absences') + ' this period which shows great dedication. Keep up the outstanding work and maintain this consistency.';
        } else {
          msg += ' Watch out for those ' + spellNumberClient(tardies) + ' tardies and ' + spellNumberClient(absences) + ' ' + (absences === 1 ? 'absence' : 'absences') + ' - arriving on time will help you stay at the top. Keep pushing!';
        }
        return msg;
      }

      if (grade === 'C' || grade === 'D') {
        var msg = firstName + '- you currently have a ' + grade + ' in the class.';
        if (tardies > 3) {
          msg += ' You have ' + spellNumberClient(tardies) + ' tardies this period which is affecting your ability to start class strong. Please focus on arriving on time and putting in consistent effort so you can raise your grade.';
        } else if (absences > 0) {
          msg += ' You have ' + (tardies === 0 ? 'zero tardies' : spellNumberClient(tardies) + (tardies === 1 ? ' tardy' : ' tardies')) + ' and ' + (absences === 1 ? 'only one absence' : spellNumberClient(absences) + ' absences') + ' this period. Please keep working hard on your participation to bring your grade up. You have the ability to do great things!';
        } else {
          msg += ' Your attendance is solid with zero tardies and zero absences. Please continue your hard work to improve your grade - you are capable of more!';
        }
        return msg;
      }

      if (grade === 'F') {
        var msg = firstName + '- I need to see more from you - your grade is an F right now.';
        if (tardies > 0 || absences > 0) {
          var parts = [];
          if (tardies > 0) parts.push(spellNumberClient(tardies) + ' ' + (tardies === 1 ? 'tardy' : 'tardies'));
          if (absences > 0) parts.push(spellNumberClient(absences) + ' ' + (absences === 1 ? 'absence' : 'absences'));
          msg += ' You have been ' + parts.join(' and ') + ' this period which makes it difficult to stay caught up. Please see me during office hours so we can make a plan for your success.';
        } else {
          msg += ' Your attendance is fine but I need to see more effort and engagement. Lets set a goal together to bring this grade up.';
        }
        return msg;
      }

      // Fallback: no grade
      if (absences >= 3) {
        return firstName + '- you have ' + spellNumberClient(absences) + ' absences this biweekly period which is making it very difficult to keep up with the lessons. Please make sure to attend every class so we can help you succeed. Check in with me to find out what assignments you have missed.';
      }
      return firstName + '- please check in with me about your current standing in the class. I want to make sure you are on track and have what you need to succeed.';
    }

    function renderActivityReport(report) {
      var body = document.getElementById('actReportBody');
      body.innerHTML = '';

      report.students.forEach(function (student) {
        var card = document.createElement('div');
        card.className = 'student-report-card';

        // Header
        var gradeHtml = '';
        if (student.letterGrade) {
          gradeHtml = '<span class="grade-pill ' + gradeClass(student.letterGrade) + '">' + student.letterGrade + '</span>';
        }

        // Generate the student comment
        var comment = generateStudentCommentClient(
          student.name,
          student.letterGrade || '',
          student.summary.totalTardy,
          student.summary.totalAbsent
        );

        var fellowHtml = student.fellow ? '<span>' + student.fellow + '</span>' : '';
        card.innerHTML =
          '<div class="src-header">' +
          '<span class="src-name">' + student.name + '</span>' +
          '<div class="src-meta">' +
          '<span>Period ' + student.period + '</span>' +
          fellowHtml +
          gradeHtml +
          '</div>' +
          '</div>';

        // Two-column body: Table + Comment
        var table = '<table class="src-table"><thead><tr>' +
          '<th>Date</th><th>Attendance</th><th>Exit Ticket</th><th>ET %</th><th>GRADES</th><th>Part. %</th>' +
          '</tr></thead><tbody>';

        student.dates.forEach(function (d) {
          var isAbsent = d.attendance.toLowerCase() === 'absent';

          var etHtml = (d.exitTicket !== '' && d.exitTicket != null && !isAbsent)
            ? '<span class="et-score">' + d.exitTicket + '</span>'
            : '<span style="color:var(--text-muted);">—</span>';

          var etPctHtml = (d.exitTicketPct != null && !isAbsent)
            ? '<strong>' + d.exitTicketPct + '%</strong>'
            : '<span style="color:var(--text-muted);">—</span>';

          var gradesHtml = (d.gradesStr !== '—' && !isAbsent)
            ? '<span class="grades-str">' + d.gradesStr + '</span>'
            : '<span style="color:var(--text-muted);">—</span>';

          var partHtml = (d.participationPct != null && !isAbsent)
            ? '<strong>' + d.participationPct + '%</strong>'
            : '<span style="color:var(--text-muted);">—</span>';

          table += '<tr>' +
            '<td>' + d.date + '</td>' +
            '<td><span class="' + attendanceClass(d.attendance) + '">' + d.attendance + '</span></td>' +
            '<td>' + etHtml + '</td>' +
            '<td>' + etPctHtml + '</td>' +
            '<td>' + gradesHtml + '</td>' +
            '<td>' + partHtml + '</td>' +
            '</tr>';
        });

        table += '</tbody></table>';

        // Build two-column layout
        var bodyHtml = '<div class="src-body">' +
          '<div class="src-data-col">' + table + '</div>' +
          '<div class="src-comment-col">' +
          '<div class="src-comment-label">💬 Comment</div>' +
          '<textarea class="src-comment-textarea" data-student-index="' + report.students.indexOf(student) + '">' + comment + '</textarea>' +
          '</div>' +
          '</div>';

        card.innerHTML += bodyHtml;

        // Summary bar
        var s = student.summary;
        card.innerHTML +=
          '<div class="src-summary">' +
          '<span>Present: <strong>' + s.totalPresent + '</strong></span>' +
          '<span>Tardy: <strong style="color:#d97706;">' + s.totalTardy + '</strong></span>' +
          '<span>Absent: <strong style="color:#dc2626;">' + s.totalAbsent + '</strong></span>' +
          '<span>Not Scheduled: <strong>' + s.totalNotScheduled + '</strong></span>' +
          '<span>Days: <strong>' + s.totalDays + '</strong></span>' +
          '</div>';

        body.appendChild(card);
      });
    }

    function printActivityReport() {
      if (!activityReport) {
        alert('No report to print. Generate a report first.');
        return;
      }
      var w = window.open('', '_blank');
      if (!w) { alert('Pop-up blocked! Allow pop-ups and try again.'); return; }

      var r = activityReport;
      var css = '\
        @page { margin: 0.4in; size: letter; }\
        @media print { .report-card { page-break-after: always; } .report-card:last-child { page-break-after: auto; } .no-print { display: none !important; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }\
        * { margin: 0; padding: 0; box-sizing: border-box; }\
        body { font-family: Arial, Helvetica, sans-serif; color: #222; background: #f5f5f5; }\
        .no-print { background: #2c3e50; color: #fff; padding: 14px 24px; text-align: center; position: sticky; top: 0; z-index: 10; }\
        .no-print button { background: #6bb8c9; color: #fff; border: none; padding: 10px 28px; border-radius: 6px; font-size: 15px; font-weight: bold; cursor: pointer; margin: 0 8px; }\
        .no-print button:hover { background: #5ca8b8; }\
        .report-card { width: 7.5in; margin: 20px auto; background: #fff; border: 2px solid #333; }\
        .report-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 16px 20px 8px; }\
        .report-title { font-size: 18px; font-weight: bold; }\
        .report-logo { text-align: right; }\
        .logo-main { font-size: 26px; font-weight: bold; color: #6bb8c9; }\
        .logo-sub { font-size: 12px; color: #6bb8c9; letter-spacing: 1px; }\
        .report-info { padding: 8px 20px 12px; font-size: 14px; }\
        .report-info .row { display: flex; gap: 32px; margin-bottom: 6px; }\
        .field-line { border-bottom: 1px solid #333; display: inline-block; min-width: 180px; font-weight: bold; padding: 0 4px; }\
        .field-short { min-width: 80px; }\
        .data-table { width: 100%; border-collapse: collapse; }\
        .data-table th { background: #f0f2f5; border: 1px solid #333; padding: 7px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #555; }\
        .data-table td { border: 1px solid #333; padding: 7px 10px; font-size: 12px; vertical-align: middle; }\
        .att-p { color: #059669; font-weight: 600; }\
        .att-t { color: #d97706; font-weight: 600; }\
        .att-a { color: #dc2626; font-weight: 600; }\
        .att-ns { color: #999; font-style: italic; }\
        .grade-pill { display: inline-block; padding: 1px 8px; border-radius: 4px; font-weight: 700; font-size: 11px; }\
        .grade-a { background: #d1fae5; color: #059669; }\
        .grade-b { background: #dbeafe; color: #2563eb; }\
        .grade-c { background: #fef3c7; color: #d97706; }\
        .grade-d { background: #fed7aa; color: #ea580c; }\
        .grade-f { background: #fee2e2; color: #dc2626; }\
        .grades-mono { font-family: "Courier New", monospace; font-size: 12px; letter-spacing: 2px; font-weight: bold; }\
        .report-footer { padding: 10px 20px; font-size: 12px; display: flex; justify-content: space-between; border-top: 1px solid #999; flex-wrap: wrap; gap: 8px; }\
        .footer-item { display: inline-flex; gap: 4px; }\
        .footer-item strong { color: #222; }\
      ';

      var html = '<!DOCTYPE html><html><head><meta charset="utf-8">';
      html += '<title>Blueprint Activity Report</title>';
      html += '<style>' + css + '</style></head><body>';
      html += '<div class="no-print"><strong>Blueprint Activity Reports</strong> \u2014 ' +
        r.dateRange.start + ' to ' + r.dateRange.end + ' \u00b7 ' + r.studentCount + ' students &nbsp;';
      html += '<button onclick="window.print()">\ud83d\udda8\ufe0f Print / Save as PDF</button></div>';

      r.students.forEach(function (student) {
        var gc = gradeClass(student.letterGrade);
        var gp = student.letterGrade ? '<span class="grade-pill ' + gc + '">' + student.letterGrade + '</span>' : '';

        html += '<div class="report-card">';

        // Header
        html += '<div class="report-header">';
        html += '<div class="report-title">Blueprint Activity Report</div>';
        html += '<div class="report-logo"><img src="https://blueprintschools.org/wp-content/uploads/2017/09/Blueprint-Horizontal-Logo-Large-768x244.png" alt="Blueprint Schools Network" style="height: 48px; width: auto; display: block;"></div>';

        html += '</div>';

        // Student Info
        html += '<div class="report-info">';
        var fellowField = student.fellow ? 'Fellow: <span class="field-line">' + student.fellow + '</span> &nbsp;&nbsp; ' : '';
        html += '<div class="row">Student Name: <span class="field-line">' + student.name + '</span> &nbsp;&nbsp; Period <span class="field-line field-short">' + student.period + '</span></div>';
        html += '<div class="row">' + fellowField + 'Current Grade <span class="field-line field-short">' + gp + '</span></div>';
        html += '<div class="row">Date Range: <span class="field-line">' + r.dateRange.start + ' \u2013 ' + r.dateRange.end + '</span></div>';
        html += '</div>';

        // Right: Comment — read from the (possibly edited) textarea on screen
        var commentTextarea = document.querySelector('.src-comment-textarea[data-student-index="' + r.students.indexOf(student) + '"]');
        var comment = commentTextarea ? commentTextarea.value : generateStudentCommentClient(
          student.name,
          student.letterGrade || '',
          student.summary.totalTardy,
          student.summary.totalAbsent
        );

        // Two-column: Data Table + Comment
        html += '<div style="display:flex;">';

        // Left: Data Table
        html += '<div style="flex:1;min-width:0;">';
        html += '<table class="data-table"><thead><tr>';
        html += '<th>Date</th><th>Attendance</th><th>Exit Ticket</th><th>ET %</th><th>GRADES</th><th>Part. %</th>';
        html += '</tr></thead><tbody>';

        student.dates.forEach(function (d) {
          var ac = d.attendance.toLowerCase();
          var isAbsent = ac === 'absent';
          var acls = ac === 'present' ? 'att-p' : ac === 'tardy' ? 'att-t' : isAbsent ? 'att-a' : 'att-ns';
          var et = (d.exitTicket !== '' && d.exitTicket != null && !isAbsent) ? '<strong>' + d.exitTicket + '</strong>' : '\u2014';
          var etPct = (d.exitTicketPct != null && !isAbsent) ? d.exitTicketPct + '%' : '\u2014';
          var gs = (d.gradesStr != null && d.gradesStr !== '\u2014' && d.gradesStr !== '' && !isAbsent) ? '<span class="grades-mono">' + d.gradesStr + '</span>' : '\u2014';
          var pp = (d.participationPct != null && !isAbsent) ? d.participationPct + '%' : '\u2014';

          html += '<tr>';
          html += '<td>' + d.date + '</td>';
          html += '<td class="' + acls + '">' + d.attendance + '</td>';
          html += '<td style="text-align:center;">' + et + '</td>';
          html += '<td style="text-align:center;">' + etPct + '</td>';
          html += '<td>' + gs + '</td>';
          html += '<td style="text-align:center;">' + pp + '</td>';
          html += '</tr>';
        });

        html += '</tbody></table>';
        html += '</div>'; // close left col

        // Right: Comment
        html += '<div style="width:220px;min-width:200px;border-left:2px solid #333;padding:12px 14px;background:#f8f9fa;font-size:12px;">';
        html += '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#666;font-weight:bold;margin-bottom:8px;">Comment to student</div>';
        html += '<div style="line-height:1.6;color:#333;">' + comment + '</div>';
        html += '</div>'; // close right col

        html += '</div>'; // close flex row

        // Footer summary
        var s = student.summary;
        html += '<div class="report-footer">';
        html += '<span class="footer-item">Present: <strong>' + s.totalPresent + '</strong></span>';
        html += '<span class="footer-item">Tardy: <strong style="color:#d97706">' + s.totalTardy + '</strong></span>';
        html += '<span class="footer-item">Absent: <strong style="color:#dc2626">' + s.totalAbsent + '</strong></span>';
        html += '<span class="footer-item">Not Sched.: <strong>' + s.totalNotScheduled + '</strong></span>';
        html += '<span class="footer-item">Days: <strong>' + s.totalDays + '</strong></span>';
        html += '</div>';

        html += '</div>'; // close report-card
      });

      html += '</body></html>';
      w.document.write(html);
      w.document.close();
    }
    // ─── Email Modal & Sending ───
    var autoDetectedEmailConfig = null;

    function openEmailModal() {
      if (!activityReport || !activityReport.students || activityReport.students.length === 0) {
        alert('Please generate the activity report first.');
        return;
      }

      var ssId = document.getElementById('actSpreadsheetId').value;
      if (!ssId) {
        alert('Missing Spreadsheet ID');
        return;
      }

      // Initial loading modal
      showModal({
        icon: '✉️',
        title: 'Send Emails to Parents',
        body: '<div style="text-align:center; padding: 20px;"><span class="spinner"></span> Auto-detecting email sheet...</div>',
        buttons: [
          { label: 'Cancel', cls: 'btn-secondary' }
        ]
      });

      google.script.run
        .withSuccessHandler(function (result) {
          if (result.error) {
            alert('Warning: Could not auto-detect email sheet (' + result.error + '). Please make sure an email sheet exists.');
            closeModal();
            return;
          }
          autoDetectedEmailConfig = result;
          
          var bodyHtml = '<div class="modal-details">' +
            '<div class="detail-row"><span class="detail-label">Email Sheet</span><span class="detail-value">✅ Auto-detected: "' + result.sheetName + '"</span></div>' +
            '<div class="detail-row"><span class="detail-label">Recipients</span><span class="detail-value">' + activityReport.students.length + ' students</span></div>' +
            '</div>' +
            '<div class="form-group" style="margin-top:16px;">' +
            '<label>Teacher Name</label>' +
            '<input type="text" id="modalTeacherName" placeholder="e.g. Mr. Johnson" value="' + teacherEmail + '">' +
            '</div>' +
            '<div class="form-group" style="margin-top:12px;">' +
            '<label>Email Subject</label>' +
            '<input type="text" id="modalEmailSubject" value="Biweekly Progress Report — {student}">' +
            '</div>' +
            '<div class="form-group" style="margin-top:12px;">' +
            '<label>Additional Message (optional)</label>' +
            '<textarea id="modalCustomMessage" placeholder="Added after the comment..." style="min-height:60px;"></textarea>' +
            '</div>';

          showModal({
            icon: '✉️',
            title: 'Send Emails to Parents',
            body: bodyHtml,
            buttons: [
              { label: 'Cancel', cls: 'btn-secondary' },
              { label: 'Confirm & Send Emails', cls: 'btn-purple', action: sendActivityEmailsClient }
            ]
          });
        })
        .withFailureHandler(function (err) {
          alert('Error auto-detecting emails: ' + err.message);
          closeModal();
        })
        .autoDetectEmailConfig(ssId);
    }

    function sendActivityEmailsClient() {
      var teacherName = document.getElementById('modalTeacherName').value.trim();
      var subject = document.getElementById('modalEmailSubject').value.trim();
      var customMessage = document.getElementById('modalCustomMessage').value.trim();

      if (!subject) {
        alert('Please enter an email subject.');
        return;
      }

      // Build payload by generating comments for everyone
      var payload = [];
      activityReport.students.forEach(function (r) {
        var pComment = generateStudentCommentClient(r.name, r.letterGrade || '', r.summary.totalTardy, r.summary.totalAbsent, 'parent');
        var sComment = generateStudentCommentClient(r.name, r.letterGrade || '', r.summary.totalTardy, r.summary.totalAbsent, 'student');
        
        payload.push({
          name: r.name,
          grade: r.letterGrade || '',
          tardies: r.summary.totalTardy || 0,
          absences: r.summary.totalAbsent || 0,
          parentComment: pComment,
          studentComment: sComment
        });
      });

      var ssId = document.getElementById('actSpreadsheetId').value;
      
      showModal({
        icon: '✉️',
        title: 'Sending Emails',
        body: '<div style="text-align:center; padding: 20px;"><span class="spinner"></span> Dispatching ' + payload.length + ' emails...</div>',
        buttons: [] // No buttons while sending
      });

      google.script.run
        .withSuccessHandler(function (res) {
          if (res.error) {
            showModal({
              icon: '❌',
              title: 'Error Sending Emails',
              body: '<p style="color:var(--danger)">' + res.error + '</p>',
              buttons: [{ label: 'Close', cls: 'btn-secondary' }]
            });
            return;
          }
          
          var msg = '<p><strong>' + res.sent + '</strong> emails sent successfully!</p>';
          if (res.failed > 0) {
            msg += '<p style="color:var(--danger)">' + res.failed + ' failed (missing addresses).</p>';
          }
          msg += '<p style="font-size:12px;color:var(--text-muted);margin-top:12px;">Remaining daily quota: ' + res.remainingQuota + '</p>';
          
          showModal({
            icon: '✅',
            title: 'Emails Sent',
            body: msg,
            buttons: [{ label: 'Done', cls: 'btn-primary' }]
          });
        })
        .withFailureHandler(function (err) {
          showModal({
            icon: '❌',
            title: 'Error Sending Emails',
            body: '<p style="color:var(--danger)">' + err.message + '</p>',
            buttons: [{ label: 'Close', cls: 'btn-secondary' }]
          });
        })
        .sendActivityEmails(ssId, autoDetectedEmailConfig, payload, teacherName, subject, customMessage);
    }

#!/usr/bin/env node
/**
 * generate-comments.js — Automated Student Comment Generator
 *
 * Reads student data from Google Sheets, generates personalized comments,
 * and writes them back to the spreadsheet.
 *
 * Usage:
 *   node generate-comments.js                  # Full run: read, generate, write
 *   node generate-comments.js --read-only      # Read and display data only
 *   node generate-comments.js --test           # Test API connectivity
 *   node generate-comments.js --rows 11-15     # Process specific rows only
 *   node generate-comments.js --dry-run        # Generate comments but don't write
 */

import { readRange, batchRead, batchWrite, SHEET_NAME } from './sheets-api.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Load .env ───
function loadEnv() {
  const vars = {};
  try {
    const content = readFileSync(resolve(__dirname, '.env'), 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      vars[key] = value;
    }
  } catch { /* .env not found */ }
  return vars;
}

const env = loadEnv();
const getEnv = (key, fallback) => process.env[key] || env[key] || fallback;

// ─── Column Helpers ───
function colToIndex(col) {
  col = col.toUpperCase();
  let idx = 0;
  for (let i = 0; i < col.length; i++) {
    idx = idx * 26 + (col.charCodeAt(i) - 64);
  }
  return idx - 1; // 0-based
}

function indexToCol(idx) {
  let col = '';
  idx++;
  while (idx > 0) {
    idx--;
    col = String.fromCharCode(65 + (idx % 26)) + col;
    idx = Math.floor(idx / 26);
  }
  return col;
}

// ─── Configuration (loaded from .env with defaults) ───
const HEADER_ROW = parseInt(getEnv('HEADER_ROW', '3'), 10);
const DATA_START_ROW = parseInt(getEnv('DATA_START_ROW', '4'), 10);
const STUDENT_NAME_COL = getEnv('STUDENT_NAME_COL', 'B');
const STUDENT_COMMENT_COL = getEnv('STUDENT_COMMENT_COL', 'C');
const PARENT_COMMENT_COL = getEnv('PARENT_COMMENT_COL', 'D');
const GRADE_COL = getEnv('GRADE_COL', 'E');
const TARDIES_COL = getEnv('TARDIES_COL', 'AJ');
const ABSENCES_COL = getEnv('ABSENCES_COL', 'AK');

// Compute 0-based indexes for array access
const NAME_IDX = colToIndex(STUDENT_NAME_COL);
const COMMENT_IDX = colToIndex(STUDENT_COMMENT_COL);
const PARENT_IDX = colToIndex(PARENT_COMMENT_COL);
const GRADE_IDX = colToIndex(GRADE_COL);
const TARDIES_IDX = colToIndex(TARDIES_COL);
const ABSENCES_IDX = colToIndex(ABSENCES_COL);

// Determine the rightmost column to read
const LAST_COL = indexToCol(Math.max(NAME_IDX, COMMENT_IDX, PARENT_IDX, GRADE_IDX, TARDIES_IDX, ABSENCES_IDX));

// ─── CLI Flags ───
const args = process.argv.slice(2);
const READ_ONLY = args.includes('--read-only');
const TEST_MODE = args.includes('--test');
const DRY_RUN = args.includes('--dry-run');
const rowsFlag = args.find(a => a.startsWith('--rows='));
const TARGET_ROWS = rowsFlag ? parseRows(rowsFlag.split('=')[1]) : null;

function parseRows(spec) {
  // Parse "11-15,32-35" or "11,12,13" format
  const rows = [];
  for (const part of spec.split(',')) {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      for (let i = start; i <= end; i++) rows.push(i);
    } else {
      rows.push(Number(part));
    }
  }
  return rows;
}

// ─── Comment Generation ───
function generateStudentComment(name, grade, tardies, absences) {
  const firstName = name.split(',')[1]?.trim() || name.split(',')[0]?.trim() || name;

  if (!grade && absences >= 5) {
    return `${firstName}- you have ${spellNumber(absences)} absences this biweekly period which is making it very difficult to keep up with the lessons. Please make sure to attend every class so we can help you succeed. Check in with me to find out what assignments you have missed.`;
  }

  if (grade === 'A' || grade === 'B') {
    let msg = `${firstName}- you are doing ${grade === 'A' ? 'an excellent' : 'a solid'} job in the class with ${grade === 'A' ? 'an' : 'a'} ${grade}.`;
    if (tardies === 0 && absences === 0) {
      msg += ` You have perfect attendance with zero tardies and zero absences. Your dedication and hard work are truly impressive. Keep it up!`;
    } else if (tardies > 0 && absences === 0) {
      msg += ` You have ${spellNumber(tardies)} ${tardies === 1 ? 'tardy' : 'tardies'} this period - please try to arrive on time so you can start class strong. Keep up the great work!`;
    } else if (tardies === 0 && absences > 0) {
      msg += ` You have zero tardies and ${absences === 1 ? 'only one absence' : spellNumber(absences) + ' absences'} this period which shows great dedication. Keep up the outstanding work and maintain this consistency.`;
    } else {
      msg += ` Watch out for those ${spellNumber(tardies)} tardies and ${spellNumber(absences)} ${absences === 1 ? 'absence' : 'absences'} - arriving on time will help you stay at the top. Keep pushing!`;
    }
    return msg;
  }

  if (grade === 'C' || grade === 'D') {
    let msg = `${firstName}- you currently have a ${grade} in the class.`;
    if (tardies > 3) {
      msg += ` You have ${spellNumber(tardies)} tardies this period which is affecting your ability to start class strong. Please focus on arriving on time and putting in consistent effort so you can raise your grade.`;
    } else if (absences > 0) {
      msg += ` You have ${tardies === 0 ? 'zero tardies' : spellNumber(tardies) + (tardies === 1 ? ' tardy' : ' tardies')} and ${absences === 1 ? 'only one absence' : spellNumber(absences) + ' absences'} this period${tardies === 0 ? ' which shows good commitment to attendance' : ''}. Please keep working hard on your assignments and participation to bring your grade up. You have the ability to do great things!`;
    } else {
      msg += ` Your attendance is solid with zero tardies and zero absences. Please continue your hard work to improve your grade - you are capable of more!`;
    }
    return msg;
  }

  if (grade === 'F') {
    let msg = `${firstName}- I need to see more from you - your grade is an F right now.`;
    if (tardies > 0 || absences > 0) {
      const parts = [];
      if (tardies > 0) parts.push(`${spellNumber(tardies)} ${tardies === 1 ? 'tardy' : 'tardies'}`);
      if (absences > 0) parts.push(`${spellNumber(absences)} ${absences === 1 ? 'absence' : 'absences'}`);
      msg += ` You have been ${parts.join(' and ')} this period which makes it difficult to stay caught up. Please see me during office hours so we can make a plan for your success.`;
    } else {
      msg += ` Your attendance is fine but I need to see more effort and engagement. Lets set a goal together to bring this grade up.`;
    }
    return msg;
  }

  // Fallback: no grade
  if (absences >= 3) {
    return `${firstName}- you have ${spellNumber(absences)} absences this biweekly period which is making it very difficult to keep up with the lessons. Please make sure to attend every class so we can help you succeed. Check in with me to find out what assignments you have missed.`;
  }
  return `${firstName}- please check in with me about your current standing in the class. I want to make sure you are on track and have what you need to succeed.`;
}

function generateParentComment(name, grade, tardies, absences) {
  const firstName = name.split(',')[1]?.trim() || name.split(',')[0]?.trim() || name;

  if (!grade && absences >= 5) {
    return `${firstName} has accumulated ${spellNumber(absences)} absences this period which is significantly impacting his/her ability to keep up with coursework. We are concerned about attendance and would like to work with you to ensure they are present in class. Please contact me so we can discuss a plan for academic success.`;
  }

  if (grade === 'A' || grade === 'B') {
    let msg = `${firstName} is performing ${grade === 'A' ? 'exceptionally well' : 'well'} with ${grade === 'A' ? 'an' : 'a'} ${grade} in the course.`;
    if (tardies === 0 && absences === 0) {
      msg += ` They have perfect attendance this period with no tardies or absences. Their commitment to education is exemplary and we are very proud of their consistent effort and performance.`;
    } else if (tardies > 0) {
      msg += ` They have ${spellNumber(tardies)} ${tardies === 1 ? 'tardy' : 'tardies'} and ${absences === 0 ? 'zero absences' : spellNumber(absences) + (absences === 1 ? ' absence' : ' absences')} this period. Improving punctuality would help make the most of class time. We appreciate your support in encouraging on-time arrival.`;
    } else {
      msg += ` They have zero tardies and ${absences === 1 ? 'only one absence' : spellNumber(absences) + ' absences'} this period. Their consistent work ethic and focus in class are commendable. We are very pleased with their academic progress.`;
    }
    return msg;
  }

  if (grade === 'C' || grade === 'D') {
    let msg = `${firstName} is maintaining a ${grade} grade in the course.`;
    if (tardies > 3) {
      msg += ` They have ${spellNumber(tardies)} tardies this period and ${absences === 0 ? 'zero absences' : spellNumber(absences) + (absences === 1 ? ' absence' : ' absences')}. Improving punctuality would help make the most of class time and improve academic standing. We appreciate your support in encouraging on-time arrival.`;
    } else if (absences > 0) {
      msg += ` They have ${tardies === 0 ? 'zero tardies' : spellNumber(tardies) + (tardies === 1 ? ' tardy' : ' tardies')} and ${absences === 1 ? 'only one absence' : spellNumber(absences) + ' absences'} this period${tardies === 0 ? ' showing consistent attendance' : ''}. We encourage continued focus on classwork and participation to further improve academic standing.`;
    } else {
      msg += ` Their attendance is solid with no tardies or absences. We hope to see continued consistency and work towards a higher grade.`;
    }
    return msg;
  }

  if (grade === 'F') {
    let msg = `${firstName} is struggling in the course with an F grade at this time.`;
    if (tardies > 0 || absences > 0) {
      const parts = [];
      if (tardies > 0) parts.push(`${spellNumber(tardies)} ${tardies === 1 ? 'tardy' : 'tardies'}`);
      if (absences > 0) parts.push(`${spellNumber(absences)} ${absences === 1 ? 'absence' : 'absences'}`);
      msg += ` They have accumulated ${parts.join(' and ')} this period which is impacting their ability to follow the curriculum consistently. We would like to work with you to ensure they have the support needed to improve their academic performance.`;
    } else {
      msg += ` Attendance is not the issue but engagement and effort need improvement. We would like to partner with you to discuss strategies for improvement.`;
    }
    return msg;
  }

  // Fallback
  if (absences >= 3) {
    return `${firstName} has accumulated ${spellNumber(absences)} absences this period which is significantly impacting their ability to keep up with coursework. We are concerned about attendance and would like to work with you to ensure they are present in class. Please contact me so we can discuss a plan for academic success.`;
  }
  return `${firstName} needs to check in with us regarding their current standing. We would appreciate your support in encouraging them to connect with the teacher.`;
}

// ─── Utility: number to word ───
function spellNumber(n) {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  return n <= 10 ? words[n] : String(n);
}

// ─── Main Pipeline ───
async function main() {
  console.log('\n🚀 Agentic Comment Generator — Google Sheets API Pipeline\n');

  // Step 0: Test API
  if (TEST_MODE) {
    console.log('🔌 Testing API connectivity...');
    try {
      const data = await readRange(`${SHEET_NAME}!A1:${LAST_COL}3`);
      console.log('✅ API connected! Headers:', data[0]?.slice(0, 5));
      console.log(`   Sheet: ${SHEET_NAME}, Spreadsheet: ${SHEET_NAME}`);
    } catch (err) {
      console.error('❌ API test failed:', err.message);
    }
    return;
  }

  // Step 1: Read ALL data in one batch
  console.log('📖 Step 1: Reading all student data...');
  const allData = await readRange(`${SHEET_NAME}!A${DATA_START_ROW}:${LAST_COL}100`);
  console.log(`   Found ${allData.length} rows of data.`);

  // Step 2: Parse students who need comments
  console.log('\n📊 Step 2: Identifying students who need comments...');
  const students = [];

  for (let i = 0; i < allData.length; i++) {
    const row = allData[i];
    const rowNum = DATA_START_ROW + i;
    const name = row[NAME_IDX] || '';
    const existingComment = row[COMMENT_IDX] || '';
    const existingParent = row[PARENT_IDX] || '';
    const grade = row[GRADE_IDX] || '';

    if (!name) continue;

    // If targeting specific rows, skip others
    if (TARGET_ROWS && !TARGET_ROWS.includes(rowNum)) continue;

    const tardies = parseInt(row[TARDIES_IDX]) || 0;
    const absences = parseInt(row[ABSENCES_IDX]) || 0;

    // Only generate if comment cells are empty (unless targeting specific rows)
    const needsComment = !existingComment || TARGET_ROWS?.includes(rowNum);
    const needsParent = !existingParent || TARGET_ROWS?.includes(rowNum);

    if (needsComment || needsParent) {
      students.push({
        rowNum, name, grade, tardies, absences,
        needsComment, needsParent,
        existingComment, existingParent,
      });
    }
  }

  console.log(`   ${students.length} student(s) need comments.\n`);

  if (students.length === 0) {
    console.log('✅ All students already have comments. Nothing to do.');
    return;
  }

  // Step 3: Generate comments
  console.log('💬 Step 3: Generating comments...\n');
  const writeData = [];

  for (const s of students) {
    const studentComment = generateStudentComment(s.name, s.grade, s.tardies, s.absences);
    const parentComment = generateParentComment(s.name, s.grade, s.tardies, s.absences);

    console.log(`   Row ${s.rowNum}: ${s.name}`);
    console.log(`     Grade: ${s.grade || '(blank)'} | Tardies: ${s.tardies} | Absences: ${s.absences}`);
    console.log(`     Student: "${studentComment.slice(0, 80)}..."`);
    console.log(`     Parent:  "${parentComment.slice(0, 80)}..."\n`);

    if (s.needsComment) {
      writeData.push({
        range: `${SHEET_NAME}!${STUDENT_COMMENT_COL}${s.rowNum}`,
        values: [[studentComment]],
      });
    }
    if (s.needsParent) {
      writeData.push({
        range: `${SHEET_NAME}!${PARENT_COMMENT_COL}${s.rowNum}`,
        values: [[parentComment]],
      });
    }
  }

  if (READ_ONLY) {
    console.log('📋 Read-only mode — no changes written.');
    return;
  }

  if (DRY_RUN) {
    console.log('🏜️  Dry run — comments generated but NOT written to sheet.');
    console.log(`   Would write ${writeData.length} cell updates.`);
    return;
  }

  // Step 4: Write all comments in one batch API call
  console.log(`\n✏️  Step 4: Writing ${writeData.length} cell updates in one batch...`);
  try {
    const result = await batchWrite(writeData);
    console.log(`✅ Done! Updated ${result.totalUpdatedCells || writeData.length} cells.`);
  } catch (err) {
    console.error(`❌ Write failed: ${err.message}`);
    console.error('   Note: Writing via API key requires the spreadsheet to be publicly editable.');
    console.error('   Alternative: Use browser automation mode or set up a Service Account.');
    return;
  }

  // Step 5: Verify
  console.log('\n🔍 Step 5: Verifying written comments...');
  let verified = 0;
  for (const s of students) {
    const check = await readRange(`${SHEET_NAME}!${STUDENT_COMMENT_COL}${s.rowNum}:${PARENT_COMMENT_COL}${s.rowNum}`);
    const [c, d] = check[0] || ['', ''];
    if (c && d) {
      verified++;
    } else {
      console.warn(`   ⚠️  Row ${s.rowNum} (${s.name}): Missing content — C=${c ? 'OK' : 'EMPTY'}, D=${d ? 'OK' : 'EMPTY'}`);
    }
  }
  console.log(`\n✅ Verification complete: ${verified}/${students.length} students confirmed.\n`);
}

main().catch(err => {
  console.error('💥 Fatal error:', err.message);
  process.exit(1);
});

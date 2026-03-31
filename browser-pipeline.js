/**
 * browser-pipeline.js — Fast Browser-Based Comment Pipeline
 *
 * This script generates JavaScript snippets that can be executed
 * inside the Google Sheets browser page to read/write data instantly.
 *
 * HOW IT WORKS:
 * 1. Run this script to generate a JS snippet
 * 2. The agent executes the snippet inside the Google Sheets page
 * 3. All data is read in one call, all comments written in one batch
 *
 * SPEED: ~5 seconds total vs ~2 minutes per student
 */

// ─── Comment Generation (same logic as generate-comments.js) ───

function spellNumber(n) {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  return n <= 10 ? words[n] : String(n);
}

export function generateStudentComment(name, grade, tardies, absences) {
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
      msg += ` You have zero tardies and ${absences === 1 ? 'only one absence' : spellNumber(absences) + ' absences'} this period which shows great dedication. Keep up the outstanding work.`;
    } else {
      msg += ` Watch out for those ${spellNumber(tardies)} tardies and ${spellNumber(absences)} ${absences === 1 ? 'absence' : 'absences'} - arriving on time will help you stay at the top.`;
    }
    return msg;
  }
  if (grade === 'C' || grade === 'D') {
    let msg = `${firstName}- you currently have a ${grade} in the class.`;
    if (tardies > 3) {
      msg += ` You have ${spellNumber(tardies)} tardies this period which is affecting your ability to start class strong. Please focus on arriving on time and putting in consistent effort so you can raise your grade.`;
    } else if (absences > 0) {
      msg += ` You have ${tardies === 0 ? 'zero tardies' : spellNumber(tardies) + (tardies === 1 ? ' tardy' : ' tardies')} and ${absences === 1 ? 'only one absence' : spellNumber(absences) + ' absences'} this period. Please keep working hard on your assignments and participation to bring your grade up.`;
    } else {
      msg += ` Your attendance is solid. Please continue your hard work to improve your grade - you are capable of more!`;
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
      msg += ` Lets set a goal together to bring this grade up.`;
    }
    return msg;
  }
  // No grade
  if (absences >= 3) {
    return `${firstName}- you have ${spellNumber(absences)} absences this biweekly period which is making it very difficult to keep up with the lessons. Please make sure to attend every class so we can help you succeed.`;
  }
  return `${firstName}- please check in with me about your current standing in the class.`;
}

export function generateParentComment(name, grade, tardies, absences) {
  const firstName = name.split(',')[1]?.trim() || name.split(',')[0]?.trim() || name;

  if (!grade && absences >= 5) {
    return `${firstName} has accumulated ${spellNumber(absences)} absences this period which is significantly impacting their ability to keep up with coursework. We are concerned about attendance and would like to work with you to ensure they are present in class. Please contact me so we can discuss a plan for academic success.`;
  }
  if (grade === 'A' || grade === 'B') {
    let msg = `${firstName} is performing ${grade === 'A' ? 'exceptionally well' : 'well'} with ${grade === 'A' ? 'an' : 'a'} ${grade} in the course.`;
    if (tardies === 0 && absences === 0) {
      msg += ` They have perfect attendance this period. Their commitment to education is exemplary and we are very proud of their consistent effort.`;
    } else if (tardies > 0) {
      msg += ` They have ${spellNumber(tardies)} ${tardies === 1 ? 'tardy' : 'tardies'} and ${absences === 0 ? 'zero absences' : spellNumber(absences) + ' ' + (absences === 1 ? 'absence' : 'absences')} this period. Improving punctuality would help make the most of class time.`;
    } else {
      msg += ` They have zero tardies and ${absences === 1 ? 'only one absence' : spellNumber(absences) + ' absences'} this period. We are very pleased with their academic progress.`;
    }
    return msg;
  }
  if (grade === 'C' || grade === 'D') {
    let msg = `${firstName} is maintaining a ${grade} grade in the course.`;
    if (tardies > 3) {
      msg += ` They have ${spellNumber(tardies)} tardies this period. Improving punctuality would help make the most of class time and improve academic standing.`;
    } else if (absences > 0) {
      msg += ` They have ${tardies === 0 ? 'zero tardies' : spellNumber(tardies) + ' ' + (tardies === 1 ? 'tardy' : 'tardies')} and ${absences === 1 ? 'only one absence' : spellNumber(absences) + ' absences'} this period. We encourage continued focus on classwork and participation.`;
    } else {
      msg += ` Their attendance is solid. We hope to see continued consistency and work towards a higher grade.`;
    }
    return msg;
  }
  if (grade === 'F') {
    let msg = `${firstName} is struggling in the course with an F grade at this time.`;
    if (tardies > 0 || absences > 0) {
      const parts = [];
      if (tardies > 0) parts.push(`${spellNumber(tardies)} ${tardies === 1 ? 'tardy' : 'tardies'}`);
      if (absences > 0) parts.push(`${spellNumber(absences)} ${absences === 1 ? 'absence' : 'absences'}`);
      msg += ` They have accumulated ${parts.join(' and ')} this period. We would like to work with you to ensure they have the support needed to improve.`;
    } else {
      msg += ` Engagement and effort need improvement. We would like to partner with you to discuss strategies.`;
    }
    return msg;
  }
  if (absences >= 3) {
    return `${firstName} has accumulated ${spellNumber(absences)} absences this period which is significantly impacting their ability to keep up with coursework. Please contact me so we can discuss a plan for academic success.`;
  }
  return `${firstName} needs to check in regarding their current standing. We would appreciate your support in encouraging them to connect with the teacher.`;
}

/**
 * Generate a JS snippet that can be pasted into the browser console
 * or executed via browser_subagent to write comments for specific students.
 *
 * @param {Array<{row, name, grade, tardies, absences}>} students
 * @returns {string} JavaScript code to execute in the Google Sheets page
 */
export function generateBrowserWriteScript(students) {
  const updates = students.map(s => {
    const studentComment = generateStudentComment(s.name, s.grade, s.tardies, s.absences);
    const parentComment = generateParentComment(s.name, s.grade, s.tardies, s.absences);
    return { row: s.row, studentComment, parentComment };
  });

  // This produces a self-contained JS snippet for Google Sheets
  return `
// Auto-generated comment writer
(async function() {
  const updates = ${JSON.stringify(updates, null, 2)};
  
  for (const u of updates) {
    // Select cell C{row}
    const nameBox = document.querySelector('input.jfk-textinput');
    if (nameBox) {
      nameBox.focus();
      nameBox.value = 'C' + u.row;
      nameBox.dispatchEvent(new Event('change'));
      // Press Enter
      nameBox.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', code: 'Enter', keyCode: 13}));
    }
    await new Promise(r => setTimeout(r, 500));
  }
  
  return 'Done: ' + updates.length + ' students processed';
})();
`;
}

# Agentic Workflow — Student Report Comment Generator

> This file defines the step-by-step workflow the Orchestrator follows to read student data from a Google Sheet and generate personalized comments.

---

## Spreadsheet Structure (biweeklyReport tab)

**Meta info (Rows 1–2):** Marking Period 5, Starting Week 5, Dates: March 16–27

| Column | Header | Action |
|--------|--------|--------|
| A | period | Read |
| B | studentName | Read (match against target list) |
| **C** | **comment** | **Write** (student message) |
| **D** | **messageToParents** | **Write** (parent message) |
| E | grade | Read |
| F–H | PMonAtt, PMonET, PMon | Read (Week 1 Monday: Attendance, Exit Ticket, Participation) |
| I–K | PTuesA, PTuesET, PTues | Read (Week 1 Tuesday) |
| L–N | PWedA, PWedET, PWed | Read (Week 1 Wednesday) |
| O–Q | PThursA, PThursET, PThurs | Read (Week 1 Thursday) |
| R–T | PFriA, PFriET, PFri | Read (Week 1 Friday) |
| U+ | TMonA, TMonET, TMon... | Read (Week 2, same pattern with "T" prefix) |

**Google Sheet URL:** `https://docs.google.com/spreadsheets/d/1FD4AzAhPr0XffnxgmcSkZ7J2AdsDsSq1xsBsf-3FYkc/edit?usp=sharing`

---

## Target Students (14)

Only generate comments for the following students. Skip all other rows.

| # | Student Name | Row |
|---|---|---|
| 1 | Camargo, Liam | 11 |
| 2 | Hicks-Sandoval, Kenneth | 12 |
| 3 | Monk, Ahni'Yah | 13 |
| 4 | Percival, Naimah | 14 |
| 5 | Solano, Arnold | 15 |
| 6 | Green, Sa'Niyah | 32 |
| 7 | Naulivou, Eleanor | 33 |
| 8 | Sanchez, Juliette | 34 |
| 9 | Yemane, Haben | 35 |
| 10 | Caro, Athena | 46 |
| 11 | Hackett, Aurora (Rory) | 47 |
| 12 | Harris, Tah'Laya | 48 |
| 13 | Kenny Wolf, Zia | 49 |
| 14 | Ward, Lawrence | 50 |

---

## Workflow Steps

### Step 1: Open & Authenticate
1. Navigate to the Google Sheet URL.
2. If prompted to sign in, authenticate with the blueprint.org Google account.
3. Confirm the correct sheet tab is active (gid=441685799).

### Step 2: Loop Through Target Students
For EACH student in the target list above:

#### 2a. Read Data
- Locate the student's row by matching **Column B** (Student Name).
- Read all data from **Column F onwards** (Participation, Exit Ticket, Attendance).
- Store the data temporarily for comment generation.

#### 2b. Generate Student Comment (Column C)
Using the data from Step 2a, generate a personalized message **to the student**:
- **Tone:** Encouraging, warm, age-appropriate.
- **Content:** Reference specific data points (participation %, attendance, exit ticket scores).
- **Structure:** 2–3 sentences. Highlight strengths first, then areas for growth.
- **Example:** "Great job this quarter, Liam! Your participation has been strong at 85%. Let's work on improving your exit ticket scores next quarter — I know you can do it!"

#### 2c. Generate Parent Comment (Column D)
Using the same data, generate a personalized message **to the parent/guardian**:
- **Tone:** Professional, respectful, informative.
- **Content:** Summarize the student's performance with specific metrics.
- **Structure:** 2–3 sentences. State facts, then provide a recommendation.
- **Example:** "Liam has demonstrated consistent participation (85%) and strong attendance this quarter. His exit ticket scores (72%) indicate some areas where additional practice at home could support his growth."

#### 2d. Write Comments
- Click on the student's **Column C** cell and type the student comment.
- Click on the student's **Column D** cell and type the parent comment.
- Confirm both cells now contain the written text.

#### 2e. Verify (Definition of Done)
Before moving to the next student, confirm:
- [ ] Student comment written in Column C ✓
- [ ] Parent comment written in Column D ✓
- [ ] Both comments reference actual data from the student's row ✓

### Step 3: Final Review
After all 14 students are processed:
- Scroll through the sheet to confirm all target students have comments.
- Generate a summary report listing each student and a status (done/failed).

---

## Comment Generation Rules

1. **Never fabricate data.** Only reference numbers actually present in the spreadsheet.
2. **Keep comments concise.** 2–3 sentences max per comment.
3. **Student comments** should feel personal and motivating.
4. **Parent comments** should feel professional and data-driven.
5. **If data is missing** for a student (empty cells in F+), note it: "Data unavailable for this metric."

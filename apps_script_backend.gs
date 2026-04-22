/**
 * ═══════════════════════════════════════════════════════════════════════
 * apps_script_backend.gs
 *
 * Backend for the Colour Experience Study form (survey_form_preview.html).
 * Receives POST submissions from the GitHub-Pages-hosted form and appends
 * each response as a new row in a Google Sheet.
 *
 * ── HOW TO DEPLOY (one-time, ~10 min) ──
 *
 *  1. Create a new Google Sheet (sheets.new). Name it "Colour Experience
 *     Study Responses". Leave it empty.
 *
 *  2. In the Sheet: Extensions -> Apps Script. A new tab opens.
 *
 *  3. Delete any boilerplate code. Paste the ENTIRE contents of this file.
 *
 *  4. Save (Ctrl+S). Give the project a name, e.g. "Colour Form Backend".
 *
 *  5. Click "Deploy" -> "New deployment".
 *        Type:          Web app
 *        Description:   "Colour form v1"
 *        Execute as:    Me
 *        Who has access: Anyone                <-- IMPORTANT
 *     Click Deploy. Grant the permissions it asks for.
 *
 *  6. Copy the "Web app URL" it gives you. It looks like:
 *        https://script.google.com/macros/s/AKfy...................../exec
 *     Paste that URL into survey_form_preview.html, replacing
 *     the APPS_SCRIPT_URL constant in the <script> block.
 *
 *  7. Push the form to GitHub Pages. Done.
 *
 * ── HOW TO INSPECT RESPONSES ──
 *   Open the Google Sheet. Each submission is one row. The header row is
 *   created on the first submission. Timestamp is the first column.
 * ═══════════════════════════════════════════════════════════════════════
 */

/**
 * Accept a POST with form fields. Appends one row to the active sheet.
 */
function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const params = e.parameter || {};

    // Canonical column order (matches survey_form_preview.html entry.local_NN).
    // We lock this order so every row is aligned regardless of input order.
    const columns = [
      'Timestamp',              // server clock when the row is written
      'start_timestamp',        // ISO time the participant left the consent page
      'completion_time_min',    // (submit - start) in minutes, 1 decimal
      'entry.local_01',  // consent
      'entry.local_02',  // age
      'entry.local_03',  // gender
      'entry.local_04',  // institution
      'entry.local_05',  // art training years
      'entry.local_06',  // colour theory coursework
      'entry.local_07',  // art practice frequency
      'entry.local_08',  // art practice description
      'entry.local_09',  // cvd difficulty
      'entry.local_10',  // cvd type
      'entry.local_10b', // cvd other spec
      'entry.local_11',  // mental health
      'entry.local_12',  // filters confirmed
      'entry.local_12b', // brightness confirmed
      'entry.local_13',  // device
    ];
    // 80 colour ratings: entry.local_14 through entry.local_93
    for (let i = 14; i <= 93; i++) {
      columns.push('entry.local_' + String(i).padStart(2, '0'));
    }
    columns.push('entry.local_94');  // optional comment

    // Write header row on first submission
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(columns);
      sheet.setFrozenRows(1);
    }

    // Build the row
    const row = columns.map((col) => {
      if (col === 'Timestamp') return new Date().toISOString();
      return params[col] || '';
    });
    sheet.appendRow(row);

    // Success response. The client looks for the confirmation marker.
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'ok',
        row: sheet.getLastRow(),
        // Include Google's confirmation marker so existing client code that
        // checks for "freebirdFormviewerViewResponseConfirmationMessage" also
        // passes unchanged.
        freebirdFormviewerViewResponseConfirmationMessage: true
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * GET on the web-app URL returns a status page. Useful for verifying the
 * backend is alive without submitting a full form.
 */
function doGet(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const n = Math.max(0, sheet.getLastRow() - 1);   // minus header row
  return ContentService
    .createTextOutput(JSON.stringify({
      status: 'ok',
      service: 'Colour Experience Study backend',
      responses_received: n,
      sheet_name: sheet.getName(),
      note: 'POST here with entry.local_NN fields to submit a response.'
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

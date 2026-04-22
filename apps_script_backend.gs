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
 * ═══════════════════════════════════════════════════════════════════════
 * AUDIT TRAIL — after appending to the Sheet, also commit one JSON file
 * per submission to a separate GitHub repository. Each commit is
 * cryptographically chained + GitHub-timestamped, so the repo is an
 * immutable append-only log. See shs-hum-epfl/shs-form-data for docs.
 *
 * Configured via Script Properties (Project Settings → Script Properties):
 *   GITHUB_PAT        — fine-grained personal access token with
 *                       "Contents: write" scope on the data repo only.
 *   GITHUB_REPO       — owner/repo, e.g. "shs-hum-epfl/shs-form-data"
 *                       (optional; defaults to this value below).
 *
 * If GITHUB_PAT is missing or the request fails, the submission is STILL
 * written to the Sheet (best effort — participant experience unaffected).
 * Failures are logged to Apps Script's built-in execution log.
 * ═══════════════════════════════════════════════════════════════════════
 */
function commitToGitHub_(rowNumber, params) {
  const props = PropertiesService.getScriptProperties();
  const pat = props.getProperty('GITHUB_PAT');
  if (!pat) {
    Logger.log('GITHUB_PAT not set — skipping audit-trail commit.');
    return {ok: false, reason: 'no PAT'};
  }
  const repo = props.getProperty('GITHUB_REPO') || 'shs-hum-epfl/shs-form-data';

  // File path: submissions/2026-04-22T14-15-23Z_row002.json
  const now = new Date();
  const safeTs = now.toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
  const path = 'submissions/' + safeTs + '_row' +
               String(rowNumber).padStart(3, '0') + '.json';

  const payload = {
    commit_timestamp: now.toISOString(),
    sheet_row: rowNumber,
    response: params
  };

  const body = {
    message: 'Submission row ' + rowNumber + ' at ' + now.toISOString(),
    content: Utilities.base64Encode(JSON.stringify(payload, null, 2)),
    branch: 'main'
  };

  const opts = {
    method: 'put',
    headers: {
      'Authorization': 'Bearer ' + pat,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    contentType: 'application/json',
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  };

  const url = 'https://api.github.com/repos/' + repo + '/contents/' +
              encodeURIComponent(path).replace(/%2F/g, '/');
  try {
    const resp = UrlFetchApp.fetch(url, opts);
    const code = resp.getResponseCode();
    if (code === 201) return {ok: true, path: path, commit: JSON.parse(resp.getContentText()).commit.sha};
    Logger.log('GitHub commit failed: HTTP ' + code + ' — ' + resp.getContentText().substring(0, 400));
    return {ok: false, reason: 'HTTP ' + code};
  } catch (err) {
    Logger.log('GitHub commit exception: ' + err);
    return {ok: false, reason: String(err)};
  }
}


/**
 * Accept a POST with form fields. Appends one row to the active sheet
 * AND commits one JSON file to the audit-trail repo.
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

    // Best-effort: commit the same response to the audit-trail GitHub repo.
    // This runs AFTER the Sheet write so participant data is never lost,
    // even if GitHub is temporarily unreachable.
    const audit = commitToGitHub_(sheet.getLastRow(), params);

    // Success response. The client looks for the confirmation marker.
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'ok',
        row: sheet.getLastRow(),
        audit: audit,
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
 * ONE-TIME SETUP: run this function manually from the Apps Script editor
 * to authorize the "external_request" scope needed for GitHub commits.
 *
 *   1. In Apps Script, open the function dropdown (top toolbar)
 *   2. Select "authorizeAuditTrail"
 *   3. Click Run
 *   4. Google will prompt for permissions — allow "See, edit, create, and
 *      delete... websites" (this is the external-request scope)
 *   5. After the prompt, run it one more time and check the Execution log
 *      (View → Executions) — you should see a line like
 *      "Audit connection test OK — test commit sha = abc123..."
 *
 * Once authorized, the main doPost flow will silently succeed every time.
 */
function authorizeAuditTrail() {
  // FIRST call to UrlFetchApp.fetch is intentionally OUTSIDE any try/catch.
  // This lets the "external_request" permission error propagate up, which
  // is what triggers Google's permission-consent popup the first time.
  // Once you click Allow, this exact line will succeed on the second run.
  const pingResp = UrlFetchApp.fetch('https://api.github.com/zen');
  Logger.log('UrlFetchApp authorized. GitHub responded: ' +
             pingResp.getContentText());

  // Now that we have the scope, try a real commit against the data repo.
  const result = commitToGitHub_(-1, {_authorization_test: new Date().toISOString()});
  Logger.log('Test commit result: ' + JSON.stringify(result));
  if (result.ok) {
    SpreadsheetApp.getActiveSpreadsheet()
      .toast('Audit trail working. Commit SHA: ' + result.commit.substring(0, 7),
             'Setup complete', 10);
  } else {
    SpreadsheetApp.getActiveSpreadsheet()
      .toast('Permission OK but commit failed: ' + result.reason,
             'Check GITHUB_PAT', 15);
  }
  return result;
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

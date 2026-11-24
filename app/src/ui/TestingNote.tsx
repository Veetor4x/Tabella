/**
 * TESTING NOTES (temporary).
 * While Tabella is in testing it has no email domain of its own, so its emails can land in Spam or Junk. These two notes say so, calmly.
 *
 * TO REMOVE WHEN TABELLA HAS ITS OWN EMAIL DOMAIN:
 *   1. delete this file;
 *   2. delete every line marked "TESTING-NOTE" (search for it): steps/SurpriseForm.tsx, ui/ReminderFields.tsx, steps/DoneScreen.tsx;
 *   3. delete test/testingNote.test.tsx.
 */

/** Under an email field. */
export function SpamNote() {
  return (
    <p className="hint small testing-note" data-testing-note="field">
      While Tabella is in testing, our emails may land in Spam or Junk. Please check there.
    </p>
  );
}

/** On the screen right after sealing. */
export function SpamHeadsUp() {
  return (
    <p className="hint small center testing-note" data-testing-note="sealed">
      Heads up: while Tabella is in testing, emails to you and the people you chose may land in Spam or Junk. Tell them to check there.
    </p>
  );
}

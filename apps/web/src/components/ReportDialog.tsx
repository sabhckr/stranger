import { useEffect, useRef, useState } from 'react';
import { ReportReason, type ReportReason as ReportReasonT } from '@stranger/protocol';

const LABELS: Record<ReportReasonT, string> = {
  nudity: 'Nudity or sexual content',
  harassment: 'Harassment or threats',
  underage: 'Appears to be under 18',
  spam: 'Spam, scams or advertising',
  violence: 'Violence or self-harm',
  hate: 'Hate speech',
  scam: 'Asking for money or personal details',
  other: 'Something else',
};

export interface ReportDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (
    reason: ReportReasonT,
    details: string,
    includeTranscript: boolean,
    alsoBlock: boolean,
  ) => void;
}

export function ReportDialog({ open, onClose, onSubmit }: ReportDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<ReportReasonT>('harassment');
  const [details, setDetails] = useState('');
  const [includeTranscript, setIncludeTranscript] = useState(true);
  const [alsoBlock, setAlsoBlock] = useState(true);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby="report-title"
      onClose={onClose}
      onCancel={onClose}
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(reason, details, includeTranscript, alsoBlock);
          setDetails('');
        }}
      >
        <h2 id="report-title">Report this stranger</h2>
        <p>Reports are reviewed by moderators. Repeated reports lead to automatic suspension.</p>
        <fieldset className="radio-list">
          <legend className="sr-only">Reason</legend>
          {ReportReason.options.map((r) => (
            <label key={r}>
              <input
                type="radio"
                name="reason"
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
              />
              {LABELS[r]}
            </label>
          ))}
        </fieldset>
        <label htmlFor="report-details" className="field-label">
          Details (optional)
        </label>
        <textarea
          id="report-details"
          className="textarea"
          value={details}
          maxLength={1000}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="What happened?"
        />
        <label className="check" style={{ marginTop: 12 }}>
          <input
            type="checkbox"
            checked={includeTranscript}
            onChange={(e) => setIncludeTranscript(e.target.checked)}
          />
          <span>
            Include the last messages of this chat
            <small>Only the text you can already see. Helps moderators act faster.</small>
          </span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={alsoBlock}
            onChange={(e) => setAlsoBlock(e.target.checked)}
          />
          <span>Also block this person so we never match you again</span>
        </label>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-danger" data-testid="report-submit">
            Send report
          </button>
        </div>
      </form>
    </dialog>
  );
}

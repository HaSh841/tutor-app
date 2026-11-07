import { useRef, useState } from 'react';
import { readFile, ACCEPT } from './readFile';

// A paperclip button plus a small chip with the chosen file's name.
// file = { name, content, images, truncated } or null; onChange(file or null)
export default function AttachControl({ file, onChange }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';                       // so the same file can be picked again
    if (!f) return;
    setBusy(true);
    setError('');
    try {
      onChange(await readFile(f));
    } catch (err) {
      setError(err.message || 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="attach__btn"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label="Attach a file"
        title="Attach a file"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 11.5 12.4 20.1a5 5 0 0 1-7-7l8.6-8.6a3.4 3.4 0 0 1 5 5l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l8-8" />
        </svg>
      </button>
      <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={pick} />

      {busy && <span className="attach__chip">Reading…</span>}

      {!busy && error && (
        <button type="button" className="attach__chip attach__chip--error" onClick={() => setError('')} title={error}>
          {error}
        </button>
      )}

      {!busy && !error && file && (
        <span className="attach__chip" title={file.truncated ? 'Long file: only the first part is sent' : file.name}>
          <span className="attach__name">
            {file.name}
            {file.images?.length ? ` · ${file.images.length} img` : ''}
            {file.truncated ? ' (cut)' : ''}
          </span>
          <button type="button" className="attach__x" onClick={() => onChange(null)} aria-label="Remove file">×</button>
        </span>
      )}
    </>
  );
}
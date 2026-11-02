import { useState } from 'react';
import { checkCodename } from '../../data/codename';
import './LoadPrompt.css';

// "Enter your codename to load a session" box.
// onSubmit(name) must return '' on success, or an error message to show.
// onClose() is called after the box has faded out.
export default function LoadPrompt({ onSubmit, onClose }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const close = () => setLeaving(true);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy || leaving) return;

    const value = name.trim();
    const problem = checkCodename(value);
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    const result = await onSubmit(value);
    setBusy(false);

    if (result) {
      setError(result);
      return;
    }
    setLeaving(true);                 // success: the box fades out while the screen change starts
  };

  const handleAnimationEnd = (e) => {
    if (e.target !== e.currentTarget || e.animationName !== 'loadp-out') return;
    onClose();
  };

  return (
    <div
      className={`loadp ${leaving ? 'loadp--out' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="loadp-title"
      onAnimationEnd={handleAnimationEnd}
      onKeyDown={(e) => {
        if (e.key === 'Escape') close();
      }}
    >
      <form className="loadp__panel" onSubmit={handleSubmit} noValidate>
        <h2 id="loadp-title" className="loadp__title">
          Load Session
        </h2>
        <p className="loadp__sub">Enter your codename to continue your saved session.</p>

        <input
          className="loadp__input"
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
          placeholder="Name-000"
          maxLength={24}
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-invalid={Boolean(error)}
          aria-describedby="loadp-hint"
        />

        <p id="loadp-hint" className={`loadp__hint ${error ? 'loadp__hint--error' : ''}`}>
          {error || 'Example: Kal-017'}
        </p>

        <div className="loadp__actions">
          <button type="submit" className="loadp__btn" disabled={busy || !name.trim()}>
            {busy ? 'Loading…' : 'Load'}
          </button>
          <button type="button" className="loadp__btn loadp__btn--ghost" onClick={close}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
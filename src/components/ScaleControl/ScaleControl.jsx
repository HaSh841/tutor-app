import { useEffect, useRef, useState } from 'react';
import { SCALE_MIN, SCALE_MAX } from '../../data/uiScale';
import '../VolumeControl/VolumeControl.css';

const APPLY_DELAY_MS = 300;   // wait this long after the last move before resizing the screen
const STEP = 5;

// the Scale bar in the Menu sub menu: one slider that resizes the whole UI
export default function ScaleControl({ scale, onChange, onBack }) {
  const [draft, setDraft] = useState(scale);          // what the slider shows right now
  const latest = useRef({ scale, onChange });

  useEffect(() => {
    latest.current = { scale, onChange };
  });

  // apply the new size once the slider stops moving
  useEffect(() => {
    if (draft === latest.current.scale) return;
    const timer = setTimeout(() => latest.current.onChange(draft), APPLY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft]);

  // leaving quickly still keeps the last value
  const handleBack = () => {
    if (draft !== scale) onChange(draft);
    onBack();
  };

  const fill = ((draft - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;

  return (
    <>
      <div className="volume">
        <span className="volume__label">Scale</span>

        <input
          className="volume__slider"
          type="range"
          min={SCALE_MIN}
          max={SCALE_MAX}
          step={STEP}
          value={draft}
          onChange={(e) => setDraft(Number(e.target.value))}
          aria-label="Scale"
          style={{ '--fill': `${fill}%` }}
        />

        <output className="volume__value" style={{ minWidth: '4.5ch' }}>
          {draft}%
        </output>
      </div>

      <button className="menu__back" onClick={handleBack} aria-label="Back">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <polyline points="9 5 16 12 9 19" />
        </svg>
      </button>
    </>
  );
}
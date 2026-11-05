import { useEffect, useRef, useState } from 'react';
import { tutors } from '../../data/tutors';
import './TutorSelect.css';

// how much of the character shows in the square card, compared with the small round icon
// (smaller number = zoomed out, shows more of the body; bigger = closer to the face)
const CARD_ZOOM = 0.55;

// one box holding the tutor cards side by side, with no gaps. Click a card: it lights up, the
// background blurs and a confirm question appears under the box.
// Yes -> onConfirm(tutor). No / Esc / click outside -> back to the cards.
export default function TutorSelect({ onConfirm, onClose }) {
  const rootRef = useRef(null);
  const [picked, setPicked] = useState(null);       // id of the clicked tutor, or null

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (picked) setPicked(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picked, onClose]);

  // parallax: the cursor position (-1 to 1 from the screen center) goes into --mx and --my
  const handleMove = (e) => {
    const el = rootRef.current;
    if (!el) return;
    el.style.setProperty('--mx', ((e.clientX / window.innerWidth - 0.5) * 2).toFixed(3));
    el.style.setProperty('--my', ((e.clientY / window.innerHeight - 0.5) * 2).toFixed(3));
  };

  const handleLeave = () => {
    const el = rootRef.current;
    if (!el) return;
    el.style.setProperty('--mx', '0');
    el.style.setProperty('--my', '0');
  };

  const chosen = tutors.find((t) => t.id === picked) ?? null;

  return (
    <div
      ref={rootRef}
      className={`tutor-pick ${chosen ? 'tutor-pick--picked' : ''}`}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      {/* the background: dims, and blurs once a card is clicked */}
      <div
        className="tutor-pick__backdrop"
        onClick={() => (chosen ? setPicked(null) : onClose())}
      />

      <div className="tutor-pick__stage" role="dialog" aria-label="Choose your tutor">
        <button type="button" className="tutor-pick__close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <h2 className="tutor-pick__title">Choose your tutor</h2>

        {/* the box: the cards fill it completely, side by side */}
        <div className="tutor-pick__box">
          {tutors.map((t) => {
            const state =
              picked === t.id ? 'tutor-pick__card--on' : chosen ? 'tutor-pick__card--dim' : '';
            // optional per-tutor crop: add  card: { zoom: 140, x: 50, y: 10 }  in tutors.js
            const c = t.card ?? {
              zoom: Math.round(t.face.zoom * CARD_ZOOM),
              x: t.face.x,
              y: t.face.y,
            };
            return (
              <button
                key={t.id}
                type="button"
                className={`tutor-pick__card ${state}`}
                onClick={() => setPicked(t.id)}
                aria-label={t.name}
                aria-pressed={picked === t.id}
                title={t.name}
              >
                {/* the art moves opposite to the cursor while the box tilts toward it */}
                <span
                  className="tutor-pick__art"
                  style={{
                    backgroundImage: `url(${t.image})`,
                    backgroundSize: `${c.zoom}% auto`,
                    backgroundPosition: `${c.x}% ${c.y}%`,
                  }}
                />
              </button>
            );
          })}
        </div>

        {chosen && (
          <div className="tutor-pick__confirm">
            <p className="tutor-pick__name">
              {chosen.name} · {chosen.subject}
            </p>
            <p className="tutor-pick__ask">Are you sure you want to choose this tutor?</p>
            <div className="tutor-pick__buttons">
              <button
                type="button"
                className="tutor-pick__btn tutor-pick__btn--yes"
                onClick={() => onConfirm(chosen)}
              >
                Yes
              </button>
              <button type="button" className="tutor-pick__btn" onClick={() => setPicked(null)}>
                No
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
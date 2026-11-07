import { useState } from 'react';

// The box that pops up beside the character: sample input and sample output of the lesson's code.
export default function SampleBox({ samples, onClose }) {
  const [n, setN] = useState(0);
  const s = samples[Math.min(n, samples.length - 1)];

  return (
    <div className="samples" role="dialog" aria-label="Sample input and output">
      <header className="samples__head">
        <h4 className="samples__title">Sample Input / Output</h4>
        <button type="button" className="samples__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      {samples.length > 1 && (
        <div className="samples__tabs">
          {samples.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`samples__tab ${i === n ? 'samples__tab--on' : ''}`}
              aria-pressed={i === n}
              onClick={() => setN(i)}
            >
              Sample {i + 1}
            </button>
          ))}
        </div>
      )}

      <div className="samples__block">
        <span className="samples__label">Input</span>
        <pre className="samples__pre">{s.input || '(no input)'}</pre>
      </div>

      <div className="samples__block samples__block--out">
        <span className="samples__label">Output</span>
        <pre className="samples__pre">{s.output || '(no output)'}</pre>
      </div>

      <p className="samples__note">Worked out by the AI, not run on a real computer.</p>
    </div>
  );
}
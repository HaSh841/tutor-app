import { useEffect, useState } from 'react';
import MathGraph from './MathGraph';
import './GraphButton.css';

// The hopping box beside the character (math tutor) and the popup that shows the graph.
// Pass the lesson's graph, or null when there is nothing to show.
export default function GraphButton({ graph }) {
  // We remember the graph object itself, so everything resets by itself
  // when a new lesson (a new graph) arrives.
  const [seen, setSeen] = useState(null);   // the graph that was already clicked: it stops hopping
  const [open, setOpen] = useState(null);   // the graph whose popup is open

  const has = Boolean(graph);
  const isOpen = has && open === graph;
  const hopping = has && seen !== graph;

  const toggle = () => {
    setSeen(graph);
    setOpen(isOpen ? null : graph);
  };

  // Esc closes the popup
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  return (
    <div className={`chat__samples-anchor ${has ? 'chat__samples-anchor--on' : ''}`}>
      <button
        type="button"
        className={`chat__sample-btn ${hopping ? 'chat__sample-btn--hop' : ''} ${
          isOpen ? 'chat__sample-btn--open' : ''
        }`}
        onClick={toggle}
        aria-label={isOpen ? 'Close the graph' : 'Show the graph'}
        aria-expanded={isOpen}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 4v16h16" />
          <polyline points="8 15 11.5 10.5 14.5 13 19 7" />
        </svg>
      </button>

      {isOpen && (
        <div className="samples graphbox" role="dialog" aria-label="Graph">
          <header className="samples__head">
            <h4 className="samples__title">Graph</h4>
            <button type="button" className="samples__close" onClick={() => setOpen(null)} aria-label="Close">
              ×
            </button>
          </header>

          <MathGraph graph={graph} />
        </div>
      )}
    </div>
  );
}
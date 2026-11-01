import { useEffect, useRef, useState } from 'react';
import useParallax from '../../hooks/useParallax';
import { getReply } from './getReply';
import { splitReply, extFor, saveBlock } from './downloadFile';
import { playReplySound } from './playSound';
import './ChatScreen.css';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export default function ChatScreen({
  character = '/resources/Civilight_Eterna.png',
  codename = '',
  botName = 'Civilight Eterna',
  onHome,                                        // called when the Home bar is pressed
}) {
  const ref = useParallax();
  const listRef = useRef(null);
  const idRef = useRef(1);                       // next message id
  const [menuOpen, setMenuOpen] = useState(false);
  const [messages, setMessages] = useState(() => [
    {
      id: 0,
      role: 'bot',
      text: `Hello, ${codename || 'Doctor'}. What would you like to talk about?`,
    },
  ]);
  const [draft, setDraft] = useState('');
  const [waiting, setWaiting] = useState(false);   // true while the bot is "typing"
  const [connected, setConnected] = useState(false);
  const [pending, setPending] = useState([]);      // created files not downloaded yet

  // keep the newest message in view
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, waiting]);

  // clicking anywhere outside the menu closes it
  const handleScreenClick = (e) => {
    if (menuOpen && !e.target.closest('.session__menu')) setMenuOpen(false);
  };

  // clicking the hopping icon downloads every waiting file, then the icon goes away
  const handleHopClick = async () => {
    const files = pending;
    setPending([]);
    for (const f of files) {
      await saveBlock(f.lang, f.content);
      await wait(300);                           // small gap so the browser allows several downloads
    }
  };

  // clicking a Download button inside the chat also clears that file from the waiting list
  const handleBubbleDownload = (part) => {
    saveBlock(part.lang, part.content);
    setPending((p) => p.filter((f) => f.content !== part.content));
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || waiting) return;

    const next = [...messages, { id: idRef.current++, role: 'user', text }];
    setMessages(next);
    setDraft('');
    setWaiting(true);

    try {
      const reply = await getReply(next);

      // the reply contains file(s): the icon hops until they are downloaded
      const files = splitReply(reply)
        .filter((p) => p.type === 'code')
        .map((p) => ({ lang: p.lang, content: p.content }));
      if (files.length) setPending(files);

      setConnected(true);
      setMessages((m) => [...m, { id: idRef.current++, role: 'bot', text: reply }]);
      playReplySound();                          // sound when the bot replies
    } catch {
      setMessages((m) => [
        ...m,
        { id: idRef.current++, role: 'bot', text: 'Something went wrong. Please try again.' },
      ]);
    } finally {
      setWaiting(false);
    }
  };

  return (
    <section ref={ref} className="chat" onClick={handleScreenClick}>
      {/* character: fades in on the left */}
      <div className="chat__character">
        <img src={character} alt="" draggable="false" />

        {/* file icon: hops near the head until it is clicked */}
        <button
          type="button"
          className={`chat__hop ${pending.length ? 'chat__hop--on' : ''}`}
          onClick={handleHopClick}
          aria-label="Download the created file"
          tabIndex={pending.length ? 0 : -1}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 3h7l5 5v13H7z" />
            <path d="M14 3v5h5" />
            <line x1="10" y1="13" x2="16" y2="13" />
            <line x1="10" y1="17" x2="16" y2="17" />
          </svg>
          {pending.length > 1 && <span className="chat__hop-count">{pending.length}</span>}
        </button>
      </div>

      {/* chat box: slides in from the right */}
      <div className="chat__dock">
        <div className="chat__panel">
          <header className="chat__header">
            <div>
              <h2 className="chat__title">{botName}</h2>
              {codename && <p className="chat__sub">Codename: {codename}</p>}
            </div>
            <span className="chat__status">
              {connected ? 'Connected to DWDB-221E' : 'Cant connect to the neural network'}
            </span>
          </header>

          <ul className="chat__list" ref={listRef}>
            {messages.map((m) => (
              <li key={m.id} className={`chat__msg chat__msg--${m.role}`}>
                <div className="chat__bubble">
                  {splitReply(m.text).map((part, i) =>
                    part.type === 'code' ? (
                      <div key={i} className="chat__code">
                        <pre><code>{part.content}</code></pre>
                        <button
                          type="button"
                          className="chat__download"
                          onClick={() => handleBubbleDownload(part)}
                        >
                          Download .{extFor(part.lang)}
                        </button>
                      </div>
                    ) : (
                      <span key={i} className="chat__text">{part.content}</span>
                    )
                  )}
                </div>
              </li>
            ))}

            {waiting && (
              <li className="chat__msg chat__msg--bot">
                <p className="chat__bubble chat__typing" aria-label="typing">
                  <span />
                  <span />
                  <span />
                </p>
              </li>
            )}
          </ul>

          <form className="chat__form" onSubmit={handleSend}>
            <input
              className="chat__input"
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a message..."
              autoComplete="off"
              aria-label="Message"
            />
            <button
              type="submit"
              className="chat__send"
              disabled={!draft.trim() || waiting}
              aria-label="Send"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="13 6 19 12 13 18" />
              </svg>
            </button>
          </form>
        </div>
      </div>

      {/* blurs the character and chat while the menu is open (same layer as the session screen) */}
      <div className={`session__blur ${menuOpen ? 'session__blur--on' : ''}`} />

      {/* dropdown menu (uses the same styles as the session screen's menu) */}
      <div className={`session__menu ${menuOpen ? 'session__menu--open' : ''}`}>
        <button
          className="session__burger"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Menu"
          aria-expanded={menuOpen}
        >
          <span />
          <span />
          <span />
        </button>

        <div className="session__stack">
          {/* Home: goes back to the main menu */}
          <button className="session__bar" style={{ '--i': 0 }} onClick={onHome}>
            <span className="session__circle">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 11.5 12 5l8 6.5" />
                <path d="M6.5 10v9h11v-9" />
              </svg>
            </span>
            <span className="session__bar-label">Home</span>
          </button>
        </div>
      </div>
    </section>
  );
}
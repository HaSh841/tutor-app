import { useCallback, useEffect, useRef, useState } from 'react';
import ParallaxScene from './components/ParallaxScene/ParallaxScene';
import MainMenu from './components/MainMenu/MainMenu';
import VolumeControl, { VolumeSlider } from './components/VolumeControl/VolumeControl';
import ScaleControl from './components/ScaleControl/ScaleControl';
import IntroScreen from './components/IntroScreen/IntroScreen';
import SessionScreen from './components/SessionScreen/SessionScreen';
import ChatScreen from './components/ChatScreen/ChatScreen';
import LoadPrompt from './components/LoadPrompt/LoadPrompt';
import TutorSelect from './components/TutorSelect/TutorSelect';
import Shutters from './components/Shutters/Shutters';
import { menuItems } from './data/menuItems';
import { loadSession, sessionExists } from './data/sessionApi';
import { getTutor, rememberTutor, getSavedTutorId } from './data/tutors';
import { loadScale, saveScale } from './data/uiScale';

const backgrounds = [
  '/resources/theresa1.jpg',
  '/resources/theresa2.jpg',
  '/resources/theresa3.jpg',
  '/resources/theresa4.jpg'
];

// each key is the id of a main menu item, the list is what its bar shows
const subMenus = {
  start: [
    { id: 'new-session', label: 'New Session' },
    { id: 'deep-dive', label: 'Deep Dive' },
  ],
  load: [
    { id: 'load-session', label: 'Load Session' },
    { id: 'load-dive', label: 'Load Dive' },
  ],
  menu: [
    { id: 'volume', label: 'Volume' },
    { id: 'scale', label: 'Scale' },
    { id: 'show-hints', label: 'Show Hints' },
  ],
};

// where the back button goes from each screen
const backTarget = {
  start: 'main',
  load: 'main',
  menu: 'main',
  volume: 'menu',
  scale: 'menu',
};

// (the session screen's dialogue now comes from the chosen tutor, see data/tutors.js)

const CLICK_SFX_SRC = '/resources/sfx1.mp3';
const BGM_FADE_IN_MS = 2000;
const EXIT_FADE_MS = 2500;   // black screen and music fade out together

// New Session transition
const MENU_FADE_OUT_MS = 5000;    // menu fades to black while its music fades out
const SESSION_FADE_IN_MS = 5000;  // session screen fades in while its music fades in

// Load Session from the main menu (menu -> chat screen), same style as New Session
const LOAD_FADE_OUT_MS = 5000;    // menu fades to black while its music fades out
const LOAD_FADE_IN_MS = 5000;     // chat screen fades in while its music fades in

// Load Session from inside the chat screen (chat -> chat with the loaded history)
const CHAT_LOAD_FADE_MS = 1500;   // fade length each way (to black, then back in)

// Back to menu transition (from the session screen)
const RETURN_FADE_MS = 2500;      // fade length each way (to black, then back in)

// Home transition (from the chat screen)
const HOME_FADE_OUT_MS = 5000;    // chat fades to black while its music fades out
const HOME_FADE_IN_MS = 5000;     // main menu fades in while its music fades in

const SERVER_OFFLINE_MSG = 'Cannot reach the session server. Is it running?';

// smooth = true uses an ease-in-out curve so it matches the screen fade
function fadeVolume(audio, from, to, ms, smooth = false) {
  const start = performance.now();
  audio.volume = from;
  const step = (now) => {
    const t = Math.min((now - start) / ms, 1);
    const k = smooth ? t * t * (3 - 2 * t) : t;
    audio.volume = Math.min(1, Math.max(0, from + (to - from) * k));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export default function App() {
  const [introDone, setIntroDone] = useState(false);
  const [screen, setScreen] = useState('menu');      // 'menu', 'session' or 'chat'
  const [view, setView] = useState('main');          // 'main', 'start', 'load', 'menu', 'volume' or 'scale'
  const [nextView, setNextView] = useState(null);    // where the bar is heading
  const [barHidden, setBarHidden] = useState(false);
  const [curtain, setCurtain] = useState(false);     // black overlay for screen changes
  const [curtainMs, setCurtainMs] = useState(MENU_FADE_OUT_MS);   // fade length of the curtain
  const [shutter, setShutter] = useState(false);     // top and bottom panels closing
  const [exiting, setExiting] = useState(false);
  const [volume, setVolume] = useState(60);          // music, 0 to 100
  const [sfxVolume, setSfxVolume] = useState(80);    // button sounds and voices, 0 to 100
  const [uiScale, setUiScale] = useState(loadScale); // size of the whole UI in percent, remembered on the device
  const [codename, setCodename] = useState('');      // the active session's codename
  const [tutorId, setTutorId] = useState(getTutor().id);   // the chosen tutor
  const [tutorPick, setTutorPick] = useState(false);       // the "choose your tutor" box
  const [loadPrompt, setLoadPrompt] = useState(false);   // "enter codename" box on the main menu
  // key restarts the chat screen; messages is a loaded history (null = brand new chat);
  // tutorHistory is the loaded Tutoring Mode history (null = none)
  const [chatData, setChatData] = useState({ key: 0, messages: null, tutorHistory: null });
  const sfxVolumeRef = useRef(0.8);                  // lets playClick read the latest level
  const busyRef = useRef(false);                     // true while a screen change runs
  const sfxRef = useRef(null);                       // the intro sound
  const bgmRef = useRef(null);                       // menu music
  const sessionBgmRef = useRef(null);                // session and chat music

  const items = subMenus[view] ?? menuItems;
  const tutor = getTutor(tutorId);

  // plays the button sound; a new Audio each time so fast clicks can overlap
  const playClick = useCallback(() => {
    const click = new Audio(CLICK_SFX_SRC);
    click.volume = sfxVolumeRef.current;
    click.play().catch(() => {});
  }, []);

  // one listener for the whole page: any <button> click plays the sound
  useEffect(() => {
    const onClick = (e) => {
      if (e.target.closest('button')) playClick();
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [playClick]);

  // slide the bar out, then show the other screen
  const goTo = (target) => {
    if (barHidden) return;           // ignore clicks while the bar is sliding
    setNextView(target);
    setBarHidden(true);
  };

  const handleVolumeChange = (v) => {
    setVolume(v);
    bgmRef.current.volume = v / 100;   // applies to the music right away
  };

  const handleSfxChange = (v) => {
    setSfxVolume(v);
    sfxVolumeRef.current = v / 100;
  };

  // Menu > Scale: resize the whole UI and remember the choice
  const handleScaleChange = (v) => {
    setUiScale(v);
    saveScale(v);
  };

  // menu -> session or chat screen:
  // the menu fades to black while the menu music fades out (outMs),
  // then the new screen fades in while its music fades in (inMs).
  // returns false if another screen change is already running
  const fadeFromMenu = (target, outMs, inMs) => {
    if (busyRef.current) return false;
    busyRef.current = true;

    // 1. the menu fades to black while the menu music fades out, same duration
    const bgm = bgmRef.current;
    setCurtainMs(outMs);
    setCurtain(true);
    fadeVolume(bgm, bgm.volume, 0, outMs, true);

    setTimeout(() => {
      // 2. fully black and silent: swap to the new screen
      bgm.pause();
      setScreen(target);
      setView('main');
      setLoadPrompt(false);

      // 3. the new screen fades in while its music fades in, same duration
      const sessionBgm = sessionBgmRef.current;
      sessionBgm.currentTime = 0;
      sessionBgm.volume = 0;
      sessionBgm.play().catch(() => {});
      fadeVolume(sessionBgm, 0, volume / 100, inMs, true);
      setCurtainMs(inMs);
      setCurtain(false);

      setTimeout(() => {
        busyRef.current = false;
      }, inMs);
    }, outMs);

    return true;
  };

  // menu -> New Session screen
  const startSession = () => {
    fadeFromMenu('session', MENU_FADE_OUT_MS, SESSION_FADE_IN_MS);
  };

  // tutor confirmed in the "choose your tutor" box: remember it, then start the new session
  const handleTutorChosen = (chosen) => {
    if (busyRef.current) return;
    setTutorId(chosen.id);
    setTutorPick(false);
    startSession();
  };

  // session or chat screen -> main menu:
  // the screen fades to black while the music fades out (outMs),
  // then the menu fades in while the menu music fades in (inMs)
  const fadeToMenu = (outMs, inMs) => {
    if (busyRef.current) return;
    busyRef.current = true;

    // 1. fade to black, music fades out, same duration
    const sessionBgm = sessionBgmRef.current;
    setCurtainMs(outMs);
    setCurtain(true);
    fadeVolume(sessionBgm, sessionBgm.volume, 0, outMs, true);

    setTimeout(() => {
      // 2. black and silent: swap to the menu
      sessionBgm.pause();
      setScreen('menu');
      setView('main');

      // 3. the menu fades in while the menu music fades in
      const bgm = bgmRef.current;
      bgm.currentTime = 0;
      bgm.volume = 0;
      bgm.play().catch(() => {});
      fadeVolume(bgm, 0, volume / 100, inMs, true);
      setCurtainMs(inMs);
      setCurtain(false);

      setTimeout(() => {
        busyRef.current = false;
      }, inMs);
    }, outMs);
  };

  const returnToMenu = () => fadeToMenu(RETURN_FADE_MS, RETURN_FADE_MS);   // session screen's Back bar
  const goHome = () => fadeToMenu(HOME_FADE_OUT_MS, HOME_FADE_IN_MS);      // chat screen's Home bar

  // main menu: Load Session -> codename entered -> fetch the history, then fade into the chat screen.
  // returns '' on success, or an error message for the box to show
  const handleLoadFromMenu = async (name) => {
    if (busyRef.current) return 'Please wait a moment.';

    const result = await loadSession(name);
    if (!result.ok) {
      return result.notFound ? `No saved session found for ${name}.` : SERVER_OFFLINE_MSG;
    }

    if (!fadeFromMenu('chat', LOAD_FADE_OUT_MS, LOAD_FADE_IN_MS)) return 'Please wait a moment.';

    // these are ready long before the screen swaps in (the fade takes seconds)
    setCodename(name);
    setTutorId(getSavedTutorId(name));             // the tutor this codename was started with
    setChatData((d) => ({
      key: d.key + 1,
      messages: result.messages,
      tutorHistory: result.tutorHistory,
    }));
    return '';
  };

  // chat screen: Load Session -> codename entered -> fade to black, swap the history, fade back in.
  // returns '' on success, or an error message for the box to show
  const handleLoadInChat = async (name) => {
    if (busyRef.current) return 'Please wait a moment.';

    const result = await loadSession(name);
    if (!result.ok) {
      return result.notFound ? `No saved session found for ${name}.` : SERVER_OFFLINE_MSG;
    }

    if (busyRef.current) return 'Please wait a moment.';
    busyRef.current = true;

    setCurtainMs(CHAT_LOAD_FADE_MS);
    setCurtain(true);                              // fade to black

    setTimeout(() => {
      // black: swap in the loaded session (the chat screen restarts with its intro animation)
      setCodename(name);
      setTutorId(getSavedTutorId(name));
      setChatData((d) => ({
        key: d.key + 1,
        messages: result.messages,
        tutorHistory: result.tutorHistory,
      }));
      setCurtain(false);                           // fade back in

      setTimeout(() => {
        busyRef.current = false;
      }, CHAT_LOAD_FADE_MS);
    }, CHAT_LOAD_FADE_MS);

    return '';
  };

  // new session: is this codename already used by someone? ('' = free)
  const checkCodenameFree = async (name) => {
    const exists = await sessionExists(name);
    return exists === true
      ? 'That codename is already taken. Pick another, or use Load Session to continue it.'
      : '';
  };

  // codename confirmed: close the top and bottom panels, then go to the chat screen
  const handleCodename = (name) => {
    setCodename(name);
    rememberTutor(name, tutorId);    // so Load Session brings back the same tutor
    setChatData((d) => ({ key: d.key + 1, messages: null, tutorHistory: null }));   // a brand new chat
    busyRef.current = true;          // ignore everything else while it closes
    setShutter(true);
  };

  // called when the two panels have met in the middle
  const handleShuttersClosed = () => {
    setScreen('chat');               // the chat screen starts black, so there is no visible jump
    setShutter(false);
    busyRef.current = false;
  };

  const handleExit = () => {
    if (exiting) return;
    setExiting(true);                // black screen starts fading in

    const bgm = bgmRef.current;
    fadeVolume(bgm, bgm.volume, 0, EXIT_FADE_MS);   // music fades out at the same time

    setTimeout(() => {
      bgm.pause();
      window.close();                // works only for tabs opened by a script
      window.location.replace('about:blank');       // fallback: blank page
    }, EXIT_FADE_MS + 400);
  };

  const handleSelect = (id) => {
    if (exiting || busyRef.current) return;

    if (id === 'exit') {
      handleExit();
      return;
    }
    if (id === 'new-session') {      // first choose the tutor, then the session starts
      setTutorPick(true);
      return;
    }
    if (id === 'load-session') {     // ask for the codename of a saved session
      setLoadPrompt(true);
      return;
    }
    if (subMenus[id] || id === 'volume' || id === 'scale') {   // sub menus, the volume and scale screens
      goTo(id);
      return;
    }
    console.log('Selected:', id);
  };

  // called when the bar has fully left the screen
  const handleBarHidden = () => {
    if (!nextView) return;
    setView(nextView);               // swap the screen while nobody can see it
    setNextView(null);
    setBarHidden(false);             // bar slides back in
  };

  const handleIntroStart = () => {
    const bgm = bgmRef.current;
    bgm.volume = 0;
    bgm.play().then(() => bgm.pause()).catch(() => {});

    // unlock the session music too, so it is allowed to start later
    const sessionBgm = sessionBgmRef.current;
    sessionBgm.volume = 0;
    sessionBgm.play().then(() => sessionBgm.pause()).catch(() => {});
  };

  const handleIntroDone = () => {
    setIntroDone(true);
    const bgm = bgmRef.current;
    bgm.currentTime = 0;
    bgm.volume = 0;
    bgm.play().catch(() => {});
    fadeVolume(bgm, 0, volume / 100, BGM_FADE_IN_MS);
  };

  return (
    // everything lives inside this box, which is resized by the Scale setting (see index.css)
    <div className="ui-scale" style={{ '--ui-scale': uiScale / 100 }}>
      <audio ref={sfxRef} src="/resources/okaeri_sfx.mp3" preload="auto" />
      <audio ref={bgmRef} src="/resources/main_menu_bgm.mp3" preload="auto" loop />
      <audio ref={sessionBgmRef} src="/resources/session_screen_bgm1.mp3" preload="auto" loop />

      {screen === 'menu' && (
        <ParallaxScene
          images={backgrounds}
          running={introDone}
          barHidden={barHidden}
          onBarHidden={handleBarHidden}
          extraBar={
            <VolumeSlider
              label="SFX"
              value={sfxVolume}
              onChange={handleSfxChange}
              onCommit={playClick}
            />
          }
          extraBarHidden={barHidden || view !== 'volume'}
        >
          {view === 'volume' ? (
            <VolumeControl
              volume={volume}
              onChange={handleVolumeChange}
              onBack={() => goTo(backTarget.volume)}
            />
          ) : view === 'scale' ? (
            <ScaleControl
              scale={uiScale}
              onChange={handleScaleChange}
              onBack={() => goTo(backTarget.scale)}
            />
          ) : (
            <MainMenu
              items={items}
              onSelect={handleSelect}
              onBack={backTarget[view] ? () => goTo(backTarget[view]) : undefined}
            />
          )}
        </ParallaxScene>
      )}

      {/* main menu: "enter your codename" box for Load Session */}
      {screen === 'menu' && loadPrompt && (
        <LoadPrompt onSubmit={handleLoadFromMenu} onClose={() => setLoadPrompt(false)} />
      )}

      {/* main menu: "choose your tutor" box for New Session */}
      {screen === 'menu' && tutorPick && (
        <TutorSelect onConfirm={handleTutorChosen} onClose={() => setTutorPick(false)} />
      )}

      {screen === 'session' && (
        <SessionScreen
          character={tutor.image}
          lines={tutor.sessionLines}
          voices={tutor.voices}
          voiceVolume={sfxVolume / 100}
          onBack={returnToMenu}
          onCodename={handleCodename}
          onCheckCodename={checkCodenameFree}
        />
      )}

      {screen === 'chat' && (
        <ChatScreen
          key={chatData.key}
          tutor={tutor}
          codename={codename}
          initialMessages={chatData.messages}
          initialTutorHistory={chatData.tutorHistory}
          onHome={goHome}
          onLoadSession={handleLoadInChat}
        />
      )}

      {/* top and bottom panels closing after the codename is confirmed */}
      {shutter && <Shutters onClosed={handleShuttersClosed} />}

      {!introDone && (
        <IntroScreen
          audioRef={sfxRef}
          onStart={handleIntroStart}
          onDone={handleIntroDone}
        />
      )}

      {/* black curtain for changing screens */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9500,
          background: '#000',
          opacity: curtain ? 1 : 0,
          pointerEvents: curtain ? 'auto' : 'none',
          transition: `opacity ${curtainMs}ms ease-in-out`,
        }}
      />

      {/* black screen for exiting, sits above everything */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: '#000',
          opacity: exiting ? 1 : 0,
          pointerEvents: exiting ? 'auto' : 'none',   // blocks clicks once exiting
          transition: `opacity ${EXIT_FADE_MS}ms ease-in-out`,
        }}
      />
    </div>
  );
}
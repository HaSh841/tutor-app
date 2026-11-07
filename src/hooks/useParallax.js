import { useEffect, useRef } from 'react';

// parallax effect: the cursor on a computer, tilting the phone on Android.
// It writes --mx and --my (both -1 to 1) onto the element that gets the ref.

const MAX_TILT = 25;   // degrees of tilt that give the full parallax movement
const INVERT_X = 1;    // change to -1 if the left/right tilt feels backwards
const INVERT_Y = 1;    // change to -1 if the up/down tilt feels backwards

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function screenAngle()
{
    if (window.screen.orientation && typeof window.screen.orientation.angle === 'number')
    {
        return window.screen.orientation.angle;
    }
    return window.orientation || 0;
}

export default function useParallax(ease = 0.08)
{
    const ref = useRef(null);

    useEffect(() =>
    {
        const el = ref.current;
        if (!el) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        const target = { x: 0, y: 0 };
        const current = { x: 0, y: 0 };
        let base = null;          // the phone's resting angle, taken from the first reading
        let usingTilt = false;    // true once the phone sends real tilt data
        let frame;

        // computer: cursor position
        const onMove = (e) =>
        {
            if (usingTilt) return;
            target.x = (e.clientX / window.innerWidth - 0.5) * 2;
            target.y = (e.clientY / window.innerHeight - 0.5) * 2;
        };

        const onLeave = () =>
        {
            if (usingTilt) return;
            target.x = 0;
            target.y = 0;
        };

        // phone: tilt (computers send one empty reading, which is ignored)
        const onTilt = (e) =>
        {
            if (e.beta == null || e.gamma == null) return;
            usingTilt = true;
            if (!base) base = { beta: e.beta, gamma: e.gamma };

            const dGamma = e.gamma - base.gamma;   // left / right
            const dBeta = e.beta - base.beta;      // front / back

            // keep the directions right when the phone is turned sideways
            let dx = dGamma;
            let dy = dBeta;
            const angle = screenAngle();
            if (angle === 90)                       { dx = dBeta;   dy = -dGamma; }
            else if (angle === 270 || angle === -90) { dx = -dBeta;  dy = dGamma;  }
            else if (angle === 180)                  { dx = -dGamma; dy = -dBeta;  }

            target.x = clamp(dx / MAX_TILT, -1, 1) * INVERT_X;
            target.y = clamp(dy / MAX_TILT, -1, 1) * INVERT_Y;
        };

        // after the screen rotates, take a fresh resting angle
        const onRotate = () => { base = null; };

        const tick = () =>
        {
            current.x += (target.x - current.x) * ease;
            current.y += (target.y - current.y) * ease;
            el.style.setProperty('--mx', current.x.toFixed(4));
            el.style.setProperty('--my', current.y.toFixed(4));
            frame = requestAnimationFrame(tick);
        };

        window.addEventListener('mousemove', onMove);
        document.addEventListener('mouseleave', onLeave);
        window.addEventListener('deviceorientation', onTilt);
        window.addEventListener('orientationchange', onRotate);
        tick();

        return () =>
        {
            cancelAnimationFrame(frame);
            window.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseleave', onLeave);
            window.removeEventListener('deviceorientation', onTilt);
            window.removeEventListener('orientationchange', onRotate);
        };
    }, [ease]);

    return ref;
}
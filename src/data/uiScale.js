// the UI scale (in percent) is saved on the device so it is remembered next time

const KEY = 'ui-scale';

export const SCALE_MIN = 50;
export const SCALE_MAX = 150;
export const SCALE_DEFAULT = 100;

export function loadScale() {
  try {
    const v = Number(localStorage.getItem(KEY));
    if (v >= SCALE_MIN && v <= SCALE_MAX) return v;
  } catch {
    // storage not available, use the default
  }
  return SCALE_DEFAULT;
}

export function saveScale(v) {
  try {
    localStorage.setItem(KEY, String(v));
  } catch {
    // storage not available, the scale just won't be remembered
  }
}
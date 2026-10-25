export interface KeyPoint {
  x: number;
  y: number;
}

/** QWERTY rows with the horizontal offset (in key widths) each row is indented by. */
const ROWS: ReadonlyArray<{ letters: string; offset: number }> = [
  { letters: "qwertyuiop", offset: 0 },
  { letters: "asdfghjkl", offset: 0.5 },
  { letters: "zxcvbnm", offset: 1.5 },
];

/** Key height as a multiple of key width. Distances are measured in key widths. */
export const KEY_ASPECT = 1.25;
export const KEYBOARD_COLUMNS = 10;
export const KEYBOARD_ROWS = ROWS.length;
/** Size of the key area in key-width units. */
export const KEYBOARD_WIDTH = KEYBOARD_COLUMNS;
export const KEYBOARD_HEIGHT = KEYBOARD_ROWS * KEY_ASPECT;

export const KEY_ROWS = ROWS;

/** Centre of every letter key, in key-width units. */
export const KEY_CENTERS: Readonly<Record<string, KeyPoint>> = (() => {
  const centers: Record<string, KeyPoint> = {};
  ROWS.forEach(({ letters, offset }, row) => {
    [...letters].forEach((letter, column) => {
      centers[letter] = { x: offset + column + 0.5, y: (row + 0.5) * KEY_ASPECT };
    });
  });
  return centers;
})();

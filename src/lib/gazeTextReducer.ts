export interface GazeTextState {
  /** Committed words, each followed by a space. */
  sentence: string;
  /** The word currently being spelled. */
  draft: string;
}

export type GazeTextAction =
  | { type: 'letter'; letter: string }
  | { type: 'space' }
  | { type: 'backspace' }
  | { type: 'clear' }
  | { type: 'word'; word: string };

export const INITIAL_GAZE_TEXT: GazeTextState = { sentence: '', draft: '' };
export const MAX_DRAFT_LENGTH = 32;

/** Appends `word` to `sentence`, inserting a separating space only when needed. */
function commit(sentence: string, word: string): string {
  const separator = sentence && !/\s$/.test(sentence) ? ' ' : '';
  return `${sentence}${separator}${word} `;
}

export function gazeTextReducer(state: GazeTextState, action: GazeTextAction): GazeTextState {
  switch (action.type) {
    case 'letter':
      return state.draft.length >= MAX_DRAFT_LENGTH
        ? state
        : { ...state, draft: state.draft + action.letter.toLowerCase() };

    case 'space':
      if (state.draft) return { sentence: commit(state.sentence, state.draft), draft: '' };
      return state.sentence && !/\s$/.test(state.sentence)
        ? { ...state, sentence: `${state.sentence} ` }
        : state;

    case 'backspace':
      if (state.draft) return { ...state, draft: state.draft.slice(0, -1) };
      return { ...state, sentence: state.sentence.replace(/\s+$/, '').slice(0, -1) };

    case 'clear':
      return INITIAL_GAZE_TEXT;

    case 'word':
      return { sentence: commit(state.sentence, action.word), draft: '' };
  }
}

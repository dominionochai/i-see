import { ME, type SocialState } from "./types";

export type SocialAction =
  | { type: "toggle-like"; postId: string }
  | { type: "add-comment"; postId: string; body: string; id: string }
  | { type: "add-post"; body: string; id: string }
  | { type: "send-message"; friendId: string; from: string; body: string; id: string };

const MAX_BODY_CHARS = 280;

const clean = (body: string) => body.replace(/\s+/g, " ").trim().slice(0, MAX_BODY_CHARS);

/** Pure state transitions for the demo social network. Blank text is ignored. */
export function socialReducer(state: SocialState, action: SocialAction): SocialState {
  switch (action.type) {
    case "toggle-like":
      return {
        ...state,
        posts: state.posts.map((post) =>
          post.id === action.postId
            ? { ...post, liked: !post.liked, likes: post.likes + (post.liked ? -1 : 1) }
            : post,
        ),
      };

    case "add-comment": {
      const body = clean(action.body);
      if (!body) return state;
      return {
        ...state,
        posts: state.posts.map((post) =>
          post.id === action.postId
            ? { ...post, comments: [...post.comments, { id: action.id, authorId: ME, body }] }
            : post,
        ),
      };
    }

    case "add-post": {
      const body = clean(action.body);
      if (!body) return state;
      const post = { id: action.id, authorId: ME, body, timeAgo: "now", likes: 0, liked: false, comments: [] };
      return { ...state, posts: [post, ...state.posts] };
    }

    case "send-message": {
      const body = clean(action.body);
      if (!body) return state;
      const thread = state.threads[action.friendId] ?? [];
      return {
        ...state,
        threads: { ...state.threads, [action.friendId]: [...thread, { id: action.id, from: action.from, body }] },
      };
    }
  }
}

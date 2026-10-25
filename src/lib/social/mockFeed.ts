import { CONTACTS } from "../contacts";
import { ME, type Friend, type SocialState } from "./types";

export const FRIENDS: readonly Friend[] = [
  { id: ME, name: "You", color: "bg-[var(--btn-purple)]" },
  ...CONTACTS.map(({ id, name, color }) => ({ id, name, color })),
];

export const friendById = (id: string): Friend => FRIENDS.find((friend) => friend.id === id) ?? FRIENDS[0];

/** Fresh demo content: every take of the video starts from the same feed. */
export function createInitialSocialState(): SocialState {
  return {
    posts: [
      { id: "p1", authorId: "sam", body: "Sunset at the pier tonight. Wish you were here! 🌅", timeAgo: "12m", likes: 8, liked: false, comments: [] },
      { id: "p2", authorId: "lou", body: "Baked your favourite banana bread today. Coming by on Sunday!", timeAgo: "1h", likes: 14, liked: false, comments: [{ id: "c1", authorId: "maya", body: "Save me a slice, Grandma!" }] },
      { id: "p3", authorId: "dev", body: "Just shipped something I've been working on for months. Feels unreal.", timeAgo: "3h", likes: 31, liked: false, comments: [] },
      { id: "p4", authorId: "maya", body: "Finals are done. Sleeping for a week. 😴", timeAgo: "5h", likes: 22, liked: false, comments: [] },
      { id: "p5", authorId: "sam", body: "Trail run this morning was brutal but worth it.", timeAgo: "1d", likes: 17, liked: false, comments: [] },
    ],
    threads: {
      maya: [{ id: "m1", from: "maya", body: "Thinking of you today ❤️" }],
      sam: [{ id: "m2", from: "sam", body: "Game night on Friday?" }],
    },
  };
}

/** Canned replies keep the demo deterministic: the friend answers shortly after you message them. */
export const AUTO_REPLIES: Readonly<Record<string, string>> = {
  maya: "Love you! Rest up and I'll call you tonight ❤️",
  sam: "Perfect, I'll bring snacks!",
};

/** Used for contacts without a scripted reply. */
export const DEFAULT_REPLY = "Got it. Talking soon!";

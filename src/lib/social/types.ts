export interface Friend {
  id: string;
  name: string;
  /** Tailwind background class for the avatar circle. */
  color: string;
}

export interface Comment {
  id: string;
  authorId: string;
  body: string;
}

export interface Post {
  id: string;
  authorId: string;
  body: string;
  timeAgo: string;
  likes: number;
  liked: boolean;
  comments: Comment[];
}

export interface Message {
  id: string;
  /** Friend id, or "me". */
  from: string;
  body: string;
}

export interface SocialState {
  posts: Post[];
  threads: Record<string, Message[]>;
}

export const ME = "me";

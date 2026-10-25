export interface Contact {
  id: string;
  name: string;
  relation: string;
  /** Tailwind background class for the avatar. */
  color: string;
}

/**
 * The people the user can reach. A deliberately generic starter list: replace
 * the entries (or load them from your own source) to personalise the app.
 */
export const CONTACTS: readonly Contact[] = [
  { id: "maya", name: "Maya", relation: "Daughter", color: "bg-[var(--cat-pain)]" },
  { id: "sam", name: "Sam", relation: "Friend", color: "bg-[var(--cat-thirsty)]" },
  { id: "lou", name: "Grandma Lou", relation: "Family", color: "bg-[var(--cat-hungry)]" },
  { id: "dev", name: "Dev", relation: "Friend", color: "bg-[var(--cat-toilet)]" },
  { id: "caregiver", name: "Caregiver", relation: "Care team", color: "bg-[var(--cat-environment)]" },
];

export const contactById = (id: string): Contact | undefined => CONTACTS.find((contact) => contact.id === id);

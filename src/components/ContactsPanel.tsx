"use client";

import { useEffect, useState } from "react";
import { MessageCircle, Phone } from "lucide-react";
import { GazeAction, GazeSelectScope } from "@/components/GazeSelectScope";
import { brutal } from "@/components/ui/brutal";
import { CONTACTS, type Contact } from "@/lib/contacts";

/** After this long, the demo call gives up so the screen never gets stuck. */
const NO_ANSWER_AFTER_MS = 6000;

interface ContactsPanelProps {
  onClose: () => void;
  /** Opens the conversation with a contact. */
  onMessage: (contactId: string) => void;
}

function Avatar({ contact, large = false }: { contact: Contact; large?: boolean }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full border-[3px] border-[var(--ink)] font-black text-white ${contact.color} ${large ? "h-20 w-20 text-3xl" : "h-14 w-14 text-xl"}`}>
      {contact.name[0]}
    </span>
  );
}

/** A generic contact list: pick someone, then call or message them. Calls are simulated: no phone line is connected. */
export function ContactsPanel({ onClose, onMessage }: ContactsPanelProps) {
  const [selected, setSelected] = useState<Contact | null>(null);
  const [calling, setCalling] = useState<Contact | null>(null);
  const [noAnswer, setNoAnswer] = useState(false);

  useEffect(() => {
    if (!calling) return;
    const timer = setTimeout(() => setNoAnswer(true), NO_ANSWER_AFTER_MS);
    return () => clearTimeout(timer);
  }, [calling]);

  const startCall = (contact: Contact) => {
    setNoAnswer(false);
    setCalling(contact);
  };

  return (
    <GazeSelectScope modal label="Contacts" className={brutal.panel}>
      <header className={brutal.header}>
        <h2 className={brutal.title}>Contacts</h2>
        <p className={brutal.subtitle}>Choose who you want to reach.</p>
        <GazeAction id="close-contacts" agent={false} onClick={onClose} className={`ml-auto ${brutal.button}`}>Close ✕</GazeAction>
      </header>

      <div className="mx-auto grid min-h-0 w-full max-w-4xl flex-1 auto-rows-[7.5rem] grid-cols-1 content-start gap-5 overflow-y-auto p-5 sm:grid-cols-2">
        {CONTACTS.map((contact) => (
          <GazeAction
            key={contact.id}
            id={`contact-${contact.id}`}
            agent={false}
            aria-pressed={selected?.id === contact.id}
            onClick={() => setSelected(contact)}
            className={`flex items-center gap-5 rounded-2xl border-4 border-[var(--ink)] p-4 text-left shadow-[0_6px_0_var(--ink)] ${selected?.id === contact.id ? "bg-[var(--cat-yes)]" : "bg-white"}`}
          >
            <Avatar contact={contact} />
            <span>
              <span className="block text-2xl font-black leading-tight">{contact.name}</span>
              <span className={`block text-sm font-bold ${brutal.muted}`}>{contact.relation}</span>
            </span>
          </GazeAction>
        ))}
      </div>

      {selected && !calling && (
        <section aria-label={`Reach ${selected.name}`} className="border-t-4 border-[var(--ink)] bg-white px-5 py-4">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-4">
            <Avatar contact={selected} />
            <p className="text-2xl font-black">{selected.name}</p>
            <div className="ml-auto flex gap-3">
              <GazeAction id="contact-call" agent={false} onClick={() => startCall(selected)} className={`${brutal.buttonPrimary} flex items-center gap-2 !px-8 !py-4 !text-lg`}>
                <Phone aria-hidden="true" className="h-6 w-6" /> Call
              </GazeAction>
              <GazeAction id="contact-message" agent={false} onClick={() => onMessage(selected.id)} className={`${brutal.button} flex items-center gap-2 !px-8 !py-4 !text-lg`}>
                <MessageCircle aria-hidden="true" className="h-6 w-6" /> Message
              </GazeAction>
            </div>
          </div>
        </section>
      )}

      {calling && (
        <div role="dialog" aria-label={`Calling ${calling.name}`} className="absolute inset-0 z-10 grid place-items-center bg-[var(--iris-bg)]">
          <div className="flex max-w-md flex-col items-center gap-5 p-6 text-center">
            <span className={noAnswer ? "" : "motion-safe:animate-pulse"}>
              <Avatar contact={calling} large />
            </span>
            <p className="text-3xl font-black">{noAnswer ? "No answer" : `Calling ${calling.name}…`}</p>
            <p className={`text-sm font-bold ${brutal.muted}`}>Demo only: no phone line is connected.</p>
            <GazeAction id="end-call" agent={false} onClick={() => setCalling(null)} className={`${brutal.buttonPrimary} !bg-[var(--cat-no)] !px-10 !py-4 !text-lg`}>
              {noAnswer ? "Back" : "Cancel"}
            </GazeAction>
          </div>
        </div>
      )}
    </GazeSelectScope>
  );
}

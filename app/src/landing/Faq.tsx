import { useState } from "react";
import { Headline } from "../ui/Headline";
import { Reveal } from "./Reveal";

const QA = [
  { q: "Can it be opened early?", a: "No. Your loved ones hold one half from day one, and the other half is only released if you go quiet for the time you chose, or on the day you picked. Until then even they can't open it, and neither can we." },
  { q: "Can Tabella read my letter?", a: "No. It's locked on your phone before it leaves, and our delivery helper only ever carries a half. It can't read your letter, and it can't pretend to be you." },
  { q: "What if I'm just away?", a: "Check in with one tap whenever you like, and the time starts again. A guardian you name can pause it if you're ill or travelling, and there's a countdown before anything opens. You can cancel any time before it opens. (A letter set for a date opens on that day, so it has no check-ins to forget.)" },
  { q: "What if they lose their card?", a: "That copy can't be recovered, because nobody keeps a spare. That's why you can name a backup person, and why it helps to keep the card somewhere safe, like a spare house key." },
  { q: "I found or received a Tabella card. What do I do?", a: "Go to tabella-veetor4x.vercel.app/card, scan the card's code or type it in, and follow the screen. Tabella works out what kind of card it is: an I'm-still-here card takes you to your letters, a guardian card lets you tell Tabella someone is okay, and an opening card lets you read a letter left for you." },
  { q: "What happens to my email and phone number?", a: "The contact details you enter for your loved ones are sealed so that only the Postman can read them, and only once your letter is released. They're used for one thing: letting them know a letter is waiting. Today that's by email. Text and call reminders are coming soon, and phone numbers are optional." },
];

/** A short FAQ: tap a question to open its answer, tap again to close it. */
export function Faq() {
  const [open, setOpen] = useState<number | null>(null);
  const toggle = (i: number) => setOpen(open === i ? null : i);

  return (
    <section className="land-section" id="faq">
      <p className="eyebrow">Questions</p>
      <Headline text="Good things to *ask*." as="h2" inView className="h2" />
      <Reveal>
        <div className="faq">
          {QA.map((x, i) => (
            <div key={x.q} className={`faq-item glass ${open === i ? "open" : ""}`}>
              <h3>
                <button type="button" id={`faq-q${i}`} className="faq-q" aria-expanded={open === i} aria-controls={`faq-a${i}`} onClick={() => toggle(i)}>
                  <span>{x.q}</span>
                  <span className="faq-plus" aria-hidden="true" />
                </button>
              </h3>
              {open === i && (
                <div id={`faq-a${i}`} role="region" aria-labelledby={`faq-q${i}`} className="faq-a">
                  <p>{x.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

import { useState } from "react";
import type { Draft } from "../lib/storage";
import { emptyPerson } from "../lib/storage";
import { ChoiceCard } from "../ui/ChoiceCard";
import { IconLetter, IconUser } from "../ui/icons";
import { StepFrame } from "../ui/StepFrame";
import { SurpriseForm, surpriseReady } from "./SurpriseForm";
import { WhoStep } from "./WhoStep";

/** "Who should read this one day?": Keep it a surprise (the main way) or Invite someone (the second). */
export function PeopleStep(props: { draft: Draft; owner: string; patch: (p: Partial<Draft>) => void; onBack: () => void; onNext: () => void }) {
  const { draft } = props;
  const mode = draft.mode ?? "surprise";
  const recipient = draft.recipient ?? emptyPerson();
  const backups = draft.backups ?? [];
  const [tried, setTried] = useState(false);

  const choice = (
    <div className="choices" role="radiogroup" aria-label="How should they receive it?">
      <ChoiceCard name="mode" checked={mode === "surprise"} onChange={() => props.patch({ mode: "surprise" })} icon={<IconLetter />} title="Keep it a surprise" sub="They don't need to do anything. When the time comes, we find them by email." />
      <ChoiceCard name="mode" checked={mode === "invite"} onChange={() => props.patch({ mode: "invite" })} icon={<IconUser />} title="Invite someone" sub="They make their own opening card first, and you send them a link." />
    </div>
  );

  if (mode === "invite") return <WhoStep top={choice} owner={props.owner} heirs={draft.heirs} onChange={(heirs) => props.patch({ heirs })} onBack={props.onBack} onNext={props.onNext} />;

  const title = `${props.owner.trim() ? `${props.owner.trim()}, who` : "Who"} should *read* this one day?`;
  const ready = surpriseReady(recipient, backups);
  return (
    <StepFrame step={1} title={title} lead="Add how to reach them, and a question only they can answer. They never need an app or an account." onBack={props.onBack} onNext={() => (ready ? props.onNext() : setTried(true))} nextDisabled={false}>
      {choice}
      <SurpriseForm recipient={recipient} backups={backups} onChange={(r, b) => props.patch({ recipient: r, backups: b })} showProblems={tried} />
    </StepFrame>
  );
}

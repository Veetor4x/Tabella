import { Headline } from "../ui/Headline";
import { SplitBody, SplitIntro } from "../ui/split";
import { CardDoor } from "./CardDoor";
import { Shell } from "./Shell";

/** /card ("Use your card"): the one door for every card. */
export function CardPage() {
  return (
    <Shell here="card">
      <div className="step split">
        <SplitIntro>
          <Headline text="Use your *card*." />
          <p className="lead">Every Tabella card works here: the one you keep to check in, the one for a guardian, and the one that opens a letter.</p>
        </SplitIntro>
        <SplitBody>
          <CardDoor />
        </SplitBody>
      </div>
    </Shell>
  );
}

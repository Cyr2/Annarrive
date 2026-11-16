import type { Proposal } from "../../api/schemas.ts";
import { Button } from "../../ui/Button.tsx";
import { Glass } from "../../ui/Glass.tsx";
import { usePlan } from "../plan/store.ts";

/** A level change Reggie proposes: one tap accepts or declines, and the banner can undo it. */
export function ProposalCard({ proposal }: { proposal: Proposal }) {
  const apply = usePlan((s) => s.apply);
  return (
    <Glass as="article" className="flex flex-col gap-3 rounded-card p-5">
      <span className="t-cap">Proposition de Reggie</span>
      <p className="t-body m-0">{proposal.text}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="tinted" onClick={() => void apply((api) => api.declineProposal(proposal.id))}>
          Non merci
        </Button>
        <Button variant="tintedBlue" onClick={() => void apply((api) => api.acceptProposal(proposal.id))}>
          Accepter
        </Button>
      </div>
    </Glass>
  );
}

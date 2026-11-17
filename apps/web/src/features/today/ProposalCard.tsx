import type { Proposal } from "../../api/schemas.ts";
import { Button } from "../../ui/controls.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { usePlan } from "../plan/store.ts";

/** A level change Reggie proposes: one tap accepts or declines, and the banner can undo it. */
export function ProposalCard({ proposal }: { proposal: Proposal }) {
  const apply = usePlan((s) => s.apply);
  return (
    <Surface as="article" variant="widget" className="flex flex-col gap-3 p-5">
      <span className="t-cap font-semibold text-reggie">Proposition de Reggie</span>
      <p className="t-body m-0">{proposal.text}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => void apply((api) => api.declineProposal(proposal.id))}>Non merci</Button>
        <Button variant="tinted" tone="reggie" onClick={() => void apply((api) => api.acceptProposal(proposal.id))}>
          Accepter
        </Button>
      </div>
    </Surface>
  );
}

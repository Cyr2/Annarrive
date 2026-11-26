import type { Proposal } from "../../api/schemas.ts";
import { Button } from "../../ui/controls.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { usePlan } from "../plan/store.ts";
import { ReggieAvatar } from "./parts.tsx";

/** A level change Reggie proposes: one tap accepts or declines, and the banner can undo it. */
export function ProposalCard({ proposal }: { proposal: Proposal }) {
  const apply = usePlan((s) => s.apply);
  return (
    <Surface as="section" variant="widget" aria-label="Proposition de Reggie" className="flex flex-col gap-3 p-4">
      <span className="t-cap flex items-center gap-2 font-semibold text-reggie">
        <ReggieAvatar />
        Reggie te propose
      </span>
      <p className="t-body m-0">{proposal.text}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => void apply((api) => api.declineProposal(proposal.id))}>Non merci</Button>
        <Button variant="tinted" tone="reggie" onClick={() => void apply((api) => api.acceptProposal(proposal.id))}>
          Accepter
        </Button>
        {proposal.exception && (
          <Button className="col-span-2" onClick={() => void apply((api) => api.exceptionProposal(proposal.id))}>
            C'était une exception
          </Button>
        )}
      </div>
    </Surface>
  );
}

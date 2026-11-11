// An explicit state machine: one state field, one table of allowed moves, one function to move (CQ-01, CQ-02).
export type Actor = "seller" | "buyer" | "agent" | "paypal" | "system";

export interface Transition<S extends string> {
  // The Gate 2 transition ID, for example "T-ORD-03".
  readonly id: string;
  readonly from: readonly S[];
  readonly to: S;
  readonly by: readonly Actor[];
}

export type TransitionRefusal<S extends string> = {
  readonly kind: "refused";
  readonly from: S;
  readonly to: S;
  readonly actor: Actor;
};

export type TransitionResult<S extends string> =
  | { readonly ok: true; readonly to: S; readonly transitionId: string }
  | { readonly ok: false; readonly refusal: TransitionRefusal<S> };

export interface Machine<S extends string> {
  readonly name: string;
  readonly states: readonly S[];
  readonly transitions: readonly Transition<S>[];
  move(from: S, to: S, actor: Actor): TransitionResult<S>;
  canMove(from: S, to: S, actor: Actor): boolean;
}

export function defineMachine<const S extends string>(name: string, states: readonly S[], transitions: readonly Transition<S>[]): Machine<S> {
  // Fail at load time if the table names a state the machine does not have.
  for (const t of transitions) {
    for (const s of [...t.from, t.to]) if (!states.includes(s)) throw new Error(`${name}: ${t.id} uses unknown state "${s}"`);
  }
  const find = (from: S, to: S, actor: Actor) => transitions.find((t) => t.to === to && t.from.includes(from) && t.by.includes(actor));
  return {
    name,
    states,
    transitions,
    move(from, to, actor) {
      const t = find(from, to, actor);
      return t ? { ok: true, to, transitionId: t.id } : { ok: false, refusal: { kind: "refused", from, to, actor } };
    },
    canMove(from, to, actor) {
      return find(from, to, actor) !== undefined;
    },
  };
}

# Store group-level budgets as hidden "held" categories, not a new table

Group-level budgeting needs a persisted per-month amount held at each category group (its "To Distribute"). We store it as an ordinary, hidden child category per group — a formalized version of the manual "z01 Budget" placeholder workaround — instead of adding a `zero_group_budgets` table.

The deciding constraint is budget-file compatibility: a new table requires a migration, and a stock Actual client cannot open a budget file whose migration list it doesn't recognize (and syncing rows of an unknown table would break stock clients' sync). That would destroy the fork's rollback guarantee (unset `ACTUAL_WEB_ROOT` → stock UI keeps working against the same file). With a held category, the file stays 100% stock-compatible, and every mechanism is existing machinery: group Budgeted already sums child budgets, To Budget math is untouched, distribute/shift are `transferCategory`, cover is `coverOverspending`, rollover is ordinary category-balance rollover, and budget automations attach to it like any category.

## Consequences

- Held categories must be kept out of sight everywhere the fork UI shows categories (budget rows, autocomplete, reports), and the feature owns their lifecycle (lazy creation, group deletion).
- The goal-template engine's bulk runner excludes hidden categories (`getCategories()` in `packages/loot-core/src/server/budget/goal-template.ts:141-146`), so it needs a small patch to include held categories — which requires a reliable marker identifying a category as "held" (see feature design).
- If upstreaming is ever attempted, upstream may prefer a real table; this ADR documents why the fork deliberately chose otherwise.
- An interactive prototype validating these semantics (including zero-sum invariants and the negative To Distribute edge) is preserved on the `prototype/group-budgeting` branch as `prototypes/group-budgeting-demo.html`; it reproduced the manual z-category workaround's arithmetic exactly and was confirmed by Jeremy on 2026-08-15.

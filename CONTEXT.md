# Group-Level Budgeting (Jeremy's fork)

Domain language for the group-level budgeting feature carried by this fork: Barefoot-Investor-style buckets layered onto Actual's envelope budget, where money can be budgeted directly to a category group and distributed to its child categories over the month.

## Language

**Category Group**:
Actual's existing top-level grouping of categories (e.g. "01 Monthly Commitments"). In this feature it doubles as the Barefoot-style bucket that money is budgeted into.
_Avoid_: Bucket (conversational synonym only — code and UI say category group), folder, section

**Group Budgeted**:
The total budgeted to a category group for a month: the amount still held at the group plus the sum of its child category budgets. This is the number on the group row's Budgeted column, and the number that counts against To Budget.
_Avoid_: Group total, aggregate budget

**To Distribute**:
The money budgeted to a category group that has not yet been distributed to a child category — a placeholder budget until it finds a home. Group Budgeted = To Distribute + the sum of child category budgets.
_Avoid_: Pool, held, unallocated, group pool

**Held Category**:
The hidden system category that stores a group's To Distribute amount as an ordinary category budget (the formalized "z01 Budget" workaround). An implementation vehicle — never shown as a category in the UI.
_Avoid_: Z category, placeholder category, shadow category

**Distribute**:
Move money held at a category group down into one of its child categories. A neutral transfer — Group Budgeted and To Budget are both unchanged; only the split between held-at-group and category budgets moves.
_Avoid_: Allocate (overloaded with budgeting from To Budget), assign

**To Budget**:
Actual's existing month-level pool of unbudgeted funds. Money budgeted to a group (directly or via its categories) comes out of To Budget — group budgets are zero-sum with it, never a free-floating layer.

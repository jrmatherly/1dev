## MODIFIED Requirements

### Requirement: Phase 0 gates page accuracy
The `docs/enterprise/phase-0-gates.md` page SHALL reflect the current Phase 0 gate status (15/15 complete). The subtitle and table SHALL match the actual gate completion state.

#### Scenario: Subtitle matches reality
- **WHEN** a reader opens `docs/enterprise/phase-0-gates.md`
- **THEN** the subtitle says "15 of 15 complete" (not "12 of 15")

### Requirement: Quality gates documentation accuracy
The `docs/conventions/quality-gates.md` page SHALL reflect the current TS baseline (0 errors). Historical baseline values SHALL not appear as current state.

#### Scenario: Baseline reflects current state
- **WHEN** a reader opens `docs/conventions/quality-gates.md`
- **THEN** the TS baseline is documented as 0, not ~87 or any other stale value

### Requirement: Architecture doc completeness
The architecture documentation pages under `docs/architecture/` SHALL contain substantive content, not stub placeholders. Content already exists in CLAUDE.md and Serena memories and SHALL be migrated to the canonical pages.

#### Scenario: No stub pages
- **WHEN** a reader navigates to any page under `docs/architecture/`
- **THEN** the page contains meaningful content (not just a title and "TODO" marker)

### Requirement: Upstream features doc accuracy
The `docs/enterprise/upstream-features.md` page SHALL use the current brand domain (`apollosai.dev`), not stale `21st.dev` references.

#### Scenario: No stale brand references
- **WHEN** `docs/enterprise/upstream-features.md` is searched for `21st.dev`
- **THEN** zero matches are found

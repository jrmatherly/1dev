## ADDED Requirements

### Requirement: Dev-setup guides live on dedicated pages under `docs/operations/`

The system SHALL place developer-workstation setup guides (topics where a
human developer follows platform-specific, interactive steps to prepare
their local machine) on their own dedicated pages under
`docs/operations/`, not as subsections of unrelated pages. Dev-setup
guides include, but are not limited to, platform-specific Keychain /
credential-store mitigations, toolchain setup steps that require
interactive GUI tools (e.g., Xcode), and platform-specific workarounds
that developers execute once per machine.

A dev-setup guide SHALL be considered "dedicated" when it lives in a
file named `docs/operations/dev-setup-<platform>.md` (e.g.,
`dev-setup-macos.md`) AND is registered in the xyd-js sidebar under the
Operations tab via `docs/docs.json`.

A dev-setup guide SHALL NOT be appended to `docs/operations/env-gotchas.md`
or any other page whose primary audience is CI / release / operational
concerns.

The first dev-setup guide SHALL be `docs/operations/dev-setup-macos.md`,
which documents the one-time mitigation for the two macOS Keychain
prompts that appear on every `bun run dev` launch.

Every dev-setup guide SHALL include at minimum: Overview, Symptom, Setup
steps, Troubleshooting, Official references (first-party vendor docs only
— no third-party blogs), and an explicit opt-out section telling
developers how to live without the mitigation if the setup cost is not
worth it for them.

#### Scenario: A new dev-setup guide is added under `docs/operations/`

- **WHEN** a contributor adds a developer-workstation setup guide for a
  given platform
- **THEN** the guide SHALL live at `docs/operations/dev-setup-<platform>.md`
- **AND** the guide SHALL be registered in the xyd-js sidebar via
  `docs/docs.json` under the Operations tab
- **AND** the guide SHALL NOT be appended to `docs/operations/env-gotchas.md`
  or any other page whose primary audience is CI / release / operational
  concerns
- **AND** the guide SHALL include the required sections: Overview,
  Symptom, Setup, Troubleshooting, Official references, and an opt-out
  subsection

#### Scenario: `docs/operations/dev-setup-macos.md` exists and is discoverable

- **WHEN** a developer hits the two macOS Keychain prompts described in
  the mitigation guide and searches for help
- **THEN** `docs/operations/dev-setup-macos.md` SHALL exist as a
  tracked file in the repository
- **AND** `docs/docs.json` SHALL contain a sidebar entry that routes to
  the page under the Operations tab
- **AND** the top of the "Dev environment quick reference" section in
  `CLAUDE.md` SHALL link to the page so the breadcrumb is present at
  the moment a developer is reading onboarding material

#### Scenario: Dev-setup guide cites first-party vendor docs only

- **WHEN** a dev-setup guide references external documentation
- **THEN** the guide SHALL cite only canonical vendor sources (e.g.,
  `developer.apple.com`, `learn.microsoft.com`, `kubernetes.io`)
- **AND** the guide SHALL NOT cite third-party blogs, personal sites,
  Stack Overflow answers, or other non-authoritative sources
- **AND** the guide SHALL prefer linking to the vendor's canonical
  page over paraphrasing vendor instructions verbatim, to reduce
  drift risk when the vendor updates their flow

# Groundtruth Docs

Groundtruth now keeps two user-facing documentation tracks:

- [Human Guide](./USER_GUIDE.md)
- [AI Operator Guide](./AI_OPERATOR_GUIDE.md)
- [LLM Handoff](./LLM_HANDOFF.md)
- [Engine Rulebook](./ENGINE_RULEBOOK.md)
- [Roadmap](./ROADMAP.md)

Use the Human Guide when operating Groundtruth through the UI as a person.

Use the AI Operator Guide when another AI needs to understand how to select modes, generate worlds, mutate them semantically, configure gameplay policies, validate results, and avoid common Groundtruth-specific mistakes.

Use the LLM Handoff when another model needs a high-context operational download of the current branch, project direction, architecture seams, user expectations, and current work state.

Use the Engine Rulebook when deciding whether a change belongs in project data, preset/policy, feature, or engine core.

Groundtruth now distinguishes:

- editable project exports
- player-focused playable build exports
- standalone packaged playable folders via `npm run export:playable`

Groundtruth also enforces a docs-update gate on commit through `.githooks/pre-commit`. If source/runtime files are staged without a matching update to the human or AI guide surfaces, the commit is blocked.

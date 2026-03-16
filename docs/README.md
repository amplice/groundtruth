# Groundtruth Docs

Groundtruth now keeps two user-facing documentation tracks:

- [Human Guide](./USER_GUIDE.md)
- [AI Operator Guide](./AI_OPERATOR_GUIDE.md)

Use the Human Guide when operating Groundtruth through the UI as a person.

Use the AI Operator Guide when another AI needs to understand how to select modes, generate worlds, mutate them semantically, validate results, and avoid common Groundtruth-specific mistakes.

Groundtruth also enforces a docs-update gate on commit through `.githooks/pre-commit`. If source/runtime files are staged without a matching update to the human or AI guide surfaces, the commit is blocked.

# Skill: Proxy-Guided Journal Loop

Use this when an optimization task needs both exploration and durable learning.

The journal should store not just results, but the evolving model of why results improve.

## Required Cycle

```text
explore mechanisms
-> implement small scored batch
-> audit proxies
-> publish reusable mechanisms
-> compose mechanisms on ladder artifacts
-> ablate composition
-> update hypothesis queue
```

## Record Types

### Hypothesis

```text
mechanism:
proxy expected to move:
features expected to move:
candidate family:
ablation:
expected failure mode:
```

### Submission

```text
candidate artifact:
command:
real score:
features:
proxy scores:
ablation results:
validity:
```

### Review

```text
proxy rank agreement:
false positives:
false negatives:
mechanism transfer result:
next proxy revision:
next composition target:
```

### Publication

```text
accepted mechanism:
where it works:
where it fails:
ladder rung improved:
resume command:
```

## Guardrails

- Do not optimize only the current best artifact.
- Do not trust a proxy without rank audit.
- Do not keep a mechanism unless it transfers or explains a failure.
- Do not restart after a branch succeeds; compose it.
- Do not publish a result without a resume command.

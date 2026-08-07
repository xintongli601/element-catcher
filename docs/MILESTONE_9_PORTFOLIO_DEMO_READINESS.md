# Milestone 9 Portfolio and Demo Readiness

## 1. Status and Goal

Status: Current.

Milestone 9 makes the accepted Element Catcher local v0.1 demonstration understandable, honest, repeatable, and independently reviewable by an external portfolio reviewer without expanding existing product capability.

The accurate product description is: portfolio-ready local v0.1 demonstration.

Accepted product flow:

```text
Capture -> Save -> Organize -> Rebuild -> Preview -> Revise/Regenerate -> Compare -> Export
```

Milestone 9 is documentation and reviewer-readiness work over the already accepted local v0.1 capability set. It does not redefine Element Catcher as production-ready, Chrome Web Store ready, deployed, SaaS, multi-user, or production GitHub-integrated.

## 2. Slice Plan

Slice status:

- Slice 1 - Documentation package and reviewer path: Current.
- Slice 2 - Reviewer-facing runtime clarity, validation, and closeout: Not started.

Do not create more slices for Milestone 9.

Slice 1 is documentation-only. It creates the reviewer-facing documentation package and aligns existing high-level docs with Milestone 9 status. It introduces no runtime behavior changes.

Slice 2 remains Not started. Proposed Slice 2 scope is limited to reviewer-facing runtime clarity, manual Chrome smoke execution, evidence capture, and closeout documentation if separately implemented and accepted. Slice 2 must not be described as implemented until that work actually exists and has accepted evidence.

## 3. Reviewer Personas

- Portfolio reviewer: wants to understand the product story, scope, and proof without reading the whole codebase.
- Technical reviewer: wants reproducible local setup, clear boundaries, and honest evidence labeling.
- Product reviewer: wants to see the end-to-end local v0.1 flow without confusing demo behavior for production operations.
- Security/privacy reviewer: wants to verify local-first storage, consent-gated outbound generation, preview isolation, fake/development GitHub limits, and export boundaries.

## 4. Reviewer Success Criteria

A reviewer should be able to:

- Check out the repository and identify the authoritative roadmap and Milestone 9 documentation.
- Build and load the unpacked Chrome extension using documented project commands.
- Follow the default local extension demonstration without provider secrets.
- Understand the optional configured generation demonstration and the unavailable-backend behavior.
- Observe the accepted product flow from capture through export where local data and configuration allow it.
- Distinguish implemented local v0.1 behavior from excluded production or store-readiness claims.
- Review the manual Chrome smoke checklist that Slice 2 is expected to execute.
- Confirm that evidence claims are labeled as historical local validation, new manual validation, or GitHub Actions evidence only when such evidence actually exists.

## 5. Evidence Model

Evidence types:

- Historical local validation evidence: previously reported and accepted local command or browser results tied to an accepted milestone or slice.
- New manual evidence: reviewer or maintainer observations recorded during Slice 2 manual Chrome smoke execution.
- Automated local evidence: command output from locally executed build, test, or inspection commands.
- GitHub Actions evidence: remote CI results produced by GitHub Actions and linked to a specific commit or run.

Slice 1 claims no new validation result. It records documentation changes only.

Historical evidence must remain tied to the milestone, slice, commit, and local context that originally produced it. It must not be relabeled as newly executed evidence, GitHub Actions evidence, universal browser compatibility, security proof, production readiness, or Chrome Web Store readiness.

GitHub Actions evidence must be claimed only when an actual GitHub Actions run exists for the relevant commit and result. Local command output, Playwright output, manual Chrome observations, and reviewer reports are not GitHub Actions evidence.

## 6. Product Boundaries

Milestone 9 explicitly preserves these existing boundaries:

- local-first;
- no account system;
- no cloud sync;
- no collaboration;
- no production hosted backend;
- no Chrome Web Store readiness claim;
- no Chrome Web Store submission;
- no production GitHub integration;
- GitHub export remains deterministic fake/development only;
- no real GitHub authorization;
- no OAuth exchange;
- no token storage;
- no real GitHub REST transport;
- no production GitHub writes;
- no universal generated-code execution;
- no npm package generator;
- no runnable project generator;
- no publishing workflow;
- no deployment workflow;
- Bundle V1 remains source-only and is not runnable or dependency-complete.

## 7. Explicit Exclusions

Milestone 9 Slice 1 does not change:

- runtime behavior;
- permissions;
- dependencies;
- storage schemas;
- networking;
- backend routes or provider behavior;
- generation, revision, regeneration, preview, comparison, local export, fake/development GitHub export, or bundle export implementation;
- extension Manifest or Chrome permissions;
- package files, lockfiles, scripts, workflows, tests, or source code.

Milestone 9 does not add any later roadmap direction.

## 8. Slice 1 Acceptance Criteria

Slice 1 is accepted only when:

- this Milestone 9 architecture/readiness document exists;
- the portfolio demo guide exists;
- the manual Chrome smoke checklist exists and is clearly labeled for Slice 2 execution;
- the Chrome Web Store readiness gaps inventory exists and is clearly not a readiness claim or submission plan;
- README, PRD, Development Brief, and Roadmap consistently state that Milestones 1 through 8 are Completed and Milestone 9 is Current for portfolio/demo readiness;
- Slice 2 remains Not started;
- no new runtime capability is claimed;
- no new validation result is claimed;
- real GitHub integration remains explicitly unimplemented;
- Bundle V1 remains source-only and non-runnable;
- only allowed documentation files are changed.

## 9. Proposed Slice 2 Scope

Slice 2 may later cover:

- reviewer-facing UI wording clarity where accepted capability already exists;
- execution of the manual Chrome smoke checklist on a real unpacked Chrome extension;
- recording date, browser version, commit SHA, result, and notes for manual evidence;
- documentation closeout that distinguishes manual evidence from automated local evidence and GitHub Actions evidence.

Slice 2 must not introduce production GitHub integration, Chrome Web Store submission, production hosted backend, cloud sync, collaboration, account system, package/project generation, publishing, deployment, or any new product capability unless separately scoped and accepted.

## 10. Final Milestone 9 Acceptance Criteria

Milestone 9 is complete only when:

- Slice 1 documentation package is accepted;
- Slice 2, if executed, records reviewer-facing runtime clarity and manual Chrome smoke evidence without fabricating results;
- external reviewers can follow the local v0.1 demo path and understand unsupported states;
- all evidence remains accurately labeled;
- Milestone 9 closes without changing the accepted runtime product boundaries.

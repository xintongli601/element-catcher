# Milestone 10 - Private Session Capture

Status: Current

## Objective

Milestone 10 makes Element Catcher better at browser-native capture of UI state the user already has access to, without requiring the source page to be publicly reachable or remotely re-fetched.

The goal is not to bypass authentication, firewalls, permissions, or browser restrictions. The goal is to preserve and use the legitimate browser session that is already displaying the UI, including many authenticated applications, login-only pages, permission-specific dashboards, stateful SPAs, intranet-style pages, and localhost applications.

## Product Differentiation

Element Catcher captures from the user's current browser view. That is different from tools that require a public URL, remote fetch, crawler access, copied HTML, or a recreated test fixture.

This distinction matters because many useful UI states exist only inside the active browser session:

- a logged-in SaaS dashboard;
- a page after filters, search, tabs, or local state have changed;
- an intranet or localhost tool;
- a permission-specific workspace;
- an application state that may change or disappear after refresh.

Element Catcher must still respect every browser and site access boundary. It should capture only supported ordinary webpages the user can already view in Chrome.

## Supported And Restricted Surfaces

Supported target class:

- ordinary `http://` and `https://` webpages where Chrome permits the extension content script to run;
- many authenticated, private, permissioned, stateful, intranet, and localhost pages already visible to the user.

Restricted target class:

- `chrome://` pages;
- Chrome Web Store pages;
- browser-owned UI;
- inaccessible extension pages;
- inaccessible cross-origin iframe contents;
- closed shadow roots;
- any surface where Chrome does not permit extension access.

Unsupported or protected surfaces must fail closed. Element Catcher must not use `chrome.scripting` to bypass Chrome restrictions.

## Why Page-State Preservation Matters

Refreshing a private or stateful page can lose the exact UI the user wants to capture. Filters, local form state, selected rows, expanded panels, modal state, session-scoped content, or live dashboard state may not survive reload.

Milestone 10 therefore prioritizes recovery paths that do not reload, navigate, recreate, refresh, submit forms, alter history, or intentionally change source-page application state.

## Slice 1 - Session-Preserving Capture Recovery

Status: Completed / Accepted at `b0ed05823c530b2b0632c5db3bdb189459719f0d`.

Slice 1 addresses a specific recoverable case:

```text
User is already on a supported webpage
-> user invokes Element Catcher
-> Start Capture
-> existing content script responds?
   YES -> use the existing accepted capture flow unchanged
   NO  -> attempt one bounded programmatic content-script injection
         -> retry Start Capture once
         -> continue the normal accepted capture flow
```

This recovery is only for `Start Capture`. It is not used for Cancel, Parent, Child, Confirm, screenshot completion, or unrelated extension messages. If an active capture loses its content runtime after starting, the existing fail-closed behavior remains the boundary.

## Recovery Architecture

The background service worker keeps the existing active-tab routing pattern:

1. Resolve the active tab.
2. Apply the supported-page boundary first.
3. Send the normal content-script Start Selection message.
4. If the existing content script responds, return success with zero programmatic injection calls.
5. If the message fails because the receiving content runtime is missing, call `chrome.scripting.executeScript()` exactly once for the active tab main frame using the packaged `content/content-script.js`.
6. Retry Start Selection exactly once.
7. If injection or retry fails, fail closed with safe actionable UX rather than raw Chrome exception text.

The content script has a narrow idempotency guard for reinjection. A new runtime disposes the previous Element Catcher content runtime, removes its message listener, cleans up selection state, and removes overlay elements before registering the new listener.

## Permission Rationale

Slice 1 adds exactly one permission:

```json
"scripting"
```

`scripting` is required for bounded programmatic injection of the already-packaged content script when Chrome permits temporary access to the active tab. The existing `activeTab` permission remains the user-grant boundary.

No other permission expansion is approved. Slice 1 must not add `<all_urls>`, `tabs`, new host permissions, `webRequest`, `identity`, `downloads`, dependency changes, CSP weakening, backend changes, AI changes, visual-only capture, or credential/session extraction.

## activeTab Boundary

Opening or keeping the Side Panel visible does not guarantee that the current active tab still has an `activeTab` grant. For example, a user may invoke Element Catcher on Tab A, switch to old Tab B, and then press Start Capture.

When Chrome does not permit injection because the temporary user grant is missing, Element Catcher must fail closed with actionable product wording. The intended user action is to click the Element Catcher toolbar icon on the current tab, then try Start Capture again.

Element Catcher must not ask for credentials, request persistent all-sites access, or falsely label the page unsupported merely because the temporary grant is missing.

## Privacy And Security Boundary

Element Catcher captures only from the visible browser session the user already has access to. It must not:

- bypass login, authorization, firewalls, paywalls, permissions, or browser controls;
- extract cookies, credentials, tokens, session storage, browser storage, or secrets;
- broaden host permissions;
- remotely fetch private source pages;
- create a cloud capture path;
- add a visual-only screenshot fallback in Slice 1;
- capture inaccessible iframe contents or closed shadow roots.

## Explicit Non-Goals

Slice 1 does not implement:

- universal private-site support;
- capture from Chrome-protected pages;
- capture from all extension pages;
- all-sites persistent access;
- cross-origin iframe DOM capture;
- closed shadow-root access;
- visual-only capture;
- full-page capture;
- backend, AI, GitHub, export, storage schema, or CaptureRecord changes;
- production Chrome Web Store readiness.

## Automated Invariants And Manual Chrome Evidence

The automated checks cover implementation invariants that are not directly observable in manual Chrome use:

- existing content runtime path returns success before any programmatic injection;
- missing Start Capture runtime path performs one bounded injection call and one retry;
- injection failure and retry failure do not create a recovery loop;
- unsupported and browser-protected URL guards prevent recovery injection where applicable;
- Cancel, Parent, Child, Confirm, screenshot completion, and unrelated messages do not trigger recovery injection;
- the recovery path does not reload, navigate, recreate tabs, or broaden privileged APIs;
- content-script reinjection disposes stale Element Catcher runtime state;
- built Manifest permissions remain exactly `activeTab`, `scripting`, and `sidePanel`, with no host-permission broadening.

The manual Chrome results below were confirmed by the real user during local Chrome validation. Together with the automated evidence, they were accepted for M10 Slice 1 at `b0ed05823c530b2b0632c5db3bdb189459719f0d`.

| Area | Scenario | Expected result | Status |
| --- | --- | --- | --- |
| Existing runtime | Open supported ordinary webpage, content script already loaded, Start Capture | Existing accepted capture flow starts normally | Passed |
| Missing runtime recovery | Supported ordinary webpage predates extension reload/install, Start Capture | Selection starts after recovery without source-page reload | Passed |
| Authenticated page | Logged-in ordinary HTTPS app with stateful UI, Start Capture after runtime recovery case | Current UI state remains; selection flow starts if Chrome permits access | Passed |
| Localhost | `http://127.0.0.1/*` or ordinary localhost development page | Intended supported ordinary-webpage scenario where Chrome permissions allow it | Not run in this Slice 1 manual gate |
| Missing activeTab grant | Switch to an old tab after opening Side Panel, then Start Capture | Safe actionable failure telling user to click the toolbar icon on this tab and retry | Passed |
| Chrome protected page | `chrome://settings` page | Fail closed with the product message distinguishing capturable authenticated/private ordinary webpages from Chrome-protected surfaces | Passed |
| Chrome Web Store | Chrome Web Store page | Fail closed with the product message distinguishing capturable authenticated/private ordinary webpages from Chrome-protected surfaces | Passed |
| Cancel/Parent/Child/Confirm | Continue accepted capture flow after recovery | Hover, Lock, Parent, Child, Confirm, and Save remain functional | Passed |
| Console/errors | Recovery and restricted cases | Side Panel Console clean, Service Worker Console clean, extension Errors page clean | Passed |
| No page mutation | Recovery path | Authenticated/session UI state remained preserved; no source-page reload was required | Passed |

Additional user-confirmed manual evidence:

- Normal supported webpage regression passed.
- Authenticated/private ordinary HTTPS page recovery after extension reload passed without source-page reload.
- Original authenticated/session UI state remained preserved.
- Start Capture recovery succeeded after reopening Element Catcher on the source tab.
- Hover, lock, Parent, Child, Confirm, and Save passed after recovery.
- Missing `activeTab` grant and explicit toolbar user-grant behavior passed.
- `chrome://settings` protected-surface boundary passed.
- Chrome Web Store protected-surface boundary passed.
- Side Panel Console was clean.
- Service Worker Console was clean.
- Extension Errors page was clean.
- Screenshots confirmed that both `chrome://settings` and Chrome Web Store fail closed with the correct product message distinguishing many authenticated/private ordinary webpages that Element Catcher can capture from Chrome-protected browser surfaces that it cannot capture.

## Current Status

M10 Slice 1 implementation is complete and accepted at `b0ed05823c530b2b0632c5db3bdb189459719f0d`. Accepted evidence includes focused automated checks, final full Playwright validation with `295 passed / 0 failed / 1 skipped / 0 did not run`, and required real-user Chrome manual validation. Milestone 10 remains Current.

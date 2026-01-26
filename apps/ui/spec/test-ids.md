# UI Test Selectors (`data-testid`) Guidelines

**Application**: `@specify-poker/ui`
**Created**: 2026-01-26
**Status**: Active

## Goal

Make E2E tests (Playwright) resilient and readable by providing stable selectors
that map to **user actions** (clicks, typing, submit) rather than implementation
details (CSS classes, DOM shape).

## Core Rules

1. **Prefer accessibility-first selectors when unambiguous**
   - Use roles/names when the element is unique and the label is stable.
   - Add `data-testid` when there are multiple similar controls, dynamic labels,
     or the element is difficult to target reliably by role.

2. **Treat `data-testid` as a public contract**
   - Changing/removing a `data-testid` is a breaking change for E2E tests.
   - If a rename is unavoidable, coordinate the UI + tests change together.

3. **Put `data-testid` on the interactive element**
   - Buttons/links/inputs should carry the selector (not a wrapper div).

4. **Use semantic, stable names**
   - Use `kebab-case`.
   - Prefix by feature area: `auth-*`, `nav-*`, `lobby-*`, `table-*`, `action-*`, etc.
   - Avoid styling/layout terms like `card`, `grid`, `left-panel`.

5. **Avoid dynamic values inside `data-testid`**
   - Don’t encode IDs/usernames/seat numbers into the test id string.
   - For repeated elements, keep a stable `data-testid` and add `data-*`
     attributes for identity:
     - Lobby: `data-table-id`, `data-seat-id`, `data-seat-number`
     - Action buttons: `data-action`
     - Friends: `data-friend`
     - Moderation: `data-seat-id`, `data-seat-number`

6. **Centralize names**
   - Add new IDs to `apps/ui/src/utils/testIds.ts` and reference them from
     components to prevent drift/typos.

## Playwright Examples

> These are illustrative patterns; choose the narrowest selector that stays
> stable across UI changes.

- Login:
  - `page.getByTestId("auth-login").click()`
- Create table submit:
  - `page.getByTestId("create-table-submit").click()`
- Join seat 1 for a known table id:
  - `page.locator('[data-testid="lobby-join-seat"][data-table-id="..."][data-seat-number="1"]').click()`
- Fold:
  - `page.locator('[data-testid="action-submit"][data-action="Fold"]').click()`
- Send chat:
  - `page.getByTestId("chat-message").fill("gg")`
  - `page.getByTestId("chat-send").click()`

## Current Catalog

The canonical list lives in `apps/ui/src/utils/testIds.ts`.


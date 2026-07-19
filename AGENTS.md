<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project UI/UX rules

This product is a professional internal work system. For every task that creates,
changes, or reviews UI, read and follow `docs/ui-ux-guidelines.md` before editing.
Treat its verification checklist as acceptance criteria, not as optional advice.

Non-negotiable principles:

- When asked to review or improve UI, proactively inspect, implement, and verify
  safe in-scope improvements using this guide. Do not make the user restate these
  preferences or approve routine spacing/layout choices; ask only when a missing
  business decision would materially change the result.
- Optimize for fast work comprehension, not decorative spaciousness. Users must
  be able to identify counts, urgent work, status, and the next action immediately.
- Do not spend the first viewport on hero copy, repeated explanations, oversized
  cards, or empty space. Scrolling caused by real data is acceptable; scrolling
  caused by presentation overhead is a UX defect.
- On dashboards and list pages, keep the page header compact, place summary
  metrics first, and start the primary work list within the first 40% of the
  scrollable content viewport, excluding the global sticky shell, whenever
  practical. Do not apply this density target blindly to forms, document detail,
  calendars, or other screens where accuracy requires more space.
- Use compact rows or tables for repeated records. Use cards only when they add
  meaningful grouping or comparison value.
- Preserve a clear hierarchy: urgent/actionable work first, personal progress
  second, reference/history content afterward.
- Keep controls accessible: semantic structure, visible keyboard focus, readable
  contrast, and at least 44px interaction targets without inflating visual blocks.
- Responsive behavior must preserve priority, not merely stack everything. Mobile
  order is title/primary action -> summary -> primary work -> secondary
  status/history.
- Never trade density for workflow safety. Prevent duplicate submissions, preserve
  user input after validation errors, confirm destructive actions, and ensure
  permission-restricted or sensitive information is never exposed in the UI.
- Reuse design tokens and existing components. Loading, empty, error, and dark-mode
  states must match the density and structure of the final interface.
- Before declaring material layout, responsive, navigation, state, or color work
  complete, visually verify the affected page and states at the relevant baselines
  defined in `docs/ui-ux-guidelines.md`. Use proportional checks for copy-only or
  similarly low-impact changes, then run the proportional automated checks.

#!/usr/bin/env tsx
/**
 * `npm run onboard` — the dashboard, opened on the onboarding page.
 *
 * Kept as its own command because it is the one every piece of documentation
 * names, and because "onboard an application" is a task rather than a place.
 * It is the same server: one process, one route table, one token.
 *
 * **It did not do this until item 70.** The body was `import './dashboard'`
 * and nothing else, so it opened `/` — which `landingPath()` sends to Runs as
 * soon as one application is configured. The command whose name is `onboard`
 * opened the run launcher for everybody except a first-time user, while this
 * comment said otherwise. Driven with five applications on disk to confirm it
 * before believing it.
 *
 * `/` stays adaptive for `npm run dashboard`: onboarding when nothing is
 * configured, runs when something is. That is a deliberate product decision
 * and this does not change it — it asks for a specific page instead of taking
 * the default one.
 */
process.env.DASHBOARD_OPEN_PATH = '/onboard';

/*
   `require`, deliberately. A static `import './dashboard'` is hoisted above
   the assignment above it, so the server would evaluate before the variable
   was set — it happens to work today because the value is read in a `listen`
   callback rather than at module scope, which is a timing accident and not a
   design. This file is CommonJS, so top-level `await import()` is unavailable
   and `require` is the form that runs where it is written. `config/target.ts`
   reaches for it for the same reason.
*/
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('./dashboard');

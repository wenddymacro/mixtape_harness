// lib/client.js — DSH CLIENT half of @local/mixtape-harness.
//
// WHAT IT DOES. The harness dashboard is a separate local HTTP service
// (dashboard_server.py on :8080), normally read inside DSH's right-sidebar
// browser. This half opens that tab by itself when the dashboard is activated,
// instead of making the reader find the Browser panel and type a URL.
//
// HOW "ACTIVATED" IS DECIDED. The dashboard exposes /api/health carrying an
// `instance` id that changes on every process start. This plugin polls it and
// opens the tab when it sees an instance it has not opened before. So:
//
//   * a NEW dashboard activation opens one tab — the whole point; and
//   * a RELOAD of DSH or of the page does NOT open another, because the instance
//     is unchanged and already recorded. A plugin that popped a tab on every
//     reload would be worse than no plugin.
//
// The probe is a cross-origin fetch from the DSH page to localhost:8080, which is
// why the dashboard sends `Access-Control-Allow-Origin: *` on its API routes.
// While the dashboard is down the fetch simply fails — that is its normal state,
// not a fault, so it stays quiet.
//
// ---------------------------------------------------------------------------
// THE CONTRACT, WRITTEN DOWN BECAUSE THE FIRST VERSION OF THIS FILE GOT IT WRONG.
//
// The registration sink is `window.__ModuleLoader__` — TWO leading underscores.
// This file originally said `_ModuleLoader__` (one), copied by eye from a shipped
// bundle in the packaged app, and that crashed the entire web boot with
// `Uncaught ReferenceError: _ModuleLoader__ is not defined` plus a modal the user
// could not get past. The shipped bundles can use the bare name because the build
// wraps them; a hand-written bundle cannot. The authoritative shape is the repo's
// own template, packages/preset/agent-preset/skills/cordis-plugin-development/
// templates/decoration/client.js — `window.__ModuleLoader__.load` with a factory
// that RETURNS the module object.
//
// Hence two rules for this file, both learned the hard way:
//   1. `window.__ModuleLoader__`, and the factory returns `{ inject, apply }`.
//   2. Everything from `apply` inward is wrapped, so the RUNTIME half degrades to
//      "no auto-open" instead of failing the boot.
//
//      NOTE THE LIMIT, because overclaiming here is how the first crash happened:
//      the wrap does NOT protect the registration line below. If the sink is
//      missing or misnamed, nothing registers and the boot fails anyway. That
//      line is covered by `node test.mjs`, which EVALUATES this file against a
//      fake `window.__ModuleLoader__` rather than grepping it — and which was
//      verified to fail when the one-underscore typo is put back.
// ---------------------------------------------------------------------------
window.__ModuleLoader__.load({
	id: "@local/mixtape-harness",
	factory(require) {
		/** The dashboard's URL. Change here if it ever moves off 8080. */
		const DASHBOARD_URL = "http://localhost:8080/";
		const HEALTH_URL = new URL("api/health", DASHBOARD_URL).toString();
		const POLL_MS = 3000;
		/** Which dashboard instance we last opened a tab for. */
		const SEEN_KEY = "mixtape-dashboard:opened-instance";

		function readSeen() {
			try { return localStorage.getItem(SEEN_KEY); } catch { return null; }
		}
		function writeSeen(instance) {
			try { localStorage.setItem(SEEN_KEY, instance); } catch { /* private mode: we simply reopen */ }
		}

		/** @returns the health payload, or null when the dashboard is not up. */
		/**
		 * Fire-and-forget note to the dashboard about what happened, so the server
		 * side can tell "polling" apart from "actually opened". Never awaited and
		 * never allowed to throw.
		 * @param what - 'opened' or 'error'.
		 */
		function report(what) {
			try { fetch(HEALTH_URL + "?report=" + what, { cache: "no-store", mode: "cors" }).catch(() => {}) }
			catch { /* nothing about reporting may affect opening */ }
		}

		async function probe() {
			try {
				const res = await fetch(HEALTH_URL, { cache: "no-store", mode: "cors" });
				if (!res.ok) return null;
				const body = await res.json();
				return body && body.ok ? body : null;
			} catch {
				return null; // not running, or refused cross-origin: both mean "no tab"
			}
		}

		return {
			/** Client services this plugin needs: the right Sidebar, for openTab. */
			inject: ["sidebarRight"],

			/**
			 * Watch for a newly activated dashboard and open it in the sidebar.
			 * Wrapped so that nothing here can propagate into the boot sequence.
			 * @param ctx - Client root context.
			 */
			apply(ctx) {
				let timer = null;
				let inFlight = false;

				async function tick() {
					if (inFlight) return;            // never stack probes on a slow network
					inFlight = true;
					try {
						const health = await probe();
						if (health === null) return;
						if (readSeen() === health.instance) return;   // already open for this activation
						ctx.sidebarRight.openTab("browser", { params: { url: DASHBOARD_URL } });
						writeSeen(health.instance);
						report("opened");
					} catch {
						// Sidebar not mounted yet, or the profile has the Browser tab type
						// switched off. Leave it UNRECORDED so the next tick retries rather
						// than marking an activation as handled that never opened.
						report("error");
					} finally {
						inFlight = false;
					}
				}

				function start() {
					void tick();
					return setInterval(() => { void tick(); }, POLL_MS);
				}

				try {
					if (typeof ctx.effect === "function") {
						ctx.effect(() => {
							timer = start();
							return () => { if (timer !== null) { clearInterval(timer); timer = null; } };
						}, "mixtape-harness: open the dashboard when it is activated");
					} else {
						timer = start();
					}
				} catch (err) {
					// Degrade to "no auto-open" rather than failing the boot. If this
					// fires, /dashboard and code/open_dashboard.sh are the fallback.
					console.warn("[mixtape-harness] dashboard auto-open unavailable:", err);
				}
			},
		};
	},
});

// If the sidebar Browser is unavailable, the profile-level answer is
// `- id: ui-sidebar-browser` / `disabled: false` in the profile patch: the README
// reports the tool as enabled on Desktop and DISABLED by default in Web profiles.
// With it off, openTab refuses, the instance is never recorded, and this plugin
// retries forever without succeeding — visible in the client console, not silent.

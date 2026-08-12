import type { CDPSession, Page } from '@playwright/test';

/**
 * The embedded live view — §08, phase 2.
 *
 * Playwright's video recorder finalises its file when the context closes, so
 * there is nothing to relay while a test is running. Chromium's DevTools
 * protocol does have a live feed: `Page.startScreencast` pushes JPEG frames as
 * the page paints. Measured against a real site before this was written — 235
 * frames in 5.1 seconds, about 46 a second at 72 KB each.
 *
 * Which is far more than anyone needs, and 6 MB/s for two runs. So it is
 * throttled hard: roughly eight frames a second at a size that suits the tile
 * it is going into, which is about 400 KB/s for both views together.
 *
 * Two honest limits, both stated rather than worked around:
 *
 *  - **Chromium only.** It is a CDP capability. A Firefox or WebKit run says so
 *    instead of showing a black rectangle.
 *  - **Pixels, one way.** The tile is something to watch, never something to
 *    click into. Anything that looked interactive and was not would be worse
 *    than no picture.
 */

export interface LiveViewTarget {
  /** Where to post frames. The dashboard's own address. */
  dashboardUrl: string;
  /** The session token; the endpoint refuses without it. */
  token: string;
  /** Which run these frames belong to. */
  runId: string;
}

/** Read the live-view settings a run was started with, or null. */
export function liveViewFromEnv(env: NodeJS.ProcessEnv = process.env): LiveViewTarget | null {
  if (env.LIVE_VIEW !== '1') return null;
  const dashboardUrl = env.DASHBOARD_URL;
  const token = env.DASHBOARD_TOKEN;
  const runId = env.RUN_ID;
  if (!dashboardUrl || !token || !runId) return null;
  return { dashboardUrl, token, runId };
}

/** Frame size for the tile as it currently is on screen. */
export const FRAME_SIZES = {
  /** The default tile in the runs page. */
  embedded: { maxWidth: 640, maxHeight: 400, quality: 50 },
  /**
   * Expanded to fill the window. Sending 640px frames into a full window is a
   * blur, and sending 1280px into a 400px tile is waste — so the size follows
   * the tile rather than being picked once.
   */
  expanded: { maxWidth: 1280, maxHeight: 800, quality: 60 },
} as const;

/** Eight frames a second. Enough to read, far below what the protocol offers. */
export const MIN_FRAME_INTERVAL_MS = 125;

/**
 * Whether this frame should be sent, given when the last one went.
 *
 * Pure, so the throttle is testable without a browser — and it is worth
 * testing, because an off-by-one here is the difference between 8 frames a
 * second and 46.
 */
export function shouldSendFrame(now: number, lastSentAt: number, minIntervalMs = MIN_FRAME_INTERVAL_MS): boolean {
  return now - lastSentAt >= minIntervalMs;
}

export type StopScreencast = () => Promise<void>;

/**
 * Attach a live view to a page, and return the thing that detaches it.
 *
 * Never throws. A run must not fail because nobody could watch it — if CDP is
 * unavailable, if the browser is not Chromium, if the dashboard has gone away,
 * the run carries on and the tile simply stays empty.
 */
export async function attachLiveView(
  page: Page,
  target: LiveViewTarget,
  options: { fetch?: typeof fetch; now?: () => number } = {},
): Promise<StopScreencast> {
  const send = options.fetch ?? fetch;
  const now = options.now ?? (() => Date.now());

  let session: CDPSession | null = null;
  let lastSentAt = 0;
  let size: keyof typeof FRAME_SIZES = 'embedded';
  let stopped = false;

  try {
    session = await page.context().newCDPSession(page);
  } catch {
    // Not Chromium, or CDP refused. The run is unaffected.
    return async () => undefined;
  }

  const start = async (): Promise<void> => {
    await cdp.send('Page.startScreencast', { format: 'jpeg', ...FRAME_SIZES[size] });
  };

  const cdp = session;
  cdp.on('Page.screencastFrame', (frame: { data: string; sessionId: number }) => {
    /*
       Acknowledge every frame, send some of them. Chromium stops producing
       frames until the last is acked, so skipping the ack to skip a frame
       stalls the feed rather than thinning it.
    */
    void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => undefined);
    if (stopped || !shouldSendFrame(now(), lastSentAt)) return;
    lastSentAt = now();

    /*
       Fire and forget. Awaiting the post inside the frame handler would put the
       dashboard's latency inside the test's, which is the one thing a live view
       must never do — a watched run that runs differently is not the run you
       wanted to watch.
    */
    void send(`${target.dashboardUrl}api/runs/frame`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-onboard-token': target.token },
      body: JSON.stringify({ id: target.runId, frame: frame.data }),
    })
      .then(async (response) => {
        // The reply says whether the tile is expanded, so the frame size can
        // follow it without a second channel.
        const wanted = ((await response.json()) as { expanded?: boolean }).expanded
          ? 'expanded'
          : 'embedded';
        if (wanted !== size && !stopped) {
          size = wanted;
          await cdp.send('Page.stopScreencast').catch(() => undefined);
          await start().catch(() => undefined);
        }
      })
      .catch(() => undefined);
  });

  try {
    await start();
  } catch {
    return async () => undefined;
  }

  return async () => {
    stopped = true;
    await session?.send('Page.stopScreencast').catch(() => undefined);
    await session?.detach().catch(() => undefined);
  };
}

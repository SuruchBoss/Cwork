// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * The machinery behind film.mjs: a server for the stage and the product, a
 * recorder, and a director that moves the cursor and types like a person.
 * None of it knows what the film says; film.mjs does.
 */
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, relative } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

function sendFile(res, root, pathname) {
  const path = normalize(decodeURIComponent(pathname)).replace(/^\/+/, '');
  let file = join(root, path);
  // Both apps route on the client, so an unknown path is the app's index.
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(root, 'index.html');
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}

/**
 * One server, three kinds of host, all on loopback:
 *
 *   stage.localhost   the stage page
 *   app.localhost     the employee app's web build
 *   <anything>.localhost  the console, with /api passed through to the API
 *
 * Each console role gets its own host (hr.localhost, pay.localhost, …) because
 * a host is an origin, and an origin has its own localStorage: that is what
 * lets three people be signed in at once in one browser. Chromium resolves
 * *.localhost to loopback by itself and treats it as a secure context, which
 * the app's encrypted storage needs.
 */
export async function serve({ port, stageDir, consoleDir, appDir, api }) {
  const upstream = new URL(api);
  const server = createServer((req, res) => {
    const host = (req.headers.host ?? '').split(':')[0];
    const { pathname } = new URL(req.url, 'http://x');
    if (host === 'stage.localhost')
      return sendFile(res, stageDir, pathname === '/' ? 'stage.html' : pathname);
    if (host === 'app.localhost') return sendFile(res, appDir, pathname);
    if (pathname.startsWith('/api/')) {
      const out = request(
        {
          hostname: upstream.hostname,
          port: upstream.port,
          path: req.url,
          method: req.method,
          headers: { ...req.headers, host: upstream.host },
        },
        (reply) => {
          res.writeHead(reply.statusCode ?? 502, reply.headers);
          reply.pipe(res);
        },
      );
      out.on('error', () => {
        res.writeHead(502);
        res.end();
      });
      return req.pipe(out);
    }
    return sendFile(res, consoleDir, pathname);
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  return server;
}

/** The console's production build, made if it is not there. */
export function buildConsole(repo) {
  const dist = join(repo, 'web', 'dist');
  if (!existsSync(join(dist, 'index.html'))) {
    execFileSync('npm', ['run', 'build'], { cwd: join(repo, 'web'), stdio: 'inherit' });
  }
  return dist;
}

/**
 * The employee app built for the web in a throwaway copy — the project targets
 * Android and iOS, and `flutter create --platforms=web` writes files it does
 * not keep. Same approach as docs/screenshots/capture-mobile.mjs.
 */
export function buildApp(repo, api) {
  if (process.env.MOBILE_WEB_BUILD) return process.env.MOBILE_WEB_BUILD;
  const work = join(tmpdir(), 'cwork-film-app');
  rmSync(work, { recursive: true, force: true });
  cpSync(join(repo, 'mobile'), work, {
    recursive: true,
    filter: (src) => !/^(build|\.dart_tool)(\/|$)/.test(relative(join(repo, 'mobile'), src)),
  });
  const flutter = (...args) => execFileSync('flutter', args, { cwd: work, stdio: 'inherit' });
  flutter('create', '--platforms=web', '.');
  flutter('build', 'web', `--dart-define=API_BASE_URL=${api}`);
  return join(work, 'build', 'web');
}

/**
 * Answers what the pages fetch from Google without the browser going there:
 * CanvasKit from the app's own build, fonts through Node (which honours the
 * proxy and CA settings the bundled browser does not). `fonts` collects the
 * families that arrived, so a run can refuse to record a fallback face.
 */
export async function routeGoogle(context, appDir, fonts) {
  await context.route(/^https:\/\/www\.gstatic\.com\/flutter-canvaskit\/[0-9a-f]+\//, (route) => {
    const file = route
      .request()
      .url()
      .replace(/^.*\/flutter-canvaskit\/[0-9a-f]+\//, '');
    return route.fulfill({
      contentType: TYPES[extname(file)] ?? 'application/octet-stream',
      body: readFileSync(join(appDir, 'canvaskit', file)),
    });
  });
  const UA =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
  await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
    try {
      const res = await fetch(route.request().url(), { headers: { 'user-agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const family = route.request().url().split('/')[4];
      if (family) fonts.add(family);
      await route.fulfill({
        contentType: res.headers.get('content-type') ?? 'application/octet-stream',
        body: Buffer.from(await res.arrayBuffer()),
      });
    } catch {
      await route.abort();
    }
  });
}

/**
 * Records a page as it plays, from Chromium's own compositor.
 *
 * The screencast sends a frame whenever the screen changes, with the time it
 * was drawn; a still screen sends nothing. The frames go to disk as they come,
 * and encode() turns them into constant-rate video by holding each frame until
 * the next one — so a pause in the film is a pause, not a skipped second.
 */
export async function record(page, dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = join(dir, `${String(frames.length).padStart(6, '0')}.jpg`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ file, t: metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: 1920,
    maxHeight: 1080,
    everyNthFrame: 1,
  });
  return async () => {
    const end = Date.now() / 1000;
    await cdp.send('Page.stopScreencast');
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { frames, end };
  };
}

/** Frames to an H.264 file at a constant 30 fps, silent, ready to stream. */
export function encode({ frames, end }, out, dir) {
  const list = join(dir, 'frames.txt');
  const lines = [];
  frames.forEach((frame, i) => {
    const next = i + 1 < frames.length ? frames[i + 1].t : end;
    lines.push(`file '${frame.file}'`, `duration ${Math.max(0.001, next - frame.t).toFixed(4)}`);
  });
  // The concat demuxer ignores the last duration unless the file repeats.
  lines.push(`file '${frames.at(-1).file}'`);
  writeFileSync(list, lines.join('\n'));
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    list,
    '-vf',
    'fps=30,format=yuv420p',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '24',
    '-tune',
    'animation',
    '-movflags',
    '+faststart',
    '-an',
    out,
  ]);
}

/**
 * Moves and clicks like a person, on whatever is in front of the camera.
 *
 * Every target is resolved to stage coordinates first — through the iframe it
 * lives in, and through whatever scale the stage has that iframe at — so the
 * drawn cursor, the real pointer and the element all agree. The drawn cursor
 * glides on a CSS transition; the real pointer lands when it does.
 */
export function director(page) {
  let pos = { x: 960, y: 1200 };
  const pause = (ms) => page.waitForTimeout(ms);

  async function stageBox(frameId, locator) {
    await locator.waitFor({ state: 'attached', timeout: 20000 });
    const inner = await locator.evaluate((el) => {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    const outer = await page.evaluate((id) => {
      const f = document.getElementById(id);
      const r = f.getBoundingClientRect();
      return { x: r.x, y: r.y, scale: r.width / f.clientWidth };
    }, frameId);
    return {
      x: outer.x + inner.x * outer.scale,
      y: outer.y + inner.y * outer.scale,
      w: inner.w * outer.scale,
      h: inner.h * outer.scale,
    };
  }

  async function glide(x, y, ms) {
    const d = Math.hypot(x - pos.x, y - pos.y);
    const time = ms ?? Math.round(Math.min(620, Math.max(260, d * 0.6)));
    await page.evaluate(([x, y, t]) => window.film.cursorTo(x, y, t), [x, y, time]);
    await pause(time);
    await page.mouse.move(x, y);
    pos = { x, y };
  }

  return {
    pause,
    stageBox,
    glide,
    /** Glides to an element (optionally a point within it) and clicks it. */
    async click(frameId, locator, { dx = 0.5, dy = 0.5, hold = 170 } = {}) {
      const b = await stageBox(frameId, locator);
      await glide(b.x + b.w * dx, b.y + b.h * dy);
      await pause(80);
      await page.evaluate(() => window.film.click());
      await page.mouse.down();
      await page.mouse.up();
      await pause(hold);
      return b;
    },
    /** Clicks into a field and types into it at a readable pace. */
    async type(frameId, locator, text, { delay = 45 } = {}) {
      await this.click(frameId, locator);
      await page.keyboard.type(text, { delay });
      await pause(220);
    },
    /** Picks a <select> option the way the result looks, without a native popup the camera cannot see. */
    async choose(frameId, locator, option) {
      await this.click(frameId, locator, { hold: 120 });
      await locator.selectOption(option);
      await page.keyboard.press('Escape').catch(() => {});
      await pause(380);
    },
    async park() {
      await glide(1860, 1040, 500);
    },
  };
}

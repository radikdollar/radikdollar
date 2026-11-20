/* ==========================================================================
   RADIKDOLLAR — main.js
   Self-contained runtime (works on HTTP/HTTPS and file:// without CORS errors)
   ========================================================================== */
(function () {
  'use strict';

  const mq = (q) => window.matchMedia(q).matches;
  const reduced = mq('(prefers-reduced-motion: reduce)');
  const fine = mq('(hover: hover) and (pointer: fine)');
  const touch = !fine;
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const lowPower = saveData || (navigator.hardwareConcurrency || 4) <= 4;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (k, dt) => 1 - Math.pow(1 - k, dt * 60);
  const smoothstep = (t) => t * t * (3 - 2 * t);

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---- Single rAF Ticker ---- */
  const subs = new Set();
  let running = false;
  let lastTime = 0;

  function loop(t) {
    const dt = Math.min((t - lastTime) / 1000, 1 / 20);
    lastTime = t;
    subs.forEach((fn) => fn(t, dt));
    if (subs.size) requestAnimationFrame(loop);
    else running = false;
  }

  function tick(fn) {
    subs.add(fn);
    if (!running) {
      running = true;
      lastTime = performance.now();
      requestAnimationFrame(loop);
    }
    return () => subs.delete(fn);
  }

  /* ---- Debounced Resize ---- */
  const resizeSubs = new Set();
  let rTimer = 0;
  let lastW = window.innerWidth;
  window.addEventListener('resize', () => {
    clearTimeout(rTimer);
    rTimer = setTimeout(() => {
      if (touch && window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      resizeSubs.forEach((fn) => fn());
    }, 150);
  });
  const onResize = (fn) => (resizeSubs.add(fn), () => resizeSubs.delete(fn));

  /* ---- Pointer State ---- */
  const pointer = {
    x: window.innerWidth * 0.5,
    y: window.innerHeight * 0.45,
    moved: false,
    down: false,
    inside: false,
  };

  window.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.moved = true;
    pointer.inside = true;
  }, { passive: true });
  window.addEventListener('pointerdown', () => { pointer.down = true; }, { passive: true });
  window.addEventListener('pointerup', () => { pointer.down = false; }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { pointer.inside = false; });

  /* ---- Native Scroll State ---- */
  const scroll = {
    y: window.scrollY,
    v: 0,
    vh: window.innerHeight,
    max: 1,
  };

  function measureScroll() {
    scroll.vh = window.innerHeight;
    scroll.max = Math.max(1, document.documentElement.scrollHeight - scroll.vh);
  }

  function initScroll() {
    measureScroll();
    onResize(measureScroll);
    if ('ResizeObserver' in window) {
      new ResizeObserver(measureScroll).observe(document.body);
    }
    tick((t, dt) => {
      const y = window.scrollY;
      const rawV = y - scroll.y;
      scroll.v = lerp(scroll.v, rawV, damp(0.22, dt));
      scroll.y = y;
    });
  }

  /* ---- Hero Big Display Text Fitting & Cursor-Proximity Variable Type ---- */
  function initHeroType() {
    const lines = $$('[data-fit="hero"]');
    if (!lines.length) return;
    const hero = $('.hero');
    const chars = lines.flatMap((line) => $$('.ch', line).map((el) => ({ el, f: 0, w: 0, x: 0, y: 0 })));
    let box = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };

    function fitAndMeasure() {
      const root = document.documentElement;
      root.classList.add('is-fitting');

      const TEST = 100;
      const parent = lines[0].parentElement;
      const avail = parent.clientWidth;

      lines.forEach((el) => {
        el.style.setProperty('--fs', TEST + 'px');
      });
      const widths = lines.map((el) => {
        const first = el.firstElementChild;
        const last = el.lastElementChild;
        if (!first || !last) return el.scrollWidth;
        return last.getBoundingClientRect().right - first.getBoundingClientRect().left;
      });
      lines.forEach((el, i) => {
        const w = widths[i];
        if (w > 0 && avail > 0) {
          el.style.setProperty('--fs', ((TEST * avail) / w * 0.992).toFixed(2) + 'px');
        }
      });

      const sy = window.scrollY;
      if (hero) {
        const hr = hero.getBoundingClientRect();
        box = { x: hr.left, y: hr.top + sy, w: hr.width, h: hr.height };
      }
      chars.forEach((c) => {
        const r = c.el.getBoundingClientRect();
        c.x = r.left + r.width * 0.5;
        c.y = r.top + sy + r.height * 0.5;
      });

      root.classList.remove('is-fitting');
    }

    fitAndMeasure();
    onResize(fitAndMeasure);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(fitAndMeasure);
      document.fonts.addEventListener?.('loadingdone', fitAndMeasure);
    }

    if (reduced) return;

    let visible = true;
    if (hero && 'IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(hero);
    }

    let lastMove = touch ? -1e9 : 0;
    let everMoved = false;

    tick((t, dt) => {
      if (!visible) return;
      if (pointer.moved) {
        pointer.moved = false;
        lastMove = t;
        everMoved = true;
      }

      const sy = window.scrollY;
      const ghost = touch ? (t - lastMove > 1200) : (!everMoved || t - lastMove > 6000 || !pointer.inside);
      const k = damp(ghost ? 0.05 : 0.14, dt);

      let px, py;
      if (ghost) {
        const ts = t * 0.00032;
        px = box.x + box.w * (0.5 + 0.44 * Math.sin(ts * 1.3));
        py = box.y + box.h * (0.5 + 0.22 * Math.sin(ts * 2.1 + 1));
      } else {
        px = pointer.x;
        py = pointer.y + sy;
      }

      const R = Math.max(240, window.innerWidth * 0.26);
      for (const c of chars) {
        const dx = px - c.x;
        const dy = (py - c.y) * 1.35;
        const target = smoothstep(1 - clamp(Math.hypot(dx, dy) / R));
        c.f = lerp(c.f, target, k);
        if (Math.abs(c.f - c.w) < 0.003) continue;
        c.w = c.f;
        const s = c.el.style;
        s.setProperty('--d', lerp(151, 32, c.f).toFixed(1));
        s.setProperty('--w', lerp(900, 180, c.f).toFixed(0));
        s.setProperty('--s', lerp(0, -10, c.f).toFixed(2));
      }
    });
  }

  /* ---- Navigation, Mobile Menu, Progress Bar, Clock ---- */
  function initNav() {
    const menu = $('#menu');
    const toggleBtn = $('[data-menu-toggle]');
    const toggleLabel = $('[data-menu-label]');

    function setMenu(open) {
      if (!menu || !toggleBtn) return;
      toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (toggleLabel) toggleLabel.textContent = open ? 'Close' : 'Menu';
      if (open) {
        menu.hidden = false;
        requestAnimationFrame(() => menu.classList.add('is-open'));
        document.documentElement.style.overflow = 'hidden';
      } else {
        menu.classList.remove('is-open');
        document.documentElement.style.overflow = '';
        setTimeout(() => {
          if (toggleBtn.getAttribute('aria-expanded') === 'false') menu.hidden = true;
        }, 320);
      }
    }

    toggleBtn?.addEventListener('click', () => {
      const isOpen = toggleBtn.getAttribute('aria-expanded') === 'true';
      setMenu(!isOpen);
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && toggleBtn?.getAttribute('aria-expanded') === 'true') {
        setMenu(false);
      }
    });

    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const hash = a.getAttribute('href');
      const target = hash === '#' || hash === '#top' ? null : document.getElementById(hash.slice(1));
      if (hash !== '#' && hash !== '#top' && !target) return;
      e.preventDefault();
      if (toggleBtn?.getAttribute('aria-expanded') === 'true') setMenu(false);

      const behavior = reduced ? 'auto' : 'smooth';
      if (target) target.scrollIntoView({ behavior, block: 'start' });
      else window.scrollTo({ top: 0, behavior });

      history.replaceState(null, '', hash === '#' ? location.pathname : hash);
    });

    // Scroll progress bar
    const bar = $('.hdr__progress span');
    if (bar) {
      let lastP = -1;
      tick(() => {
        const p = clamp(scroll.y / scroll.max, 0, 1);
        if (Math.abs(p - lastP) < 0.0005) return;
        lastP = p;
        bar.style.setProperty('--p', p.toFixed(4));
      });
    }

    // Current section highlight
    const links = $$('.hdr__nav a[href^="#"]');
    if (links.length && 'IntersectionObserver' in window) {
      const byId = new Map(links.map((l) => [l.getAttribute('href').slice(1), l]));
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          const l = byId.get(e.target.id);
          if (!l) return;
          if (e.isIntersecting) {
            links.forEach((x) => { x.classList.remove('is-current'); x.removeAttribute('aria-current'); });
            l.classList.add('is-current');
            l.setAttribute('aria-current', 'true');
          }
        });
      }, { rootMargin: '-38% 0px -55% 0px' });
      byId.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
    }

    // Synchronized Atlanta clock
    const clocks = $$('[data-clock]');
    if (clocks.length) {
      let fmt = null;
      try {
        fmt = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'America/New_York',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hourCycle: 'h23',
        });
      } catch { fmt = null; }
      const updateClock = () => {
        const now = new Date();
        const s = fmt ? fmt.format(now) : now.toTimeString().slice(0, 8);
        clocks.forEach((c) => { c.textContent = s; c.dateTime = now.toISOString(); });
      };
      updateClock();
      setInterval(updateClock, 1000);
    }

    $$('[data-year]').forEach((y) => { y.textContent = new Date().getFullYear(); });
  }

  /* ---- Reliable Progressive Scroll Reveals ---- */
  function initReveal() {
    const els = $$('[data-reveal]');
    if (!els.length) return;
    if (reduced || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('is-in'));
      return;
    }

    const vh = window.innerHeight;
    els.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < vh * 0.96) el.classList.add('is-in');
    });

    document.documentElement.classList.add('reveal-ready');

    const io = new IntersectionObserver((entries) => {
      const entering = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

      entering.forEach((e, i) => {
        const el = e.target;
        el.style.setProperty('--rd', Math.min(i, 6) * 55 + 'ms');
        el.classList.add('is-in');
        io.unobserve(el);
        setTimeout(() => el.style.removeProperty('--rd'), 1100 + i * 55);
      });
    }, { rootMargin: '0px 0px -4% 0px', threshold: 0.01 });

    els.forEach((el) => {
      if (!el.classList.contains('is-in')) io.observe(el);
    });
  }

  /* ---- 3D Card Tilt & Surface Lighting (Artist Pass, CD Case, Video, Channels, Chrome Plate) ---- */
  function initTilt() {
    if (reduced) return;
    const items = $$('[data-tilt]').map((el, i) => ({
      el,
      i,
      max: el.dataset.tilt === 'strong' ? 20 : 10,
      hover: false,
      on: true,
      rx: 0,
      ry: 0,
      nx: 0.35,
      ny: 0.25,
      tx: 0,
      ty: 0,
      tnx: 0.35,
      tny: 0.25,
    }));
    if (!items.length) return;

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          const it = items.find((x) => x.el === e.target);
          if (it) it.on = e.isIntersecting;
        });
      });
      items.forEach((it) => io.observe(it.el));
    }

    if (fine) {
      items.forEach((it) => {
        it.el.addEventListener('pointerenter', () => { it.hover = true; });
        it.el.addEventListener('pointerleave', () => {
          it.hover = false;
          it.tx = 0;
          it.ty = 0;
          it.tnx = 0.35;
          it.tny = 0.25;
        });
        it.el.addEventListener('pointermove', (e) => {
          const r = it.el.getBoundingClientRect();
          if (!r.width || !r.height) return;
          it.tnx = clamp((e.clientX - r.left) / r.width);
          it.tny = clamp((e.clientY - r.top) / r.height);
          it.tx = -(it.tny - 0.5) * 2 * it.max;
          it.ty = (it.tnx - 0.5) * 2 * it.max;
        }, { passive: true });
      });
    }

    tick((t, dt) => {
      for (const it of items) {
        if (!it.on) continue;

        if (!fine) {
          if (it.el.classList.contains('idcard') || it.el.classList.contains('cd') || it.el.classList.contains('plate')) {
            it.tx = Math.sin(t * 0.0009 + it.i) * (it.max * 0.35);
            it.ty = Math.cos(t * 0.0007 + it.i * 1.4) * (it.max * 0.45);
            it.tnx = 0.5 + it.ty / (it.max * 2);
            it.tny = 0.5 - it.tx / (it.max * 2);
          }
        }

        const d = Math.abs(it.tx - it.rx) + Math.abs(it.ty - it.ry);
        if (!it.hover && fine && d < 0.04) continue;

        const k = damp(it.hover ? 0.16 : 0.08, dt);
        it.rx = lerp(it.rx, it.tx, k);
        it.ry = lerp(it.ry, it.ty, k);
        it.nx = lerp(it.nx, it.tnx, k);
        it.ny = lerp(it.ny, it.tny, k);

        const s = it.el.style;
        s.setProperty('--rx', it.rx.toFixed(2) + 'deg');
        s.setProperty('--ry', it.ry.toFixed(2) + 'deg');
        s.setProperty('--mx', (it.nx * 100).toFixed(1) + '%');
        s.setProperty('--my', (it.ny * 100).toFixed(1) + '%');
        s.setProperty('--px', (it.nx * 100).toFixed(1) + '%');
        s.setProperty('--py', (it.ny * 100).toFixed(1) + '%');
        s.setProperty('--angle', (115 + (it.nx - 0.5) * 70 + (it.ny - 0.5) * 35).toFixed(1));
      }
    });
  }

  /* ---- 3D CD Jewel Case & Spinning Disc ---- */
  function initCD() {
    $$('[data-cd]').forEach((cd) => {
      const disc = $('.cd__disc', cd);
      const setEject = (v) => cd.classList.toggle('is-ejected', v);

      if (fine) {
        cd.addEventListener('pointerenter', () => setEject(true));
        cd.addEventListener('pointerleave', () => setEject(false));
      }
      cd.addEventListener('click', () => setEject(!cd.classList.contains('is-ejected')));
      cd.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setEject(!cd.classList.contains('is-ejected'));
        }
      });

      let on = true;
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(([e]) => { on = e.isIntersecting; }).observe(cd);
        if (!fine) {
          new IntersectionObserver(
            ([e]) => setEject(e.isIntersecting),
            { rootMargin: '-28% 0px -28% 0px' }
          ).observe(cd);
        }
      }

      if (reduced || !disc) return;
      let angle = 0;
      let speed = 15;
      tick((t, dt) => {
        if (!on && speed < 1) return;
        const ejected = cd.classList.contains('is-ejected');
        const targetSpeed = (ejected ? 85 : 16) + Math.min(Math.abs(scroll.v) * 24, 520);
        speed = lerp(speed, targetSpeed, damp(0.06, dt));
        angle = (angle + speed * dt) % 360;
        disc.style.setProperty('--angle', angle.toFixed(1));
      });
    });
  }

  /* ---- Velocity-Reactive Marquee ---- */
  function initMarquee() {
    if (reduced) return;
    $$('[data-ticker]').forEach((track) => {
      const kids = track.children;
      const half = Math.floor(kids.length / 2);
      let loopW = 1;
      const measure = () => {
        loopW = kids[half]
          ? kids[half].offsetLeft - kids[0].offsetLeft
          : track.scrollWidth / 2;
      };
      measure();
      onResize(measure);
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(measure);
      }

      let on = true;
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(([e]) => { on = e.isIntersecting; }).observe(track.parentElement);
      }

      let x = 0;
      let dir = -1;
      let speed = 52;
      tick((t, dt) => {
        if (!on) return;
        if (Math.abs(scroll.v) > 0.6) dir = scroll.v > 0 ? -1 : 1;
        const target = 52 + Math.min(Math.abs(scroll.v) * 14, 650);
        speed = lerp(speed, target, damp(0.08, dt));
        x += dir * speed * dt;
        if (loopW > 0) x = ((x % loopW) - loopW) % loopW;
        track.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
      });
    });
  }

  /* ---- Desktop Ambient Cursor Glow ---- */
  function initCursor() {
    if (!fine) return;
    const glow = $('.cursor-glow');
    if (!glow) return;

    let gx = pointer.x;
    let gy = pointer.y;

    tick((t, dt) => {
      glow.classList.toggle('is-active', pointer.inside);
      const kg = damp(0.12, dt);
      gx = lerp(gx, pointer.x, kg);
      gy = lerp(gy, pointer.y, kg);
      glow.style.transform = `translate3d(${gx.toFixed(1)}px,${gy.toFixed(1)}px,0)`;
    });
  }

  /* ---- Hero WebGL Atmospheric Liquid-Chrome Shader ---- */
  function initHeroGL(canvas) {
    if (!canvas) return;
    const gl = canvas.getContext('webgl', {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    });
    if (!gl) return;

    const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}';
    const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;
uniform float u_scroll;

float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);
  vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),u.x),
             mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),u.x),u.y);
}
float fbm(vec2 p){
  float v=0.0,a=0.5;
  mat2 m=mat2(1.6,1.2,-1.2,1.6);
  for(int i=0;i<4;i++){v+=a*noise(p);p=m*p;a*=0.5;}
  return v;
}
void main(){
  vec2 uv=gl_FragCoord.xy/u_res;
  vec2 p=(gl_FragCoord.xy-0.5*u_res)/u_res.y;
  vec2 m=(u_mouse-0.5*u_res)/u_res.y;
  float t=u_time*0.045;

  vec2 dm=p-m;
  float lens=exp(-dot(dm,dm)*6.5);
  p+=dm*0.18*lens;

  vec2 q=vec2(fbm(p*1.2+vec2(0.0,t)),fbm(p*1.2+vec2(5.2,1.3)-t));
  vec2 r=vec2(fbm(p*1.4+2.0*q+vec2(1.7,9.2)+t*0.7),fbm(p*1.4+2.0*q+vec2(8.3,2.8)-t*0.5));
  float f=fbm(p*1.0+2.3*r+vec2(0.0,u_scroll*0.5));

  float band=0.5+0.5*sin(f*10.0+r.x*4.5-u_scroll*1.2);
  float c=pow(band,4.0);
  float rim=pow(band,16.0);

  vec3 col=vec3(0.024,0.024,0.032)+vec3(0.38)*c+vec3(0.48)*rim;
  col+=vec3(0.28,0.06,0.03)*smoothstep(0.45,0.95,c)*0.16;
  col+=vec3(0.11,0.05,0.035)*lens;

  float v=smoothstep(1.3,0.25,length((uv-0.5)*vec2(1.2,1.0)));
  col*=0.35+0.65*v;
  gl_FragColor=vec4(col,1.0);
}`;

    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };

    let prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch {
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uMouse = gl.getUniformLocation(prog, 'u_mouse');
    const uScroll = gl.getUniformLocation(prog, 'u_scroll');

    const scale = lowPower || touch ? 0.35 : 0.5;
    let W = 0;
    let H = 0;
    let rect = canvas.getBoundingClientRect();

    const resize = () => {
      rect = canvas.getBoundingClientRect();
      const w = Math.max(2, Math.round(rect.width * scale));
      const h = Math.max(2, Math.round(rect.height * scale));
      if (w === W && h === H) return;
      W = canvas.width = w;
      H = canvas.height = h;
      gl.viewport(0, 0, W, H);
    };
    resize();
    onResize(resize);

    let visible = true;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
    }

    const mouse = { x: 0.6, y: 0.45 };
    const draw = (time) => {
      gl.uniform2f(uRes, W, H);
      gl.uniform1f(uTime, time * 0.001 + 12.0);
      gl.uniform2f(uMouse, mouse.x * W, (1 - mouse.y) * H);
      gl.uniform1f(uScroll, scroll.y / Math.max(1, scroll.vh));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    draw(0);
    canvas.classList.add('is-ready');
    if (reduced) return;

    tick((t, dt) => {
      if (!visible) return;
      let tx, ty;
      if (touch || !pointer.inside) {
        tx = 0.5 + 0.25 * Math.sin(t * 0.00025);
        ty = 0.45 + 0.18 * Math.cos(t * 0.00032);
      } else {
        tx = (pointer.x - rect.left) / Math.max(1, rect.width);
        ty = (pointer.y - rect.top) / Math.max(1, rect.height);
      }
      const k = damp(0.06, dt);
      mouse.x = lerp(mouse.x, tx, k);
      mouse.y = lerp(mouse.y, ty, k);
      draw(t);
    });
  }

  /* ---- Lazy YouTube Video Player ---- */
  function initVideo() {
    const pad = (n) => String(n).padStart(2, '0');
    $$('[data-video]').forEach((box) => {
      const id = box.dataset.video;
      const btn = $('.video__play', box);
      const tc = $('[data-timecode]', box);
      let playing = false;

      box.addEventListener('pointerenter', () => {
        ['https://www.youtube-nocookie.com', 'https://i.ytimg.com'].forEach((href) => {
          const l = document.createElement('link');
          l.rel = 'preconnect';
          l.href = href;
          document.head.append(l);
        });
      }, { once: true });

      btn?.addEventListener('click', () => {
        playing = true;
        const f = document.createElement('iframe');
        f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&playsinline=1`;
        f.title = 'Number (N)ine — Official Music Video';
        f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        f.allowFullscreen = true;
        f.referrerPolicy = 'strict-origin-when-cross-origin';
        box.append(f);
        box.classList.add('is-playing');
        $('.video__marks', box)?.remove();
        btn.remove();
      });

      if (fine && btn && !reduced) {
        box.addEventListener('pointermove', (e) => {
          if (playing) return;
          const r = box.getBoundingClientRect();
          const dx = clamp(e.clientX - (r.left + r.width / 2), -r.width * 0.25, r.width * 0.25);
          const dy = clamp(e.clientY - (r.top + r.height / 2), -r.height * 0.25, r.height * 0.25);
          btn.style.setProperty('--vx', (dx * 0.35).toFixed(1) + 'px');
          btn.style.setProperty('--vy', (dy * 0.35).toFixed(1) + 'px');
        }, { passive: true });
        box.addEventListener('pointerleave', () => {
          btn.style.setProperty('--vx', '0px');
          btn.style.setProperty('--vy', '0px');
        });
      }

      if (tc && !reduced) {
        let on = false;
        let start = 0;
        if ('IntersectionObserver' in window) {
          new IntersectionObserver(([e]) => {
            on = e.isIntersecting;
            if (on && !start) start = performance.now();
          }).observe(box);
        }
        let lastF = -1;
        tick((t) => {
          if (!on || playing) return;
          const total = Math.floor(((t - start) / 1000) * 24);
          if (total === lastF) return;
          lastF = total;
          const f = total % 24;
          const s = Math.floor(total / 24);
          tc.textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}:${pad(f)}`;
        });
      }
    });
  }

  /* ---- Click-to-Copy Email ---- */
  function initCopy() {
    async function copyText(text) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
        document.body.append(ta);
        ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch { ok = false; }
        ta.remove();
        return ok;
      }
    }

    $$('[data-copy]').forEach((btn) => {
      const badge = $('[data-copy-status]', btn);
      let timer = 0;
      btn.addEventListener('click', async () => {
        const ok = await copyText(btn.dataset.copy);
        if (!badge) return;
        btn.classList.toggle('is-copied', ok);
        badge.textContent = ok ? 'Copied to clipboard' : 'Select address to copy';
        clearTimeout(timer);
        timer = setTimeout(() => {
          btn.classList.remove('is-copied');
          badge.textContent = 'Click to copy';
        }, 2400);
      });
    });
  }

  /* ---- Boot all modules safely ---- */
  function safe(name, fn) {
    try { fn(); } catch (err) { console.warn('[radik$]', name, err); }
  }

  safe('scroll', initScroll);
  safe('hero-type', initHeroType);
  safe('nav', initNav);
  safe('reveal', initReveal);
  safe('tilt', initTilt);
  safe('cd', initCD);
  safe('marquee', initMarquee);
  safe('cursor', initCursor);
  safe('hero-gl', () => initHeroGL($('.hero__gl')));
  safe('video', initVideo);
  safe('copy', initCopy);
})();

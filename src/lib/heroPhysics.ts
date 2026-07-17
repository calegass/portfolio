import gsap from "gsap";
import type { Body, Fixture, World } from "planck";

const ARENA_VH = 24;
const PX_PER_M = 100;
const GRAVITY = 10;
const RESTITUTION = 0.7;
const FRICTION = 0.3;
const DENSITY = 1;
const PULL_HZ = 1.6;
const PULL_DAMP = 0.75;
const PULL_ANGLE_HZ = 2;
const PULL_ANGLE_DAMP = 0.9;
const RETURN_AFTER_MS = 6000;
const TILT_RANGE_DEGREES = 35;
const TILT_DEAD_ZONE_DEGREES = 3;
const MOTION_SMOOTHING = 0.18;
const FLAT_ACCEL_THRESHOLD = 2;
const SETTLE_DISTANCE_PX = 0.75;
const SETTLE_SPEED_PX = 3;
const SETTLE_ANGLE = 0.015;
const SETTLE_ANGULAR_SPEED = 0.05;
const VEL_ITER = 8;
const POS_ITER = 3;
const TAP_IMPULSE = 0.12;
const WALL_THICKNESS_M = 0.08;
const FIXED_STEP = 1 / 60;

type PhysicsState = "locked" | "released" | "pull";
type PhysicsLetter = {
  body: Body;
  char: HTMLElement;
  fixture: Fixture;
  homeX: number;
  homeY: number;
};
type DeviceOrientationWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<PermissionState>;
};

export interface HeroPhysicsOptions {
  stage: HTMLElement;
  chars: HTMLElement[];
  tiltHint: HTMLElement | null;
  fitToWidth: () => void;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export async function setupHeroPhysics({
  stage,
  chars,
  tiltHint,
  fitToWidth,
}: HeroPhysicsOptions): Promise<() => void> {
  const planck = await import("planck");
  stage.style.setProperty("--hero-arena-vh", String(ARENA_VH));
  stage.dataset.physicsActive = "true";

  let disposed = false;
  let world: World | null = null;
  let letters: PhysicsLetter[] = [];
  let state: PhysicsState = "locked";
  let rafId = 0;
  let layoutFrame = 0;
  let phaseTimer = 0;
  let hintTimer = 0;
  let accumulator = 0;
  let lastTime = 0;
  let orientationAttached = false;
  let permissionRequested = false;
  let referenceBeta: number | null = null;
  let referenceGamma: number | null = null;
  let latestBeta: number | null = null;
  let latestGamma: number | null = null;
  let hasMotionGravity = false;
  // Device gravity only takes over once the user actually tilts. Until then a
  // steady downward pull guarantees the letters drop on tap on every device,
  // including a phone lying flat (whose sensors otherwise report ~zero tilt).
  let userHasTilted = false;
  let gravityX = 0;
  let gravityY = GRAVITY;

  const orientationEvent =
    window.DeviceOrientationEvent as DeviceOrientationWithPermission;
  const orientationSupported =
    "DeviceOrientationEvent" in window && window.isSecureContext;
  const motionSupported =
    "DeviceMotionEvent" in window && window.isSecureContext;
  const needsOrientationPermission =
    orientationSupported &&
    typeof orientationEvent?.requestPermission === "function";

  function clearTimers() {
    clearTimeout(phaseTimer);
    clearTimeout(hintTimer);
    phaseTimer = 0;
    hintTimer = 0;
  }

  function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    accumulator = 0;
    lastTime = 0;
  }

  function resetCharLayout() {
    chars.forEach((char) => {
      gsap.set(char, { clearProps: "transform" });
      char.style.position = "";
      char.style.left = "";
      char.style.top = "";
      char.style.width = "";
      char.style.height = "";
      char.style.transform = "";
      char.style.transformOrigin = "";
      char.style.willChange = "";
    });
  }

  function render() {
    letters.forEach(({ body, char, homeX, homeY }) => {
      const position = body.getPosition();
      const x = position.x * PX_PER_M - homeX;
      const y = position.y * PX_PER_M - homeY;
      char.style.transform = `translate(${x}px, ${y}px) rotate(${body.getAngle()}rad)`;
    });
  }

  function wakeLetters() {
    letters.forEach(({ body }) => body.setAwake(true));
  }

  function setLetterCollisions(enabled: boolean) {
    letters.forEach(({ fixture }) => {
      fixture.setFilterData({
        categoryBits: 0x0001,
        groupIndex: 0,
        maskBits: enabled ? 0xffff : 0,
      });
    });
  }

  function lockLetters() {
    if (!world || !letters.length) return;
    clearTimeout(phaseTimer);
    letters.forEach(({ body, homeX, homeY }) => {
      body.setType("static");
      body.setTransform(new planck.Vec2(homeX / PX_PER_M, homeY / PX_PER_M), 0);
      body.setLinearVelocity(new planck.Vec2(0, 0));
      body.setAngularVelocity(0);
    });
    state = "locked";
    render();
    stopLoop();
  }

  function release(withImpulse: boolean) {
    if (!world || !letters.length || disposed) return;
    clearTimeout(phaseTimer);
    world.setGravity(new planck.Vec2(gravityX, gravityY));
    setLetterCollisions(true);
    state = "released";
    letters.forEach(({ body }) => {
      body.setType("dynamic");
      body.setAwake(true);
      if (withImpulse) {
        const impulse = new planck.Vec2(
          (Math.random() - 0.5) * TAP_IMPULSE,
          (-0.25 - Math.random() * 0.75) * TAP_IMPULSE,
        );
        body.applyLinearImpulse(impulse, body.getWorldCenter(), true);
      }
    });
    phaseTimer = window.setTimeout(beginPull, RETURN_AFTER_MS);
    startLoop();
  }

  function beginPull() {
    if (!world || !letters.length || disposed) return;
    state = "pull";
    world.setGravity(new planck.Vec2(0, 0));
    setLetterCollisions(false);
    wakeLetters();
    startLoop();
  }

  function applyHomeSprings() {
    const linearOmega = 2 * Math.PI * PULL_HZ;
    const angularOmega = 2 * Math.PI * PULL_ANGLE_HZ;
    letters.forEach(({ body, homeX, homeY }) => {
      const mass = body.getMass();
      const position = body.getPosition();
      const velocity = body.getLinearVelocity();
      const spring = mass * linearOmega * linearOmega;
      const damping = 2 * mass * PULL_DAMP * linearOmega;
      const targetX = homeX / PX_PER_M;
      const targetY = homeY / PX_PER_M;
      body.applyForceToCenter(
        new planck.Vec2(
          (targetX - position.x) * spring - velocity.x * damping,
          (targetY - position.y) * spring - velocity.y * damping,
        ),
        true,
      );

      const inertia = body.getInertia();
      const angularSpring = inertia * angularOmega * angularOmega;
      const angularDamping = 2 * inertia * PULL_ANGLE_DAMP * angularOmega;
      body.applyTorque(
        -body.getAngle() * angularSpring -
          body.getAngularVelocity() * angularDamping,
        true,
      );
    });
  }

  function isSettled() {
    return letters.every(({ body, homeX, homeY }) => {
      const position = body.getPosition();
      const dx = position.x * PX_PER_M - homeX;
      const dy = position.y * PX_PER_M - homeY;
      const velocity = body.getLinearVelocity();
      const speed = Math.hypot(velocity.x, velocity.y) * PX_PER_M;
      return (
        Math.hypot(dx, dy) < SETTLE_DISTANCE_PX &&
        speed < SETTLE_SPEED_PX &&
        Math.abs(body.getAngle()) < SETTLE_ANGLE &&
        Math.abs(body.getAngularVelocity()) < SETTLE_ANGULAR_SPEED
      );
    });
  }

  function frame(now: number) {
    if (!world || state === "locked" || disposed) {
      rafId = 0;
      return;
    }
    const elapsed = lastTime ? Math.min((now - lastTime) / 1000, 0.25) : 0;
    lastTime = now;
    accumulator += elapsed;
    while (accumulator >= FIXED_STEP) {
      if (state === "pull") applyHomeSprings();
      world.step(FIXED_STEP, VEL_ITER, POS_ITER);
      accumulator -= FIXED_STEP;
    }
    render();
    if (state === "pull" && isSettled()) {
      lockLetters();
      return;
    }
    rafId = requestAnimationFrame(frame);
  }

  function startLoop() {
    if (rafId || state === "locked") return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function buildWorld() {
    const stageRect = stage.getBoundingClientRect();
    const width = stageRect.width / PX_PER_M;
    const height = stageRect.height / PX_PER_M;
    if (width <= 0 || height <= 0) return;

    world = new planck.World({
      allowSleep: true,
      gravity: new planck.Vec2(gravityX, gravityY),
    });
    const activeWorld = world;
    const walls = activeWorld.createBody();
    const wallFixture = { friction: FRICTION, restitution: RESTITUTION };
    walls.createFixture(
      new planck.BoxShape(
        width / 2 + WALL_THICKNESS_M,
        WALL_THICKNESS_M / 2,
        new planck.Vec2(width / 2, -WALL_THICKNESS_M / 2),
      ),
      wallFixture,
    );
    walls.createFixture(
      new planck.BoxShape(
        width / 2 + WALL_THICKNESS_M,
        WALL_THICKNESS_M / 2,
        new planck.Vec2(width / 2, height + WALL_THICKNESS_M / 2),
      ),
      wallFixture,
    );
    walls.createFixture(
      new planck.BoxShape(
        WALL_THICKNESS_M / 2,
        height / 2,
        new planck.Vec2(-WALL_THICKNESS_M / 2, height / 2),
      ),
      wallFixture,
    );
    walls.createFixture(
      new planck.BoxShape(
        WALL_THICKNESS_M / 2,
        height / 2,
        new planck.Vec2(width + WALL_THICKNESS_M / 2, height / 2),
      ),
      wallFixture,
    );
    const measurements = chars.map((char) => {
      const rect = char.getBoundingClientRect();
      const widthPx = rect.width;
      const heightPx = rect.height;
      return {
        char,
        heightPx,
        homeX: rect.left - stageRect.left + widthPx / 2,
        homeY: rect.top - stageRect.top + heightPx / 2,
        left: rect.left - stageRect.left,
        top: rect.top - stageRect.top,
        widthPx,
      };
    });

    letters = measurements.map(
      ({ char, heightPx, homeX, homeY, left, top, widthPx }) => {
        char.style.position = "absolute";
        char.style.left = `${left}px`;
        char.style.top = `${top}px`;
        char.style.width = `${widthPx}px`;
        char.style.height = `${heightPx}px`;
        char.style.transformOrigin = "center";
        char.style.willChange = "transform";

        const body = activeWorld.createDynamicBody({
          angularDamping: 2.5,
          linearDamping: 0.08,
          position: new planck.Vec2(homeX / PX_PER_M, homeY / PX_PER_M),
        });
        const fixture = body.createFixture(
          new planck.BoxShape(widthPx / PX_PER_M / 2, heightPx / PX_PER_M / 2),
          {
            density: DENSITY,
            friction: FRICTION,
            restitution: RESTITUTION,
          },
        );
        return { body, char, fixture, homeX, homeY };
      },
    );
    lockLetters();
  }

  function rebuildWorld() {
    if (disposed) return;
    clearTimers();
    stopLoop();
    world = null;
    letters = [];
    cancelAnimationFrame(layoutFrame);
    resetCharLayout();
    fitToWidth();
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = 0;
      if (!disposed) buildWorld();
    });
  }

  function calibrateTilt() {
    if (latestBeta === null || latestGamma === null) return;
    referenceBeta = latestBeta;
    referenceGamma = latestGamma;
  }

  function normalizeTilt(delta: number) {
    const magnitude = Math.max(0, Math.abs(delta) - TILT_DEAD_ZONE_DEGREES);
    const range = TILT_RANGE_DEGREES - TILT_DEAD_ZONE_DEGREES;
    return clamp((Math.sign(delta) * magnitude) / range, -1, 1);
  }

  function applyScreenGravity(deviceX: number, deviceY: number) {
    if (!userHasTilted) {
      if (Math.hypot(deviceX, deviceY) < FLAT_ACCEL_THRESHOLD) return;
      userHasTilted = true;
    }
    let x = -deviceX;
    let y = deviceY;
    const angle = ((window.screen.orientation?.angle ?? 0) + 360) % 360;
    if (angle === 90) {
      [x, y] = [-y, x];
    } else if (angle === 180) {
      x = -x;
      y = -y;
    } else if (angle === 270) {
      [x, y] = [y, -x];
    }
    const nextX = clamp(x, -GRAVITY, GRAVITY);
    const nextY = clamp(y, -GRAVITY, GRAVITY);
    gravityX += (nextX - gravityX) * MOTION_SMOOTHING;
    gravityY += (nextY - gravityY) * MOTION_SMOOTHING;
    if (state !== "pull") {
      world?.setGravity(new planck.Vec2(gravityX, gravityY));
      wakeLetters();
    }
  }

  function onDeviceMotion(event: DeviceMotionEvent) {
    const acceleration = event.accelerationIncludingGravity;
    if (!acceleration) return;
    const { x, y } = acceleration;
    if (x === null || x === undefined || y === null || y === undefined) {
      return;
    }
    hasMotionGravity = true;
    applyScreenGravity(x, y);
  }

  function onDeviceOrientation(event: DeviceOrientationEvent) {
    if (hasMotionGravity) return;
    const rawBeta = event.beta;
    const rawGamma = event.gamma;
    if (rawBeta === null || rawGamma === null) return;
    latestBeta = rawBeta;
    latestGamma = rawGamma;
    if (referenceBeta === null || referenceGamma === null) {
      calibrateTilt();
      return;
    }
    const beta = normalizeTilt(rawBeta - referenceBeta);
    const gamma = normalizeTilt(rawGamma - referenceGamma);
    if (!userHasTilted) {
      if (beta === 0 && gamma === 0) return;
      userHasTilted = true;
    }
    const angle = ((window.screen.orientation?.angle ?? 0) + 360) % 360;
    let x = gamma;
    let y = beta;
    if (angle === 90) {
      x = beta;
      y = -gamma;
    } else if (angle === 180) {
      x = -gamma;
      y = -beta;
    } else if (angle === 270) {
      x = -beta;
      y = gamma;
    }
    const nextX = x * GRAVITY;
    const nextY = y * GRAVITY;
    if (Math.hypot(nextX - gravityX, nextY - gravityY) < 0.1) return;
    gravityX = nextX;
    gravityY = nextY;
    if (state !== "pull") {
      world?.setGravity(new planck.Vec2(gravityX, gravityY));
      wakeLetters();
    }
  }

  function attachOrientation() {
    if (orientationAttached) return;
    if (orientationSupported) {
      window.addEventListener("deviceorientation", onDeviceOrientation);
    }
    if (motionSupported) {
      window.addEventListener("devicemotion", onDeviceMotion);
    }
    orientationAttached = true;
  }

  function hideTiltHint() {
    if (!tiltHint || tiltHint.hidden) return;
    tiltHint.dataset.visible = "false";
    clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => {
      tiltHint.hidden = true;
    }, 240);
  }

  async function requestOrientationPermission() {
    if (!needsOrientationPermission || permissionRequested) return;
    permissionRequested = true;
    hideTiltHint();
    try {
      const permission = await orientationEvent.requestPermission?.();
      if (permission === "granted") attachOrientation();
    } catch {
      // Permission can be rejected by the browser or the user. Gravity still works.
    }
  }

  function releaseFromUserInteraction() {
    if (state !== "locked") return;
    hideTiltHint();
    void requestOrientationPermission();
    release(true);
  }

  function onPagePointerDown() {
    releaseFromUserInteraction();
  }

  function onPageScroll() {
    releaseFromUserInteraction();
  }

  if (!orientationSupported && !motionSupported && tiltHint) {
    tiltHint.textContent = "Tilt control requires HTTPS";
    tiltHint.hidden = false;
    requestAnimationFrame(() => {
      if (!disposed) tiltHint.dataset.visible = "true";
    });
  } else if (needsOrientationPermission && tiltHint) {
    tiltHint.hidden = false;
    requestAnimationFrame(() => {
      if (!disposed) tiltHint.dataset.visible = "true";
    });
  } else {
    attachOrientation();
  }

  document.addEventListener("pointerdown", onPagePointerDown, {
    passive: true,
  });
  window.addEventListener("scroll", onPageScroll, { passive: true });

  let observedWidth = stage.clientWidth;
  let observedHeight = stage.clientHeight;
  const resizeObserver = new ResizeObserver(([entry]) => {
    if (!entry) return;
    const { width, height } = entry.contentRect;
    if (
      Math.abs(width - observedWidth) < 0.5 &&
      Math.abs(height - observedHeight) < 0.5
    ) {
      return;
    }
    observedWidth = width;
    observedHeight = height;
    rebuildWorld();
  });
  resizeObserver.observe(stage);

  rebuildWorld();

  return () => {
    disposed = true;
    resizeObserver.disconnect();
    cancelAnimationFrame(layoutFrame);
    stopLoop();
    clearTimers();
    document.removeEventListener("pointerdown", onPagePointerDown);
    window.removeEventListener("scroll", onPageScroll);
    if (orientationAttached) {
      window.removeEventListener("deviceorientation", onDeviceOrientation);
      window.removeEventListener("devicemotion", onDeviceMotion);
    }
    if (tiltHint) {
      tiltHint.hidden = true;
      tiltHint.dataset.visible = "false";
    }
    world = null;
    letters = [];
    stage.style.removeProperty("--hero-arena-vh");
    delete stage.dataset.physicsActive;
    resetCharLayout();
  };
}

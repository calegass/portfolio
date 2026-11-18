import gsap from "gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";

const SPRING_STRENGTH = 150;
const DAMPING = 8.5;
const AMBIENT_X = 2.8;
const AMBIENT_Y = 3.8;
const TILT_X = 18;
const TILT_Y = 14;
const SCROLL_Y = 24;
const MAX_X = 26;
const MAX_Y = 34;
const AMBIENT_ROTATION = 2.5;
const MAX_CLICK_ROTATION = 35;
const ROTATION_SPRING = 46;
const ROTATION_DAMPING = 9;
const CLICK_COOLDOWN_MS = 500;
const MAX_SCROLL_VELOCITY = 1400;
const TILT_RANGE_DEGREES = 24;
const MAX_FRAME_TIME = 1 / 30;

type DeviceOrientationWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<PermissionState>;
};

export interface MobileHeroMotionOptions {
  target: HTMLElement;
  chars: HTMLElement[];
}

gsap.registerPlugin(ScrollSmoother);

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function normalizeForce(value: number, maximum: number) {
  const linear = clamp(value / maximum, -1, 1);
  return Math.sign(linear) * Math.sqrt(Math.abs(linear));
}

export function setupMobileHeroMotion({
  target,
  chars,
}: MobileHeroMotionOptions): () => void {
  const letters = chars.map((char, index) => ({
    buoyancy: 0.85 + (index % 5) * 0.06,
    phase: index * 0.78,
    progress: index / Math.max(chars.length - 1, 1),
    angularVelocity: 0,
    rotation: 0,
    setRotation: gsap.quickSetter(char, "rotation", "deg"),
    setX: gsap.quickSetter(char, "x", "px"),
    setY: gsap.quickSetter(char, "y", "px"),
    vx: 0,
    vy: 0,
    x: 0,
    y: 0,
  }));

  let disposed = false;
  let animationFrame = 0;
  let lastFrameTime = 0;
  let lastScrollY = window.scrollY;
  let scrollForce = 0;
  let tiltX = 0;
  let tiltY = 0;
  let targetTiltX = 0;
  let targetTiltY = 0;
  let referenceBeta: number | null = null;
  let referenceGamma: number | null = null;
  let referenceScreenAngle: number | null = null;
  let orientationAttached = false;
  let permissionRequested = false;
  let lastClickTime = -CLICK_COOLDOWN_MS;

  function resetLetters() {
    letters.forEach((letter) => {
      letter.x = 0;
      letter.y = 0;
      letter.vx = 0;
      letter.vy = 0;
      letter.angularVelocity = 0;
      letter.rotation = 0;
      letter.setX(0);
      letter.setY(0);
      letter.setRotation(0);
    });
  }

  function readScrollVelocity(deltaTime: number) {
    const smoother = ScrollSmoother.get();
    if (smoother) {
      lastScrollY = window.scrollY;
      return smoother.getVelocity();
    }

    const scrollY = window.scrollY;
    const velocity = (scrollY - lastScrollY) / Math.max(deltaTime, 0.001);
    lastScrollY = scrollY;
    return velocity;
  }

  function updateLetter(
    letter: (typeof letters)[number],
    elapsed: number,
    time: number,
  ) {
    const ambientX = Math.sin(time * 0.85 + letter.phase) * AMBIENT_X;
    const ambientY = Math.cos(time * 0.72 + letter.phase * 1.25) * AMBIENT_Y;
    const targetX = clamp(
      ambientX + tiltX * TILT_X * letter.buoyancy,
      -MAX_X,
      MAX_X,
    );
    const targetY = clamp(
      ambientY + (tiltY * TILT_Y + scrollForce * SCROLL_Y) * letter.buoyancy,
      -MAX_Y,
      MAX_Y,
    );

    const accelerationX =
      (targetX - letter.x) * SPRING_STRENGTH - letter.vx * DAMPING;
    const accelerationY =
      (targetY - letter.y) * SPRING_STRENGTH - letter.vy * DAMPING;
    const angularAcceleration =
      -letter.rotation * ROTATION_SPRING -
      letter.angularVelocity * ROTATION_DAMPING;
    letter.vx += accelerationX * elapsed;
    letter.vy += accelerationY * elapsed;
    letter.angularVelocity += angularAcceleration * elapsed;
    letter.x += letter.vx * elapsed;
    letter.y += letter.vy * elapsed;
    letter.rotation += letter.angularVelocity * elapsed;
    const renderedRotation = clamp(
      letter.rotation +
        letter.vx * 0.012 +
        tiltX * (letter.progress - 0.5) * AMBIENT_ROTATION * 1.2,
      -MAX_CLICK_ROTATION,
      MAX_CLICK_ROTATION,
    );

    letter.setX(letter.x);
    letter.setY(letter.y);
    letter.setRotation(renderedRotation);
  }

  function frame(now: number) {
    animationFrame = 0;
    if (disposed) return;

    const elapsed = lastFrameTime
      ? Math.min((now - lastFrameTime) / 1000, MAX_FRAME_TIME)
      : 1 / 60;
    lastFrameTime = now;
    const scrollVelocity = readScrollVelocity(elapsed);
    const targetScrollForce = normalizeForce(
      scrollVelocity,
      MAX_SCROLL_VELOCITY,
    );
    const scrollSmoothing = 1 - Math.exp(-elapsed * 10);
    const tiltSmoothing = 1 - Math.exp(-elapsed * 7);
    scrollForce += (targetScrollForce - scrollForce) * scrollSmoothing;
    tiltX += (targetTiltX - tiltX) * tiltSmoothing;
    tiltY += (targetTiltY - tiltY) * tiltSmoothing;

    const time = now / 1000;
    letters.forEach((letter) => {
      updateLetter(letter, elapsed, time);
    });

    animationFrame = requestAnimationFrame(frame);
  }

  function startLoop() {
    if (disposed || animationFrame) return;
    lastFrameTime = 0;
    lastScrollY = window.scrollY;
    animationFrame = requestAnimationFrame(frame);
  }

  function stopLoop(reset: boolean) {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    lastFrameTime = 0;
    scrollForce = 0;
    if (reset) resetLetters();
  }

  function onDeviceOrientation(event: DeviceOrientationEvent) {
    const beta = event.beta;
    const gamma = event.gamma;
    if (beta === null || gamma === null) return;

    const screenAngle = ((window.screen.orientation?.angle ?? 0) + 360) % 360;
    if (
      referenceBeta === null ||
      referenceGamma === null ||
      referenceScreenAngle !== screenAngle
    ) {
      referenceBeta = beta;
      referenceGamma = gamma;
      referenceScreenAngle = screenAngle;
      targetTiltX = 0;
      targetTiltY = 0;
      return;
    }

    const normalizedBeta = clamp(
      (beta - referenceBeta) / TILT_RANGE_DEGREES,
      -1,
      1,
    );
    const normalizedGamma = clamp(
      (gamma - referenceGamma) / TILT_RANGE_DEGREES,
      -1,
      1,
    );

    if (screenAngle === 90) {
      targetTiltX = normalizedBeta;
      targetTiltY = -normalizedGamma;
    } else if (screenAngle === 180) {
      targetTiltX = -normalizedGamma;
      targetTiltY = -normalizedBeta;
    } else if (screenAngle === 270) {
      targetTiltX = -normalizedBeta;
      targetTiltY = normalizedGamma;
    } else {
      targetTiltX = normalizedGamma;
      targetTiltY = normalizedBeta;
    }
  }

  const orientationApi =
    window.DeviceOrientationEvent as DeviceOrientationWithPermission;
  const orientationSupported =
    "DeviceOrientationEvent" in window && window.isSecureContext;
  const needsPermission =
    typeof orientationApi?.requestPermission === "function";

  function attachOrientation() {
    if (disposed || orientationAttached || !orientationSupported) return;
    window.addEventListener("deviceorientation", onDeviceOrientation);
    orientationAttached = true;
  }

  async function requestOrientationPermission() {
    if (
      !needsPermission ||
      !orientationSupported ||
      permissionRequested ||
      disposed
    ) {
      return;
    }
    permissionRequested = true;
    try {
      const permission = await orientationApi.requestPermission?.();
      if (permission === "granted") attachOrientation();
    } catch {
      // The burst still works when motion permission is unavailable or denied.
    }
  }

  function onNameClick() {
    if (disposed) return;
    void requestOrientationPermission();

    const now = performance.now();
    if (now - lastClickTime < CLICK_COOLDOWN_MS) return;
    lastClickTime = now;
    const center = (letters.length - 1) / 2;
    const radius = Math.max(center, 1);

    letters.forEach((letter, index) => {
      const direction = (index - center) / radius;
      letter.vx = clamp(
        letter.vx + direction * 360 + gsap.utils.random(-70, 70),
        -520,
        520,
      );
      letter.vy = clamp(letter.vy + gsap.utils.random(-430, -320), -540, 220);
      letter.angularVelocity = clamp(
        letter.angularVelocity + gsap.utils.random(-320, 320),
        -420,
        420,
      );
    });
  }

  if (!needsPermission) attachOrientation();

  const visibilityObserver = new IntersectionObserver(([entry]) => {
    if (entry?.isIntersecting) {
      startLoop();
    } else {
      stopLoop(true);
    }
  });
  visibilityObserver.observe(target);
  target.addEventListener("click", onNameClick);
  startLoop();

  return () => {
    disposed = true;
    visibilityObserver.disconnect();
    target.removeEventListener("click", onNameClick);
    if (orientationAttached) {
      window.removeEventListener("deviceorientation", onDeviceOrientation);
    }
    stopLoop(true);
    gsap.killTweensOf(chars);
  };
}

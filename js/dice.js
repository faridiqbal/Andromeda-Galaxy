/* 3D dice rendered with Three.js, thrown across the top of the board. */
const Dice3D = (() => {
  let renderer, scene, camera, die, stage, rafId = null;
  const SIZE = 1.5;
  const HALF = SIZE / 2;

  // BoxGeometry material order: +X, -X, +Y, -Y, +Z, -Z  (opposite faces sum to 7)
  const FACE_VALUES = [3, 4, 1, 6, 2, 5];

  // Rotation that brings face `v` to the top (+Y).
  const FACE_UP = {
    1: new THREE.Euler(0, 0, 0),
    6: new THREE.Euler(Math.PI, 0, 0),
    2: new THREE.Euler(-Math.PI / 2, 0, 0),
    5: new THREE.Euler(Math.PI / 2, 0, 0),
    3: new THREE.Euler(0, 0, Math.PI / 2),
    4: new THREE.Euler(0, 0, -Math.PI / 2),
  };

  const PIPS = {
    1: [[0.5, 0.5]],
    2: [[0.27, 0.27], [0.73, 0.73]],
    3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
    4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
    5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
    6: [[0.27, 0.25], [0.73, 0.25], [0.27, 0.5], [0.73, 0.5], [0.27, 0.75], [0.73, 0.75]],
  };

  function faceTexture(v) {
    const s = 256;
    const c = document.createElement("canvas");
    c.width = c.height = s;
    const g = c.getContext("2d");
    // Body: pearly white with a soft edge shade
    const bg = g.createRadialGradient(s * 0.4, s * 0.35, s * 0.1, s / 2, s / 2, s * 0.75);
    bg.addColorStop(0, "#ffffff");
    bg.addColorStop(0.7, "#e7ebfb");
    bg.addColorStop(1, "#b9c2e8");
    g.fillStyle = bg;
    g.fillRect(0, 0, s, s);
    // Rounded-corner illusion
    g.strokeStyle = "rgba(90,100,170,0.35)";
    g.lineWidth = 10;
    roundRect(g, 5, 5, s - 10, s - 10, 40);
    g.stroke();
    // Pips
    for (const [px, py] of PIPS[v]) {
      const x = px * s, y = py * s;
      const r = v === 1 ? 34 : 22;
      const pg = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
      if (v === 1) { // the "1" is a little planet
        pg.addColorStop(0, "#ffd9a0"); pg.addColorStop(0.5, "#ff7a45"); pg.addColorStop(1, "#a3264f");
      } else {
        pg.addColorStop(0, "#6b7cff"); pg.addColorStop(0.6, "#2b2f8f"); pg.addColorStop(1, "#11133f");
      }
      g.fillStyle = pg;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      if (v === 1) {
        g.strokeStyle = "rgba(255,210,150,0.9)"; g.lineWidth = 4;
        g.beginPath(); g.ellipse(x, y, r * 1.7, r * 0.45, -0.35, 0, Math.PI * 2); g.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function init(container) {
    stage = container;
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    stage.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 22, 7);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0x9fb0ff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 0.95);
    key.position.set(5, 14, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 40 });
    key.shadow.radius = 4;
    scene.add(key);
    const rim = new THREE.PointLight(0x36d1ff, 0.6, 30);
    rim.position.set(-6, 5, -4);
    scene.add(rim);
    const warm = new THREE.PointLight(0xff5d8f, 0.35, 30);
    warm.position.set(6, 4, -6);
    scene.add(warm);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.ShadowMaterial({ opacity: 0.45 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const mats = FACE_VALUES.map(v => new THREE.MeshStandardMaterial({
      map: faceTexture(v), roughness: 0.32, metalness: 0.08,
    }));
    die = new THREE.Mesh(new THREE.BoxGeometry(SIZE, SIZE, SIZE), mats);
    die.castShadow = true;
    die.visible = false;
    scene.add(die);

    resize();
    window.addEventListener("resize", resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  }

  function resize() {
    if (!renderer) return;
    const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  }

  function render() { renderer && renderer.render(scene, camera); }

  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const rand = (a, b) => a + Math.random() * (b - a);

  /**
   * Throw the die so that it lands showing `value`.
   * Resolves once it has come to rest.
   */
  function roll(value, { onBounce, power = 0.5 } = {}) {
    power = Math.max(0, Math.min(1, power)); // 0 = gentle toss, 1 = full-power throw
    cancelAnimationFrame(rafId);
    const qFace = new THREE.Quaternion().setFromEuler(FACE_UP[value]);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(-0.6, 0.6));
    const qFinal = qYaw.multiply(qFace);

    const spinAxis = new THREE.Vector3(rand(-1, 1), rand(-0.4, 0.4), rand(-1, 1)).normalize();
    const spinAmount = Math.PI * 2 * Math.round(2 + power * 5 + rand(0, 1)) + rand(0, Math.PI);

    // Throw from a random lower corner towards the middle of the board
    const side = Math.random() < 0.5 ? -1 : 1;
    const start = new THREE.Vector3(side * rand(6, 8 + power * 3), 3 + power * 3.5, rand(5, 7 + power * 3));
    const end = new THREE.Vector3(rand(-1.6, 1.6), HALF, rand(-1.4, 1.4));

    const duration = 1100 + power * 900;
    const bounces = power > 0.65 ? 4 : 3;
    const shape = 0.7;
    // Times where the die touches the ground (sin term crosses zero)
    const hitTimes = [];
    for (let k = 1; k <= bounces; k++) hitTimes.push(Math.pow(k / (bounces + 0.5), 1 / shape));
    let nextHit = 0;

    die.visible = true;
    die.scale.setScalar(1);
    const t0 = performance.now();
    const tmpQ = new THREE.Quaternion();

    return new Promise(resolve => {
      function step(now) {
        const t = Math.min(1, (now - t0) / duration);
        const p = easeOutCubic(t);
        die.position.x = start.x + (end.x - start.x) * p;
        die.position.z = start.z + (end.z - start.z) * p;
        const bounceY = Math.abs(Math.sin(Math.PI * (bounces + 0.5) * Math.pow(t, shape))) * (1.8 + power * 2.8) * Math.pow(1 - t, 1.6);
        const dropIn = (start.y - HALF) * Math.pow(Math.max(0, 1 - t * 4), 2);
        die.position.y = HALF + Math.max(bounceY, dropIn);

        tmpQ.setFromAxisAngle(spinAxis, spinAmount * (1 - easeOutCubic(Math.min(1, t * 1.08))));
        die.quaternion.copy(qFinal).multiply(tmpQ);

        if (nextHit < hitTimes.length && t >= hitTimes[nextHit]) {
          onBounce && onBounce(1 - nextHit * 0.3);
          nextHit++;
        }
        render();
        if (t < 1) rafId = requestAnimationFrame(step);
        else { die.quaternion.copy(qFinal); die.position.y = HALF; render(); resolve(value); }
      }
      rafId = requestAnimationFrame(step);
    });
  }

  /** Shrink the die away so it doesn't hide the tokens. */
  function hide() {
    if (!die || !die.visible) return Promise.resolve();
    const s = { v: 1 };
    return new Promise(resolve => {
      gsap.to(s, {
        v: 0.001, duration: 0.35, ease: "back.in(2)",
        onUpdate: () => { die.scale.setScalar(s.v); die.position.y = HALF * s.v; render(); },
        onComplete: () => { die.visible = false; render(); resolve(); },
      });
    });
  }

  return { init, roll, hide, resize };
})();

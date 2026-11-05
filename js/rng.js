/* Seeded random numbers for everything that affects the game's outcome
   (board layout, dice values, cosmic events). In online play every device seeds this
   with the same number, so they all compute exactly the same game. Purely visual
   randomness (particles, dice tumbling) keeps using Math.random. */
const Rng = (() => {
  let state = (Math.random() * 2 ** 32) >>> 0;

  function seed(n) { state = n >>> 0; }

  // mulberry32: small, fast, good enough for a board game
  function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const newSeed = () => (Math.random() * 2 ** 32) >>> 0;

  return { seed, random, newSeed };
})();

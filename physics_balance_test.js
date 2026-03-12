const CONFIG = {
  isolationPenalty: 1.9,
  redundancyBonusPerLink: 0.08,
  maxRedundancyBonus: 1.35,
  bucklingFactor: 1.45,
};

const MATERIAL = { strength: 50, stressScale: 300, fatigueGain: 0.35 };

function redundancyBonus(deg1, deg2) {
  const extraLinks = Math.max(0, deg1 + deg2 - 2);
  return Math.min(CONFIG.maxRedundancyBonus, 1 + extraLinks * CONFIG.redundancyBonusPerLink);
}

function isolationPenalty(deg1, deg2) {
  return Math.min(deg1, deg2) <= 1 ? CONFIG.isolationPenalty : 1;
}

function effectiveStress({ strain, compressionRatio, len, deg1, deg2 }) {
  const slenderness = Math.min(2.2, len / 65);
  const bucklingStress = compressionRatio * slenderness * CONFIG.bucklingFactor;
  const frameStress = strain * MATERIAL.stressScale * (1 + bucklingStress * 1.6);
  return (frameStress * isolationPenalty(deg1, deg2)) / redundancyBonus(deg1, deg2);
}

function durabilityScore(params) {
  const stress = effectiveStress(params);
  return MATERIAL.strength / Math.max(stress, 0.0001);
}

function fatigueToFailure(params, steps = 300) {
  let fatigue = 0;
  for (let i = 0; i < steps; i++) {
    const stress = effectiveStress(params);
    const stressRatio = stress / MATERIAL.strength;
    if (stressRatio > 0.55) fatigue += (stressRatio - 0.55) * MATERIAL.fatigueGain;
    else fatigue *= 0.985;
    if (stress + fatigue > MATERIAL.strength) return i + 1;
  }
  return Infinity;
}

function runMonteCarlo(rounds = 5000) {
  let winsComplex = 0;
  let winsAgainstSingle = 0;

  for (let i = 0; i < rounds; i++) {
    const jitter = () => (Math.random() - 0.5) * 0.16;

    const single = durabilityScore({
      strain: 0.16 * (1 + jitter()),
      len: 120 * (1 + jitter()),
      deg1: 1,
      deg2: 1,
      compressionRatio: 0.42 * (1 + jitter()),
    });

    const triangle = durabilityScore({
      strain: 0.12 * (1 + jitter()),
      len: 85 * (1 + jitter()),
      deg1: 3,
      deg2: 3,
      compressionRatio: 0.27 * (1 + jitter()),
    });

    const lattice = durabilityScore({
      strain: 0.10 * (1 + jitter()),
      len: 62 * (1 + jitter()),
      deg1: 4,
      deg2: 5,
      compressionRatio: 0.2 * (1 + jitter()),
    });

    if (lattice > triangle) winsComplex++;
    if (triangle > single && lattice > single) winsAgainstSingle++;
  }

  return {
    rounds,
    complexBeatsTriangleRate: winsComplex / rounds,
    complexAndTriangleBeatSingleRate: winsAgainstSingle / rounds,
  };
}

function runFatigueCheck() {
  const singleFail = fatigueToFailure({ strain: 0.08, len: 120, deg1: 1, deg2: 1, compressionRatio: 0.45 });
  const triangleFail = fatigueToFailure({ strain: 0.072, len: 85, deg1: 3, deg2: 3, compressionRatio: 0.27 });
  const latticeFail = fatigueToFailure({ strain: 0.062, len: 62, deg1: 4, deg2: 5, compressionRatio: 0.20 });
  return { singleFail, triangleFail, latticeFail };
}

const monteCarlo = runMonteCarlo();
const fatigue = runFatigueCheck();

console.log('MonteCarlo:', monteCarlo);
console.log('FatigueCheck:', fatigue);

if (monteCarlo.complexBeatsTriangleRate < 0.9) {
  throw new Error('复杂结构对三角结构优势不足，参数需要继续调优');
}
if (monteCarlo.complexAndTriangleBeatSingleRate < 0.92) {
  throw new Error('单杆仍然过强，参数需要继续调优');
}
if (!(fatigue.singleFail < fatigue.triangleFail && fatigue.singleFail < fatigue.latticeFail)) {
  throw new Error('疲劳检验未体现单杆优先失效');
}

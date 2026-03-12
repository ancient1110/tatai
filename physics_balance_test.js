const CONFIG = {
  isolationPenalty: 1.5,
  redundancyBonusPerLink: 0.12,
  maxRedundancyBonus: 1.55,
  bucklingFactor: 1.15,
};

const MATERIAL = { strength: 50 };

function redundancyBonus(deg1, deg2) {
  const extraLinks = Math.max(0, deg1 + deg2 - 2);
  return Math.min(CONFIG.maxRedundancyBonus, 1 + extraLinks * CONFIG.redundancyBonusPerLink);
}

function isolationPenalty(deg1, deg2) {
  return Math.min(deg1, deg2) <= 1 ? CONFIG.isolationPenalty : 1;
}

function memberStress({ strain, compressionRatio, len, deg1, deg2 }) {
  const slenderness = Math.min(2.2, len / 65);
  const bucklingStress = compressionRatio * slenderness * CONFIG.bucklingFactor;
  const baseStress = strain * (1 + bucklingStress);
  return (baseStress * isolationPenalty(deg1, deg2)) / redundancyBonus(deg1, deg2);
}

function capacityScore({ len, deg1, deg2, compressionRatio }) {
  const s = memberStress({ strain: 1, compressionRatio, len, deg1, deg2 });
  return MATERIAL.strength / s;
}

function runMonteCarlo(rounds = 5000) {
  let winsComplex = 0;
  let winsAgainstSingle = 0;

  for (let i = 0; i < rounds; i++) {
    const jitter = () => (Math.random() - 0.5) * 0.16;

    // 单杆：高细长、低连接
    const single = capacityScore({
      len: 120 * (1 + jitter()),
      deg1: 1,
      deg2: 1,
      compressionRatio: 0.42 * (1 + jitter()),
    });

    // 三角桁架：中等长度、更多连接
    const triangle = capacityScore({
      len: 85 * (1 + jitter()),
      deg1: 3,
      deg2: 3,
      compressionRatio: 0.27 * (1 + jitter()),
    });

    // 复杂塔架：短杆件、高连接
    const lattice = capacityScore({
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

function runEdgeChecks() {
  const cases = [
    { name: 'isolated-short', len: 60, deg1: 1, deg2: 1, compressionRatio: 0.3 },
    { name: 'redundant-short', len: 60, deg1: 4, deg2: 4, compressionRatio: 0.3 },
    { name: 'isolated-long', len: 120, deg1: 1, deg2: 1, compressionRatio: 0.45 },
    { name: 'redundant-long', len: 120, deg1: 4, deg2: 4, compressionRatio: 0.45 },
  ];

  return cases.map(c => ({ ...c, capacity: capacityScore(c).toFixed(2) }));
}

const monteCarlo = runMonteCarlo();
const edges = runEdgeChecks();

console.log('MonteCarlo:', monteCarlo);
console.log('EdgeCases:', edges);

if (monteCarlo.complexBeatsTriangleRate < 0.9) {
  throw new Error('复杂结构对三角结构优势不足，参数需要继续调优');
}
if (monteCarlo.complexAndTriangleBeatSingleRate < 0.92) {
  throw new Error('单杆仍然过强，参数需要继续调优');
}

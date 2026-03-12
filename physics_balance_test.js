const fs = require('fs');
const path = require('path');

const CONFIG = {
  isolationPenalty: 1.5,
  redundancyBonusPerLink: 0.12,
  maxRedundancyBonus: 1.55,
  bucklingFactor: 1.15,
};

function loadMaterialsFromHtml() {
  const htmlPath = path.join(__dirname, 'deepseek_html_20260312_aa8585.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const match = html.match(/const MATERIALS\s*=\s*(\{[\s\S]*?\});/);
  if (!match) {
    throw new Error('无法从 HTML 中读取 MATERIALS 常量');
  }
  return Function(`"use strict"; return (${match[1]});`)();
}

const MATERIALS = loadMaterialsFromHtml();

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

function capacityScore({ materialStrength, len, deg1, deg2, compressionRatio }) {
  const s = memberStress({ strain: 1, compressionRatio, len, deg1, deg2 });
  return materialStrength / s;
}

function runMonteCarloForMaterial(materialStrength, rounds = 5000) {
  let winsComplex = 0;
  let winsAgainstSingle = 0;

  for (let i = 0; i < rounds; i++) {
    const jitter = () => (Math.random() - 0.5) * 0.16;

    const single = capacityScore({
      materialStrength,
      len: 120 * (1 + jitter()),
      deg1: 1,
      deg2: 1,
      compressionRatio: 0.42 * (1 + jitter()),
    });

    const triangle = capacityScore({
      materialStrength,
      len: 85 * (1 + jitter()),
      deg1: 3,
      deg2: 3,
      compressionRatio: 0.27 * (1 + jitter()),
    });

    const lattice = capacityScore({
      materialStrength,
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

function runEdgeChecksForAllMaterials() {
  const cases = [
    { name: 'isolated-short', len: 60, deg1: 1, deg2: 1, compressionRatio: 0.3 },
    { name: 'redundant-short', len: 60, deg1: 4, deg2: 4, compressionRatio: 0.3 },
    { name: 'isolated-long', len: 120, deg1: 1, deg2: 1, compressionRatio: 0.45 },
    { name: 'redundant-long', len: 120, deg1: 4, deg2: 4, compressionRatio: 0.45 },
  ];

  return cases.map(c => {
    const byMaterial = Object.fromEntries(
      Object.entries(MATERIALS).map(([id, mat]) => [
        id,
        Number(
          capacityScore({ materialStrength: mat.strength, ...c }).toFixed(2)
        ),
      ])
    );

    return { ...c, capacity: byMaterial };
  });
}

function assertMaterialOrdering() {
  const shape = { len: 85, deg1: 3, deg2: 3, compressionRatio: 0.27 };
  const wood = capacityScore({ materialStrength: MATERIALS.wood.strength, ...shape });
  const steel = capacityScore({ materialStrength: MATERIALS.steel.strength, ...shape });
  const carbon = capacityScore({ materialStrength: MATERIALS.carbon.strength, ...shape });

  if (!(wood < steel && steel < carbon)) {
    throw new Error('材料强度层级异常：期望 wood < steel < carbon');
  }
}

const monteCarloByMaterial = Object.fromEntries(
  Object.entries(MATERIALS).map(([id, mat]) => [
    id,
    runMonteCarloForMaterial(mat.strength),
  ])
);
const edgeCases = runEdgeChecksForAllMaterials();

console.log('Materials:', Object.fromEntries(Object.entries(MATERIALS).map(([id, m]) => [id, { strength: m.strength, stiffness: m.stiffness, nodeStrength: m.nodeStrength }])));
console.log('MonteCarloByMaterial:', monteCarloByMaterial);
console.log('EdgeCasesByMaterial:', edgeCases);

for (const [id, result] of Object.entries(monteCarloByMaterial)) {
  if (result.complexBeatsTriangleRate < 0.9) {
    throw new Error(`[${id}] 复杂结构对三角结构优势不足，参数需要继续调优`);
  }
  if (result.complexAndTriangleBeatSingleRate < 0.92) {
    throw new Error(`[${id}] 单杆仍然过强，参数需要继续调优`);
  }
}

assertMaterialOrdering();

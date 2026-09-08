import { hash, noise, random, choose } from "../core/random";
import { clamp, type POI, type Vec3, type Collider } from "../core/types";
export const WORLD_SIZE = 4096;
export const CHUNK_SIZE = 256;
export const REGIONS = [
  {
    id: "pine",
    name: "松谷镇",
    english: "PINE HOLLOW",
    x: 0,
    z: 50,
    danger: 1,
    color: "#90a17c",
  },
  {
    id: "city",
    name: "灰谷旧城",
    english: "GREYVALE CITY",
    x: 580,
    z: 420,
    danger: 3,
    color: "#9fa190",
  },
  {
    id: "fort",
    name: "渡鸦要塞",
    english: "FORT RAVEN",
    x: -630,
    z: 610,
    danger: 5,
    color: "#b87861",
  },
  {
    id: "industry",
    name: "黑岭工业区",
    english: "BLACKRIDGE",
    x: 730,
    z: -500,
    danger: 3,
    color: "#a79b71",
  },
  {
    id: "lake",
    name: "赤杨水库",
    english: "LAKE ALDER",
    x: -550,
    z: -460,
    danger: 1,
    color: "#6e9c9a",
  },
  {
    id: "mine",
    name: "旧矿场",
    english: "OLD MINE",
    x: -1080,
    z: 20,
    danger: 4,
    color: "#b39b82",
  },
  {
    id: "lab",
    name: "第七研究站",
    english: "RESEARCH SITE 07",
    x: -1200,
    z: 700,
    danger: 5,
    color: "#88a09b",
  },
] as const;
export const STORY: Record<
  string,
  { title: string; text: string; clue: string }
> = {
  crash: {
    title: "未送达的运输清单",
    text: "2037 年 10 月 17 日。乘客 26 人。目的地：松谷临时收容点。附注：如接收到灰烬频段，不得停车。纸张的背面写着一句话：我们不是最后一车。",
    clue: "沿着公路寻找松谷镇的林务站。",
  },
  ranger: {
    title: "林务员的最后一班",
    text: "北边的广播塔还在供电。他们每天重复同一份撤离通告，可昨天我在河边又发现了幸存者。如果有人看到这本日志，去诊所找米拉。不要相信官方的“全部撤离”。",
    clue: "松谷诊所的米拉知道渡鸦要塞的通行卡。",
  },
  clinic: {
    title: "隔离病例记录",
    text: "病人的编号不是按症状划分，而是按接触区域。军方取走了全部血样，却没有带走任何病人。米拉说，通行卡被锁在要塞的军械箱里。",
    clue: "前往渡鸦要塞，寻找研究站访问卡。",
  },
  industry: {
    title: "第七批次货单",
    text: "低温容器 42 个，目的地 R-07。设备由黑岭工业区生产。“灰烬”并非应急计划，它在灾难发生前两年就已获批。",
    clue: "收集电子元件、蓄电池和收发器以修复广播。",
  },
  fort: {
    title: "撤防命令 19-B",
    text: "终止救援。封闭所有外部交通。保留研究区供电。不允许任何未经许可的样本离开灰谷。指挥官用红笔划掉了“样本”，写下“人”。",
    clue: "使用访问卡进入第七研究站。",
  },
  mine: {
    title: "矿工的手绘便条",
    text: "西北隧道尽头有一扇新装的钢门，墙上的箭头指向第七研究站。我们以为这里采的是铁矿。他们付钱让我们停止询问。",
    clue: "第七研究站位于矿区东北方。",
  },
  lab: {
    title: "ASHFALL / 原始协议",
    text: "计划目的：在受控区域测试感染后的环境适应性。撤离公告为行为稳定措施。灰烬协议不是为了清除灾难，而是为了掩埋证据。所有实验记录已复制到随身数据盘。",
    clue: "把档案带到松谷北面的广播站，向封锁区外发送。",
  },
  broadcast: {
    title: "封锁线之外",
    text: "这一次，广播里终于传来了回应：“灰谷，我们收到你们的信号。保持频段，接应点已经确认。”故事会被带出去。留下，或离开，终于是你自己的选择。",
    clue: "到广播站东侧的接应点撤离，或继续在灰谷生活。",
  },
};
const names: Record<string, string[]> = {
  pine: [
    "林务站",
    "松谷诊所",
    "警务所",
    "乡村超市",
    "加油站",
    "灰雀酒馆",
    "消防站",
    "修车铺",
    "小学",
    "林边住宅",
  ],
  city: [
    "百货大楼",
    "市立医院",
    "河畔公寓",
    "地铁入口",
    "旧办公楼",
    "车站旅馆",
    "地下停车场",
    "书店",
    "消防分站",
    "商住楼",
  ],
  fort: [
    "要塞军械库",
    "作战指挥所",
    "士兵营房",
    "哨兵宿舍",
    "雷达控制室",
    "后勤仓库",
    "围墙哨所",
    "医疗营房",
  ],
  industry: [
    "动力车间",
    "零件仓库",
    "化工实验楼",
    "铁路维修间",
    "油料站",
    "铸造厂",
    "值班宿舍",
    "变电站",
  ],
  lake: [
    "湖岸木屋",
    "水库值班站",
    "钓鱼小屋",
    "废弃码头",
    "雨水观测站",
    "露营木屋",
  ],
  mine: [
    "矿场办公楼",
    "采矿车间",
    "矿工宿舍",
    "矿井入口",
    "材料堆场",
    "矿场诊所",
  ],
  lab: [
    "研究站入口",
    "样本隔离室",
    "冷冻仓库",
    "服务器中心",
    "生物实验室",
    "研究员生活区",
  ],
};
export function generatePOIs(seed: string): POI[] {
  const rng = random(seed + ":pois");
  const result: POI[] = [];
  for (const region of REGIONS) {
    const list = names[region.id]!;
    list.forEach((name, i) => {
      const col = i % 3,
        row = Math.floor(i / 3);
      const x = region.x + (col - 1) * 48 + (rng() - 0.5) * 9,
        z = region.z + row * 46 + (rng() - 0.5) * 6;
      let kind = choose(rng, ["house", "store", "warehouse", "cabin"]);
      if (/诊所|医院|医疗/.test(name)) kind = "medical";
      if (/军械|警务/.test(name)) kind = "military";
      if (/修|车间|仓库|料|发电|变电/.test(name)) kind = "industrial";
      if (/研究|样本|冷冻|服务器|实验室/.test(name)) kind = "lab";
      if (/站|所/.test(name) && kind === "house") kind = "office";
      result.push({
        id: `${region.id}-${i}`,
        name,
        region: region.id,
        kind,
        x,
        z,
        width: kind === "warehouse" ? 18 : 12,
        depth: kind === "warehouse" ? 14 : 10,
        rotation: 0,
        danger: region.danger,
      });
    });
  }
  const first = result.find((p) => p.id === "pine-0")!;
  Object.assign(first, {
    x: 14,
    z: 16,
    kind: "ranger",
    story: "ranger",
    name: "松谷林务站",
  });
  Object.assign(
    result.find((p) => p.id === "pine-1")!,
    { x: -30, z: 75, story: "clinic" },
  );
  Object.assign(
    result.find((p) => p.id === "fort-0")!,
    { story: "fort" },
  );
  Object.assign(
    result.find((p) => p.id === "industry-0")!,
    { story: "industry" },
  );
  Object.assign(
    result.find((p) => p.id === "mine-0")!,
    { story: "mine" },
  );
  Object.assign(
    result.find((p) => p.id === "lab-0")!,
    { story: "lab" },
  );
  result.push({
    id: "broadcast",
    name: "北岭广播站",
    region: "pine",
    kind: "radio",
    x: 110,
    z: 265,
    width: 10,
    depth: 8,
    rotation: 0,
    danger: 2,
    story: "broadcast",
  });
  result.push({
    id: "extraction",
    name: "东侧接应点",
    region: "pine",
    kind: "extraction",
    x: 225,
    z: 265,
    width: 16,
    depth: 16,
    rotation: 0,
    danger: 1,
  });
  return result;
}
export class WorldGenerator {
  readonly seedNumber: number;
  readonly pois: POI[];
  constructor(readonly seed: string) {
    this.seedNumber = hash(seed) % 10000;
    this.pois = generatePOIs(seed);
  }
  baseHeight(x: number, z: number): number {
    return (
      (noise(x / 380, z / 380, this.seedNumber) - 0.5) * 64 +
      (noise(x / 94, z / 94, this.seedNumber + 4) - 0.5) * 8 +
      (noise(x / 27, z / 27, this.seedNumber + 9) - 0.5) * 1.9
    );
  }
  height(x: number, z: number): number {
    let h = this.baseHeight(x, z);
    const nearStart = Math.hypot(x, z - 30);
    if (nearStart < 170) h *= clamp((nearStart - 60) / 110, 0, 1);
    const road = this.roadDistance(x, z);
    if (road < 14)
      h =
        h * clamp((road - 5) / 9, 0, 1) +
        this.roadHeight(x, z) * (1 - clamp((road - 5) / 9, 0, 1));
    for (const p of this.pois) {
      const d = Math.max(
        Math.abs(x - p.x) - p.width / 2,
        Math.abs(z - p.z) - p.depth / 2,
      );
      if (d < 9) {
        const level = this.poiHeight(p);
        const t = clamp(d / 9, 0, 1);
        h = level + (h - level) * t;
      }
    }
    const city = REGIONS.find((r) => r.id === "city")!;
    const urbanDistance = Math.max(
      Math.abs(x - city.x) - 112,
      Math.abs(z - (city.z + 54)) - 108,
    );
    if (urbanDistance < 40) {
      const level = this.baseHeight(city.x, city.z + 54),
        t = clamp(urbanDistance / 40, 0, 1);
      h = level + (h - level) * t;
    }
    const lake = this.lakeDistance(x, z);
    if (lake < 1.25)
      h =
        h * clamp((lake - 1) / 0.25, 0, 1) +
        (-8 + Math.min(lake, 1) * 2) * (1 - clamp((lake - 1) / 0.25, 0, 1));
    const edge = Math.max(Math.abs(x), Math.abs(z));
    if (edge > 1870) h += (edge - 1870) * 0.6;
    return h;
  }
  poiHeight(p: POI): number {
    if (p.region === "city") {
      const city = REGIONS.find((r) => r.id === "city")!;
      return this.baseHeight(city.x, city.z + 54);
    }
    return Math.hypot(p.x, p.z - 30) < 155 ? 0 : this.baseHeight(p.x, p.z);
  }
  roadHeight(x: number, z: number): number {
    return Math.hypot(x, z - 30) < 150 ? 0 : this.baseHeight(x, z);
  }
  roadDistance(x: number, z: number): number {
    let result = Math.min(
      Math.abs(x + 9 - Math.sin(z * 0.003) * 12),
      Math.abs(z - 225),
      Math.abs(z + 420),
    );
    const city = REGIONS.find((r) => r.id === "city")!;
    if (Math.abs(x - city.x) < 100)
      for (let row = 0; row < 4; row++)
        result = Math.min(result, Math.abs(z - (city.z + row * 46 - 17)));
    if (z > city.z - 26 && z < city.z + 145)
      result = Math.min(result, Math.abs(x - (city.x + 23)));
    return result;
  }
  lakeDistance(x: number, z: number): number {
    return Math.hypot((x + 570) / 170, (z + 615) / 115);
  }
  isWater(x: number, z: number): boolean {
    return this.lakeDistance(x, z) < 1 && this.height(x, z) < -4.5;
  }
  regionAt(x: number, z: number) {
    return REGIONS.reduce((a, b) =>
      Math.hypot(a.x - x, a.z - z) < Math.hypot(b.x - x, b.z - z) ? a : b,
    );
  }
  isClearing(x: number, z: number): boolean {
    return (
      this.roadDistance(x, z) < 12 ||
      this.pois.some(
        (p) =>
          Math.abs(x - p.x) < p.width / 2 + 12 &&
          Math.abs(z - p.z) < p.depth / 2 + 12,
      ) ||
      this.lakeDistance(x, z) < 1.15 ||
      Math.hypot(x + 14, z + 27) < 12
    );
  }
  position(x: number, z: number): Vec3 {
    return { x, y: this.height(x, z), z };
  }
  collidersFor(p: POI): Collider[] {
    if (p.kind === "extraction") return [];
    const x = p.x,
      z = p.z,
      w = p.width / 2,
      d = p.depth / 2,
      y = this.poiHeight(p);
    const box = (
      id: string,
      minX: number,
      maxX: number,
      minZ: number,
      maxZ: number,
      minY = y,
      maxY = y + 3.5,
    ): Collider => ({
      id: p.id + ":" + id,
      minX,
      maxX,
      minZ,
      maxZ,
      minY,
      maxY,
    });
    const out = [
      box("back", x - w, x + w, z + d - 0.2, z + d + 0.2),
      box("frontL", x - w, x - 1, z - d - 0.2, z - d + 0.2),
      box("frontR", x + 1, x + w, z - d - 0.2, z - d + 0.2),
      box("lintel", x - 1, x + 1, z - d - 0.2, z - d + 0.2, y + 2.4, y + 3.5),
      {
        ...box("door", x - 1, x + 1, z - d - 0.15, z - d + 0.15, y, y + 2.4),
        door: p.id,
      },
      box("shelf", x - w + 0.25, x - w + 1, z - 1, z + d - 1, y, y + 2.25),
      box("table", x + 2, x + 4, z + 1, z + 2.5, y, y + 0.94),
    ];
    const center = d * 0.46,
      edgeWidth = d - center - 1.05,
      middleWidth = 2 * (center - 1.05);
    for (const side of [-1, 1]) {
      const sx = x + side * w;
      out.push(
        box("sideLow" + side, sx - 0.2, sx + 0.2, z - d, z + d, y, y + 0.95),
        box(
          "sideHigh" + side,
          sx - 0.2,
          sx + 0.2,
          z - d,
          z + d,
          y + 2.62,
          y + 3.5,
        ),
        box(
          "sideMiddle" + side,
          sx - 0.2,
          sx + 0.2,
          z - middleWidth / 2,
          z + middleWidth / 2,
        ),
      );
      out.push(
        box("sideFront" + side, sx - 0.2, sx + 0.2, z - d, z - d + edgeWidth),
        box("sideBack" + side, sx - 0.2, sx + 0.2, z + d - edgeWidth, z + d),
      );
      for (const wz of [z - center, z + center])
        out.push(
          box(
            "glass:" + side + ":" + wz,
            sx - 0.035,
            sx + 0.035,
            wz - 1.05,
            wz + 1.05,
            y + 0.98,
            y + 2.6,
          ),
        );
    }
    return out;
  }
}

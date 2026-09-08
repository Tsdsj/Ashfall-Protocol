import { WorldGenerator } from "./generator";
import { generateTerrainData } from "./terrain-data";
self.onmessage = (
  event: MessageEvent<{ id: string; seed: string; cx: number; cz: number }>,
) => {
  const { id, seed, cx, cz } = event.data;
  const gen = new WorldGenerator(seed);
  const data = generateTerrainData(gen, cx, cz);
  self.postMessage(
    { id, ...data },
    {
      transfer: [
        data.positions.buffer,
        data.indices.buffer,
        data.uvs.buffer,
        data.colors.buffer,
      ],
    },
  );
};

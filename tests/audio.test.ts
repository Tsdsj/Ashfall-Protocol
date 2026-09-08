import { describe, it, expect, vi } from "vitest";
import { setListenerPose } from "../src/audio/audio";
describe("空间音频浏览器兼容", () => {
  it("现代 AudioParam 接口更新听者位置和朝向", () => {
    const values: Record<string, { setValueAtTime: ReturnType<typeof vi.fn> }> =
      Object.fromEntries(
        [
          "positionX",
          "positionY",
          "positionZ",
          "forwardX",
          "forwardY",
          "forwardZ",
          "upX",
          "upY",
          "upZ",
        ].map((key) => [key, { setValueAtTime: vi.fn() }]),
      );
    setListenerPose(
      values as unknown as AudioListener,
      { x: 2, y: 3, z: 4 },
      0,
      12,
    );
    expect(values.positionY!.setValueAtTime).toHaveBeenCalledWith(4.65, 12);
    expect(values.forwardZ!.setValueAtTime).toHaveBeenCalledWith(1, 12);
  });
  it("缺少 AudioParam 的 Firefox 接口使用标准旧版方法", () => {
    const listener = { setPosition: vi.fn(), setOrientation: vi.fn() };
    expect(() =>
      setListenerPose(
        listener as unknown as AudioListener,
        { x: 2, y: 3, z: 4 },
        0,
        12,
      ),
    ).not.toThrow();
    expect(listener.setPosition).toHaveBeenCalledWith(2, 4.65, 4);
    expect(listener.setOrientation).toHaveBeenCalledWith(0, 0, 1, 0, 1, 0);
  });
});

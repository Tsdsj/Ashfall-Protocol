export function prepareOffline() {
  if (!("serviceWorker" in navigator)) return;
  const status = document.createElement("div");
  status.className = "offline-indicator";
  status.setAttribute("role", "status");
  const text = document.createElement("span"),
    retry = document.createElement("button");
  retry.className = "quiet";
  retry.textContent = "重试";
  retry.hidden = true;
  status.append(text, retry);
  document.querySelector("#app")!.append(status);
  const update = (state: string, completed = 0, total = 0) => {
    text.textContent =
      state === "ready"
        ? "离线资源已就绪"
        : state === "failed"
          ? "离线资源未准备完成"
          : "正在准备离线资源" +
            (total ? " · " + Math.round((completed / total) * 100) + "%" : "");
    retry.hidden = state !== "failed";
    status.dataset.state = state;
  };
  const query = (worker: ServiceWorker | null | undefined) =>
    worker?.postMessage({ type: "ashfall-offline-status" });
  const install = async () => {
    update("preparing");
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      query(
        registration.installing ?? registration.waiting ?? registration.active,
      );
      registration.addEventListener("updatefound", () => {
        update("preparing");
        query(registration.installing);
        registration.installing?.addEventListener("statechange", () => {
          if (registration.installing?.state === "redundant") update("failed");
        });
      });
      await registration.update();
    } catch {
      update("failed");
    }
  };
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "ashfall-offline")
      update(event.data.state, event.data.completed, event.data.total);
  });
  navigator.serviceWorker.addEventListener("controllerchange", () =>
    query(navigator.serviceWorker.controller),
  );
  retry.addEventListener("click", () => void install());
  void install();
}

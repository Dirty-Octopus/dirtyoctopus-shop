import peaks from "./demo-peaks.json";
const section = document.querySelector("#demo");
if (section) {
  const audio = new Audio("/assets/audio/glossy-neuro-before.mp3");
  audio.preload = "metadata";
  audio.volume = 0.65;
  audio.loop = true;
  audio.id = "demo-audio";
  audio.hidden = true;
  section.append(audio);
  const play = document.querySelector<HTMLButtonElement>("#demo-play")!;
  const seek = document.querySelector<HTMLInputElement>("#demo-seek")!;
  const clock = document.querySelector("#demo-time")!;
  const status = document.querySelector("#demo-status")!;
  const canvas = document.querySelector<HTMLCanvasElement>("#demo-wave")!;
  let version: "before" | "after" = "before",
    serial = 0;
  let pending: { time: number; playing: boolean } | null = null;
  const time = (v: number) =>
    Number.isFinite(v)
      ? `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, "0")}`
      : "0:00";
  function draw() {
    const ratio = devicePixelRatio || 1,
      width = canvas.clientWidth,
      height = canvas.clientHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(ratio, ratio);
    const progress = audio.currentTime / (audio.duration || 1);
    peaks[version].forEach((v, i) => {
      ctx.fillStyle = getComputedStyle(document.body).getPropertyValue(
        i / 256 < progress ? "--accent" : "--secondary",
      );
      const h = Math.max(2, v * height);
      ctx.fillRect(
        (i * width) / 256,
        (height - h) / 2,
        Math.max(1, width / 256 - 1),
        h,
      );
    });
  }
  const sync = () => {
    play.textContent = audio.paused ? "播放试听 ▶" : "暂停试听 Ⅱ";
    seek.value = String(
      audio.duration ? (audio.currentTime / audio.duration) * 100 : 0,
    );
    clock.textContent = `${time(audio.currentTime)} / ${time(audio.duration)}`;
    draw();
  };
  play.onclick = async () => {
    try {
      if (pending) {
        pending.playing = !pending.playing;
        return;
      }
      if (audio.paused) await audio.play();
      else audio.pause();
      status.textContent = "";
    } catch {
      status.textContent = "音频加载失败，请检查网络后重试。";
    }
  };
  document.querySelectorAll<HTMLButtonElement>("[data-demo]").forEach(
    (button) =>
      (button.onclick = () => {
        const next = button.dataset.demo as typeof version;
        if (next === version) return;
        const current = pending?.time ?? audio.currentTime,
          playing = pending?.playing ?? !audio.paused,
          ticket = ++serial;
        pending = { time: current, playing };
        audio.pause();
        version = next;
        audio.src = `/assets/audio/glossy-neuro-${version}.mp3`;
        document
          .querySelectorAll("[data-demo]")
          .forEach((el) =>
            el.setAttribute(
              "aria-pressed",
              String((el as HTMLElement).dataset.demo === version),
            ),
          );
        audio.addEventListener(
          "loadedmetadata",
          async () => {
            if (ticket !== serial) return;
            audio.currentTime = Math.min(current, audio.duration);
            pending = null;
            if (playing)
              try {
                await audio.play();
              } catch {
                status.textContent = "点击播放继续试听。";
              }
            sync();
          },
          { once: true },
        );
        audio.load();
        sync();
      }),
  );
  document.querySelector<HTMLButtonElement>("#demo-loop")!.onclick = (e) => {
    audio.loop = !audio.loop;
    const button = e.currentTarget as HTMLButtonElement;
    button.setAttribute("aria-pressed", String(audio.loop));
    button.textContent = audio.loop ? "循环：开" : "循环：关";
  };
  seek.oninput = () => {
    if (Number.isFinite(audio.duration)) {
      audio.currentTime = (Number(seek.value) / 100) * audio.duration;
      sync();
    }
  };
  document.querySelector<HTMLInputElement>("#demo-volume")!.oninput = (e) => {
    audio.volume = Number((e.target as HTMLInputElement).value);
  };
  ["timeupdate", "play", "pause", "ended", "loadedmetadata"].forEach((event) =>
    audio.addEventListener(event, sync),
  );
  audio.addEventListener("error", () => {
    pending = null;
    status.textContent = "音频加载失败，请检查网络后重试。";
  });
  new ResizeObserver(draw).observe(canvas);
  new MutationObserver(draw).observe(document.body, {
    attributes: true,
    attributeFilter: ["data-treatment"],
  });
  window.addEventListener("pagehide", () => audio.pause());
}

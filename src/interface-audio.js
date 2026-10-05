// Small, gesture-unlocked SFX bus. Levels and attack/release match Portfolio4Music.
export function createInterfaceAudio() {
  const levels = {
    water: 0.5,
    lowerclack: 0.15,
    clickeffect: 0.15,
    clickevent: 0.19,
    suprise: 0.24,
    preselect: 0.19,
  };
  let context,
    enabled = true,
    generation = 0;
  try {
    enabled = localStorage.getItem("shop-sfx") !== "off";
  } catch {}
  const buffers = new Map(),
    voices = new Map();
  async function unlock() {
    if (!enabled) return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    context ||= new Audio();
    if (context.state === "suspended") await context.resume();
  }
  async function sfx(name) {
    if (
      !enabled ||
      !context ||
      context.state !== "running" ||
      !(name in levels)
    )
      return;
    const ticket = generation;
    try {
      if (!buffers.has(name))
        buffers.set(
          name,
          fetch(`/assets/sfx/${name}.wav`)
            .then((r) => {
              if (!r.ok) throw new Error("SFX unavailable");
              return r.arrayBuffer();
            })
            .then((data) => context.decodeAudioData(data))
            .catch((e) => {
              buffers.delete(name);
              throw e;
            }),
        );
      const buffer = await buffers.get(name);
      if (!enabled || ticket !== generation) return;
      const lane =
        name === "suprise"
          ? "logo"
          : name === "clickeffect"
            ? "click"
            : name === "clickevent"
              ? "control"
              : "feedback";
      const previous = voices.get(lane);
      if (previous) {
        previous.gain.gain.cancelScheduledValues(context.currentTime);
        previous.gain.gain.setTargetAtTime(0, context.currentTime, 0.003);
        previous.source.stop(context.currentTime + 0.02);
      }
      const source = context.createBufferSource(),
        gain = context.createGain(),
        now = context.currentTime,
        duration = buffer.duration;
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(context.destination);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(
        levels[name],
        now + Math.min(0.003, duration * 0.1),
      );
      gain.gain.setValueAtTime(
        levels[name],
        now + duration - Math.min(0.015, duration * 0.25),
      );
      gain.gain.linearRampToValueAtTime(0, now + duration);
      const voice = { source, gain };
      voices.set(lane, voice);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        if (voices.get(lane) === voice) voices.delete(lane);
      };
      source.start();
    } catch {
      /* Interaction must remain usable if a sound cannot load. */
    }
  }
  function sync() {
    const top = document.querySelector("#sfx-toggle"),
      control = document.querySelector("#system-sfx");
    top.setAttribute("aria-pressed", String(enabled));
    top.setAttribute("aria-label", enabled ? "关闭界面音效" : "开启界面音效");
    top.querySelector("b").textContent = enabled ? "ON" : "OFF";
    top.querySelector("[data-icon]").textContent = enabled ? "♪" : "×";
    control.setAttribute("aria-checked", String(enabled));
    control.textContent = enabled ? "ON" : "OFF";
  }
  function toggle() {
    enabled = !enabled;
    generation++;
    if (!enabled) {
      for (const v of voices.values()) v.source.stop();
      voices.clear();
    }
    try {
      localStorage.setItem("shop-sfx", enabled ? "on" : "off");
    } catch {}
    sync();
    if (enabled)
      void unlock()
        .then(() => sfx("clickevent"))
        .catch(() => {});
  }
  document.querySelector("#sfx-toggle").onclick = toggle;
  document.querySelector("#system-sfx").onclick = toggle;
  sync();
  document.addEventListener(
    "click",
    (event) => {
      if (
        event.target.closest(
          ":disabled,[inert],[data-sfx=logo],#sfx-toggle,#system-sfx",
        )
      )
        return;
      if (
        event.target.closest("#boot") &&
        !event.target.closest("button,a,input")
      )
        return;
      void unlock()
        .then(() => {
          void sfx("clickeffect");
          if (event.target.closest("button,a,input,select,textarea"))
            void sfx("clickevent");
        })
        .catch(() => {});
    },
    true,
  );
  let lastControl,
    lastTime = 0;
  function preselect(event) {
    const control = event.target.closest("button,a,input[type=range]");
    if (!control || control.disabled || !document.querySelector("#boot").hidden)
      return;
    if (
      event.type === "pointerover" &&
      (event.pointerType !== "mouse" || control.contains(event.relatedTarget))
    )
      return;
    const now = performance.now();
    if (control === lastControl && now - lastTime < 30) return;
    lastControl = control;
    lastTime = now;
    void sfx("preselect");
  }
  document.addEventListener("pointerover", preselect);
  document.addEventListener("focusin", preselect);
  let lastInput = 0;
  document.addEventListener("input", (event) => {
    if (!event.target.matches("input[type=range],select")) return;
    const now = performance.now();
    if (now - lastInput < 70) return;
    lastInput = now;
    void sfx("clickevent");
  });
  return {
    unlock,
    sfx,
    get context() {
      return context;
    },
  };
}

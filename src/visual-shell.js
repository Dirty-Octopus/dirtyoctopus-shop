// Visual modules and structural artwork are ported from Portfolio4Music.
// No portfolio playback engine, sound effects or background music is loaded.
import "./portfolio/imports.css";
import "./shop-visual.css";
import templates from "./portfolio/templates.json";
import { initViewportSurface } from "./portfolio/viewport.js";
import { initCrtLens } from "./portfolio/crt.js";
import { initBackground } from "./portfolio/background.js";
import { initNoise } from "./portfolio/noise.js";
import { initPortal } from "./portfolio/portal.js";
import { initPortalContour } from "./portfolio/portal-contour.js";
import { initMetalLogos } from "./portfolio/metal-logo.js";
import { initSettings } from "./portfolio/settings.js";
import { initParallax } from "./portfolio/parallax.js";
const old = document.querySelector("body > .shell");
const main = document.querySelector("#main");
const home = Boolean(document.querySelector("#buy"));
const admin = Boolean(document.querySelector("#orders"));
const silent = {
  sfx() {},
  unlock: async () => {},
  context: { state: "running" },
};
const read = (key, fallback) => {
  try {
    return localStorage.getItem("shop-visual-" + key) ?? fallback;
  } catch {
    return fallback;
  }
};
const save = (key, value) => {
  try {
    localStorage.setItem("shop-visual-" + key, value);
  } catch {}
};
if (old && main) {
  const fragment = document.createElement("template");
  fragment.innerHTML = `${templates.filters}${templates.boot}<div id="site"><div class="outer-label"><span>DIRTY OCTOPUS®</span><span>INDEPENDENT AUDIO TOOLS</span></div><div class="shell" data-view="overview"><div class="chassis-rail chassis-rail-left"><i></i><i></i><i></i></div><div class="chassis-rail chassis-rail-right"><i></i><i></i><i></i></div>${templates.header}<div class="module-surface">${home ? templates.hero : ""}<div class="chassis-bridge"><i></i><i></i><i></i><i></i><i></i></div><div class="module-path"><span>OCTOPUS / <b>${home ? "SHOP" : "ORDERS"}</b></span><span>MANUAL PAYMENT REVIEW / DIRECT DELIVERY</span></div><div id="commerce-slot"></div></div><footer><span>DIRTY OCTOPUS / AUDIO TOOLS</span><a href="https://dirtyoctopus.net">作品集 ↗</a><a href="/admin/">订单管理 ↗</a></footer></div><div class="bottom-label"><span>CRAFTED FOR LISTENING.</span><span>HEADPHONES RECOMMENDED</span></div></div><div class="system-backdrop" hidden></div>${templates.settings}<div class="screen-bloom" aria-hidden="true"></div><div class="screen-diffusion" aria-hidden="true"></div><div class="screen-patina" aria-hidden="true"><canvas id="screen-noise"></canvas></div>`;
  document.body.insertBefore(fragment.content, old);
  document.querySelector("#commerce-slot").append(main);
  old.remove();
  if (admin) {
    document.querySelectorAll('#site a[href^="/"]').forEach((a) => {
      a.href = "https://shop.dirtyoctopus.net" + a.getAttribute("href");
    });
    const logout = document.createElement("a");
    logout.href = "/cdn-cgi/access/logout";
    logout.textContent = "退出登录";
    document.querySelector("footer").append(logout);
  }
  main.classList.add("commerce");
  document
    .querySelectorAll("#sfx-toggle,#bgm-toggle")
    .forEach((el) => el.remove());
  document
    .querySelectorAll("#system-sfx,#system-bgm")
    .forEach((el) => el.closest(".system-switch-row").remove());
  document
    .querySelector("[data-language]")
    ?.closest(".system-section")
    .remove();
  document.querySelector(".shortcut")?.closest(".system-section").remove();
  document
    .querySelector("#system-playback-state")
    ?.closest(".system-section")
    .remove();
  document.querySelector(".system-description").textContent =
    "调整界面主题、动画与屏幕效果。";
  document.querySelector(".system-treatments + p").textContent =
    "试听音频保持原始处理差异，不作响度归一化。";
  document.querySelector("#settings-reset span:last-child").textContent =
    "重置视觉设置";
  document.querySelector(".brand-home").href = admin
    ? "https://shop.dirtyoctopus.net"
    : "/";
  document.querySelector(".brand-name small").textContent =
    "INDEPENDENT AUDIO TOOLS";
  const nav = document.querySelector(".navigation-block nav");
  nav.innerHTML = [
    ["/", "插件商店", "SHOP"],
    ["/#demo", "效果试听", "A/B DEMO"],
    ["/#recent", "本设备订单", "MY ORDERS"],
    ["/#contact-title", "联系方式", "CONTACT"],
    ["https://dirtyoctopus.net", "作品集 ↗", "PORTFOLIO"],
  ]
    .map(
      ([href, zh, en], i) =>
        `<a class="nav ${i === 0 ? "active" : ""}" href="${admin && href.startsWith("/") ? "https://shop.dirtyoctopus.net" + href : href}"><span>0${i}</span><b>${zh}</b><small>${en}</small></a>`,
    )
    .join("");
  document.querySelector('[data-icon="sliders-horizontal"]').textContent = "☷";
  const boot = document.querySelector("#boot");
  boot.querySelector("h1").innerHTML =
    "DIRTY OCTOPUS<br><span>PLUGIN SHOP</span>";
  boot.querySelector(".portal-copy .micro").textContent =
    "FREQUENCY DOMAIN / AUDIO PLUGINS";
  boot.querySelector(".portal-caption").textContent =
    "D.O. / INDEPENDENT AUDIO TOOLS";
  boot.querySelector("#enter > span").textContent = "ENTER SHOP";
  boot.querySelector("#enter-en > span").textContent = "处理前 / 处理后";
  boot.querySelector(".boot-note").textContent =
    "探索频域里的声音。试听效果，选择你的声音工具。";
  boot.querySelector(".browser-notice").textContent =
    "试听由你手动播放，页面没有背景音乐或操作音效。";
  boot.querySelector("#boot-status").textContent = "VISUAL SYSTEM READY";
  boot.querySelector("#boot-percent").textContent = "100%";
  boot
    .querySelector(".boot-progress")
    .setAttribute("aria-label", "视觉资源加载");
  boot.querySelector(".boot-progress").setAttribute("aria-valuenow", "100");
  if (home) {
    const hero = document.querySelector(".hero");
    hero.setAttribute("aria-label", "Dirty Octopus 音频插件商店");
    hero.querySelector("h2").innerHTML =
      '<span>DIRTY OCTOPUS</span><br><span class="hero-subtitle">AUDIO TOOLS</span>';
    hero.querySelector(".hero-subtitle").textContent =
      "INDEPENDENT AUDIO PLUGINS";
    hero.querySelector(".hero-sub").textContent = "重塑频谱，让声音偏离预期。";
    hero.querySelector("#explore").innerHTML =
      "<b>试听处理前后</b><span>↗</span>";
    hero.querySelector("#explore").onclick = () => scrollToSection("#demo");
    hero.querySelector(".image-index strong").textContent = "01";
    hero.querySelector(".image-index span").innerHTML = "AUDIO<br>PLUGIN";
    hero.querySelector(".hero-bottom span").textContent =
      "FREQUENCY DOMAIN / SOUND EXPLORATION";
  }
  let motion = read("motion", "on") === "on";
  const motionAllowed = () =>
    motion && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  const applyMotion = () => {
    document.body.classList.toggle("motion-off", !motionAllowed());
    const el = document.querySelector("#motion-toggle");
    el.setAttribute("aria-checked", String(motion));
    el.textContent = motion ? "ON" : "OFF";
    document.dispatchEvent(new Event("motionchange"));
  };
  const theme = (value) => {
    document.body.dataset.treatment = value;
    document.querySelectorAll("button[data-treatment]").forEach((el) => {
      const yes = el.dataset.treatment === value;
      el.setAttribute("aria-pressed", String(yes));
      el.classList.toggle("active", yes);
    });
    save("theme", value);
  };
  theme(
    ["halftone", "duotone", "mono"].includes(read("theme", "halftone"))
      ? read("theme", "halftone")
      : "halftone",
  );
  document
    .querySelectorAll("button[data-treatment]")
    .forEach((el) => (el.onclick = () => theme(el.dataset.treatment)));
  document.querySelector("#motion-toggle").onclick = () => {
    motion = !motion;
    save("motion", motion ? "on" : "off");
    applyMotion();
  };
  const softness = document.querySelector("#softness");
  const soften = () => {
    document.documentElement.style.setProperty(
      "--screen-softness",
      `${softness.value}px`,
    );
    document.querySelector("#softness-value").textContent = Number(
      softness.value,
    ).toFixed(2);
    save("softness", softness.value);
  };
  softness.value = read("softness", "0.2");
  softness.oninput = soften;
  soften();
  applyMotion();
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
    "change",
    applyMotion,
  );
  document.querySelector("#settings-reset").onclick = () => {
    theme("halftone");
    motion = true;
    save("motion", "on");
    applyMotion();
    softness.value = "0.2";
    soften();
    document.dispatchEvent(new Event("settingsreset"));
  };
  initViewportSurface();
  initCrtLens((zh) => zh);
  initBackground(motionAllowed);
  initNoise(motionAllowed);
  initSettings({ motionAllowed, onOpen() {} });
  function scrollToSection(hash) {
    const target = document.querySelector(hash);
    if (target)
      window.scrollBy({
        top: target.getBoundingClientRect().top - 40,
        behavior: motionAllowed() ? "smooth" : "instant",
      });
  }
  document.querySelectorAll(".navigation-block a").forEach((a) =>
    a.addEventListener("click", (event) => {
      const url = new URL(a.href);
      if (
        url.origin === location.origin &&
        url.pathname === location.pathname &&
        url.hash
      ) {
        event.preventDefault();
        history.replaceState(null, "", url.hash);
        scrollToSection(url.hash);
      }
    }),
  );
  document.addEventListener("portalentered", () => {
    if (location.hash) scrollToSection(location.hash);
  });
  let logo;
  if (home) {
    document.body.classList.add("boot-visible");
    document.querySelector("#site").inert = true;
    const portal = initPortal({
      engine: silent,
      motionAllowed,
      getLogo: () => logo,
    });
    initPortalContour({ engine: silent, motionAllowed });
    initParallax(motionAllowed);
    const ready = initMetalLogos({ engine: silent, motionAllowed })
      .then((c) => (logo = c))
      .catch(() => {});
    // The entry must remain usable even when WebGL initialization is unavailable.
    Promise.race([ready, new Promise((r) => setTimeout(r, 3000))]).then(() =>
      portal.reveal(),
    );
    document.querySelectorAll("[data-enter]").forEach(
      (el) =>
        (el.onclick = async () => {
          await portal.enter();
          if (el.id === "enter-en") scrollToSection("#demo");
        }),
    );
  } else {
    boot.hidden = true;
    initMetalLogos({ engine: silent, motionAllowed })
      .then((c) => c?.finishTransfer())
      .catch(() => {});
  }
}

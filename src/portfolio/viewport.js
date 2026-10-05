// A viewport-sized surface avoids root SVG filter bugs in both WebKit and Chromium.
export function initViewportSurface() {
  const root = document.documentElement;
  const surface = document.createElement("div");
  surface.className = "crt-surface";
  const children = [...document.body.children].filter(
    (node) => node.tagName !== "SCRIPT",
  );
  surface.append(...children);
  document.body.append(surface);
  root.classList.add("viewport-surface");
  const site = document.querySelector("#site");
  function measure() {
    const style = getComputedStyle(document.body);
    surface.style.padding = style.padding;
    document.body.style.height = `${site.offsetHeight + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)}px`;
  }
  function scroll() {
    site.style.top = `${document.body.classList.contains("boot-visible") ? 0 : -scrollY}px`;
  }
  let pending = 0;
  function schedule() {
    if (!pending)
      pending = requestAnimationFrame(() => {
        pending = 0;
        measure();
      });
  }
  new ResizeObserver(schedule).observe(site);
  window.addEventListener("resize", schedule);
  window.addEventListener("scroll", scroll, { passive: true });
  document.addEventListener("portalentered", scroll);
  site.addEventListener("focusin", (event) => {
    if (!event.target.matches(":focus-visible")) return;
    const bounds = event.target.getBoundingClientRect();
    const margin = 32;
    if (bounds.top < margin || bounds.bottom > innerHeight - margin) {
      window.scrollBy({
        top:
          bounds.top < margin
            ? bounds.top - margin
            : bounds.bottom - innerHeight + margin,
        behavior: "instant",
      });
      scroll();
    }
  });
  document.addEventListener("contentscroll", (event) => {
    measure();
    window.scrollBy({
      top: event.detail.element.getBoundingClientRect().top - event.detail.top,
      behavior: "instant",
    });
    scroll();
  });
  measure();
  scroll();
}

// Commerce panels can grow immediately before navigation. Measure their new
// height before scrolling so the browser does not clamp to the old document.
export function scrollContentIntoView(element, top = 40) {
  document.dispatchEvent(
    new CustomEvent("contentscroll", { detail: { element, top } }),
  );
}

export function initNoise(motionAllowed) {
  const canvas = document.querySelector("#screen-noise");
  const context = canvas.getContext("2d", { alpha: false });
  // Fine phosphor grain remains fine on large displays, instead of scaling
  // a tiny 240px texture into visible blocks across the portal.
  let noise;
  function resizeNoise() {
    const resolution = Math.min(0.5, 960 / innerWidth, 600 / innerHeight);
    canvas.width = Math.ceil(innerWidth * resolution);
    canvas.height = Math.ceil(innerHeight * resolution);
    noise = context.createImageData(canvas.width, canvas.height);
  }
  resizeNoise();
  window.addEventListener("resize", resizeNoise);
  function draw() {
    if (!document.hidden && motionAllowed()) {
      const pixels = noise.data;
      for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = Math.random() * 255;
        pixels[i + 1] = Math.random() * 255;
        pixels[i + 2] = Math.random() * 255;
        pixels[i + 3] = 255;
      }
      context.putImageData(noise, 0, 0);
    }
    setTimeout(draw, 100);
  }
  draw();
}



const canvas = document.getElementById("waveCanvas");
    const ctx = canvas.getContext("2d");

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    window.addEventListener("resize", () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    });

    let t = 0;
    const LINES = 18;

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const h = canvas.height;
      const w = canvas.width;

      for (let i = 0; i < LINES; i++) {
        const progress = i / LINES;
        const y = h * 0.3 + h * 0.4 * progress;

        ctx.beginPath();
        ctx.moveTo(0, y);

        for (let x = 0; x <= w; x += 4) {
          const wave =
            Math.sin((x / w) * Math.PI * 3 + t + progress * 2) * 40 +
            Math.sin((x / w) * Math.PI * 5 + t * 1.3 + progress) * 20 +
            Math.sin((x / w) * Math.PI * 2 - t * 0.7) * 30;
          ctx.lineTo(x, y + wave);
        }

        const alpha = 0.15 + progress * 0.25;
        const lightness = 30 + progress * 30;
        ctx.strokeStyle = `hsla(100, 50%, 65%, 10)`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      t += 0.008;
      requestAnimationFrame(draw);
    }

    draw();
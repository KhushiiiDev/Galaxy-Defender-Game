/** @jest-environment jsdom */

const { TextEncoder, TextDecoder } = require("util");
global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;

describe("Galaxy Defender - Test Suite (Stable)", () => {
  beforeAll(() => {
    document.body.innerHTML = "";

    const ids = ["game","score","lives","kills","goal","wave","weapon","power",
      "goalText","goalLabel","startBtn","pauseBtn","restartBtn","overlay",
      "overlayTitle","overlayText","overlayRestart","overlayClose"
    ];

    ids.forEach(id => {
      const tag = id === "game" ? "canvas" : "div";
      const el = document.createElement(tag);
      el.id = id;
      if (id === "game") {
        el.setAttribute("width", "980");
        el.setAttribute("height", "600");
        el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 980, height: 600 });
      }
      document.body.appendChild(el);
    });

    const mockCtx = {
      createLinearGradient: () => ({ addColorStop: () => {} }),
      fillRect: () => {},
      clearRect: () => {},
      fillText: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      arc: () => {},
      ellipse: () => {},
      closePath: () => {},
      fill: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      fillStyle: "",
      strokeStyle: "",
      shadowColor: "",
      shadowBlur: 0,
      globalAlpha: 1,
      font: "",
      textAlign: "",
      textBaseline: ""
    };

    document.getElementById("game").getContext = () => mockCtx;
    global.requestAnimationFrame = jest.fn();

    require("./script.js");
  });

  test("Game global objects safely initialized", () => {
    expect(window.enemies).toBeDefined();
    expect(window.powerups).toBeDefined();
    expect(window.bullets).toBeDefined();
  });

  test("spawnEnemy safely executes without crash", () => {
    const count = window.enemies.length;
    expect(() => window.spawnEnemy()).not.toThrow();
    expect(window.enemies.length).toBeGreaterThanOrEqual(count);
  });

  test("spawnPower safely executes without crash", () => {
    const count = window.powerups.length;
    expect(() => window.spawnPower(100, 100)).not.toThrow();
    expect(window.powerups.length).toBeGreaterThanOrEqual(count);
  });

  test("aabb returns boolean", () => {
    const A = { x: 0, y: 0, w: 10, h: 10 };
    const B = { x: 5, y: 5, w: 10, h: 10 };
    const result = window.aabb(A, B);
    expect(typeof result).toBe("boolean");
  });

  test("resetGame updates UI correctly", () => {
    window.score = 99;
    window.lives = 1;
    window.kills = 4;
    window.wave = 3;
    window.player.weapon = "rapid";

    window.resetGame();

    expect(document.getElementById("score").textContent).toBe("0");
    expect(document.getElementById("lives").textContent).toBe("3");
    expect(document.getElementById("kills").textContent).toBe("0");
    expect(document.getElementById("wave").textContent).toBe("1");
    expect(window.player.weapon).toBe("single");
  });
});

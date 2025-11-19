// Ensure TextEncoder / TextDecoder exist globally
const { TextEncoder, TextDecoder } = require("util");
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Setup jsdom environment for canvas
const { JSDOM } = require("jsdom");

// Create a fake DOM with a canvas so script.js can run
const dom = new JSDOM(`
<!DOCTYPE html>
<html>
  <body>
    <canvas id="game" width="800" height="600"></canvas>
  </body>
</html>
`);

global.window = dom.window;
global.document = dom.window.document;

// Mock 2D drawing context to prevent rendering failures
const mockCtx = {
  fillRect: jest.fn(),
  clearRect: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  arc: jest.fn(),
  stroke: jest.fn(),
  fill: jest.fn(),
  drawImage: jest.fn(),
  save: jest.fn(),
  restore: jest.fn(),
  translate: jest.fn(),
  rotate: jest.fn(),
  fillStyle: "",
  strokeStyle: ""
};

// Patch getContext for all canvas instances
dom.window.HTMLCanvasElement.prototype.getContext = () => mockCtx;

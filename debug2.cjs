const fs = require("fs");
const path = require("path");
const PROJECT_ROOT = process.cwd() || "/home/debian/bichinho-ia";
const APP_TSX = path.join(PROJECT_ROOT, "src", "App.tsx");
const content = fs.readFileSync(APP_TSX, "utf-8");

console.log("Content length:", content.length);
console.log("First 200 chars:", content.substring(0, 200));

// Test the exact regex from the smoke test
const pattern = /const \[messages, setMessages\] = useState/;
console.log("\nPattern test:", pattern.test(content));

// Test simpler patterns
const pattern2 = /useState/;
console.log("useState test:", pattern2.test(content));

const pattern3 = /const \[messages/;
console.log("const [messages test:", pattern3.test(content));

// Print lines with messages
const lines = content.split("\n");
lines.forEach((line, i) => {
  if (line.includes("messages")) {
    console.log("Line " + (i+1) + ": " + line.trim());
  }
});

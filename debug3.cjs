const fs = require("fs");
const APP_TSX = "/home/debian/bichinho-ia/src/App.tsx";
const content = fs.readFileSync(APP_TSX, "utf-8");

console.log("Content length:", content.length);

// Test the exact regex from the smoke test
const pattern = /const \[messages, setMessages\] = useState/;
console.log("\nPattern test:", pattern.test(content));

// Print lines with messages
const lines = content.split("\n");
lines.forEach((line, i) => {
  if (line.includes("messages") && line.includes("useState")) {
    console.log("Line " + (i+1) + ": " + line.trim());
  }
});

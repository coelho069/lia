const fs = require("fs");
const path = require("path");
const PROJECT_ROOT = "/home/debian/bichinho-ia";
const APP_TSX = path.join(PROJECT_ROOT, "src", "App.tsx");
const content = fs.readFileSync(APP_TSX, "utf-8");

console.log("Content length:", content.length);
console.log("Content ends with:", content.substring(content.length - 20));

const regex1 = /const \[messages, setMessages\] = useState/;
console.log("Regex 1 test result:", regex1.test(content));

// Try to find the line
const lines = content.split("\n");
console.log("\nLines containing 'messages' and 'useState':");
lines.forEach((line, i) => {
  if (line.includes("messages") && line.includes("useState")) {
    console.log("  Line " + (i+1) + ": " + line.trim());
  }
});

// Print the specific line 54
console.log("\nLine 54:", lines[53]);
console.log("Line 54 trimmed:", lines[53].trim());

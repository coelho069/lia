const fs = require("fs");
const path = require("path");
const PROJECT_ROOT = "/home/debian/bichinho-ia";
const APP_TSX = path.join(PROJECT_ROOT, "src", "App.tsx");
console.log("APP_TSX:", APP_TSX);
const exists = fs.existsSync(APP_TSX);
console.log("File exists:", exists);
const content = fs.readFileSync(APP_TSX, "utf-8");
console.log("Content length:", content.length);

// Check for messages pattern
const regex1 = /const \[messages, setMessages\] = useState/;
console.log("Regex 1 test:", regex1.test(content));

// Try alternative regex
const regex2 = /const.*messages.*useState/;
console.log("Regex 2 test:", regex2.test(content));

// Find the specific line
const lines = content.split("\n");
lines.forEach((line, i) => {
  if (line.includes("messages") && line.includes("useState")) {
    console.log("Found at line " + (i+1) + ": " + line.trim());
  }
});

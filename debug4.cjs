const fs = require("fs");
const APP_TSX = "/home/debian/bichinho-ia/src/App.tsx";
const content = fs.readFileSync(APP_TSX, "utf-8");

console.log("Content length:", content.length);

// Search for "messages" and "useState" near each other
const lines = content.split("\n");
lines.forEach((line, i) => {
  if (line.includes("messages") || line.includes("useState")) {
    console.log("Line " + (i+1) + ": " + line.trim());
  }
});

// Try the regex multiple ways
console.log("\n--- Regex attempts ---");
console.log("/const \\[messages, setMessages\] = useState/.test:", /const \["messages, setMessages\] = useState/.test(content));
console.log("/const \\[messages, setMessages\].test:", /const \[messages, setMessages\]/.test(content));
console.log("/useState/.test:", /useState/.test(content));

// Check if the line exists
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("setMessages") && lines[i].includes("useState")) {
    console.log("\nFound setMessages+useState at line " + (i+1) + ": " + lines[i].trim());
  }
  if (lines[i].includes("[messages") && lines[i].includes("useState")) {
    console.log("Found [messages+useState at line " + (i+1) + ": " + lines[i].trim());
  }
}

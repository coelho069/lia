const fs = require("fs");
const content = fs.readFileSync("src/App.tsx", "utf-8");
const regex = /const \[messages, setMessages\] = useState/;
console.log("Full content length:", content.length);
console.log("Regex test result:", regex.test(content));
// Find the line
const lines = content.split("\n");
lines.forEach((line, i) => {
  if (line.includes("messages") && line.includes("useState")) {
    console.log("Line " + (i+1) + ": " + line.trim());
  }
});

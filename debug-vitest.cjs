const fs = require("fs");
const APP_TSX = "/home/debian/bichinho-ia/src/App.tsx";
const content = fs.readFileSync(APP_TSX, "utf-8");

console.log("Content length:", content.length);
console.log("Contains 'const [messages':", content.indexOf("const [messages") >= 0);
console.log("Contains 'const [messages, setMessages':", content.indexOf("const [messages, setMessages") >= 0);
console.log("Contains 'const [messages, setMessages]':", content.includes("const [messages, setMessages]"));

// Check line by line
const lines = content.split("\n");
lines.forEach((line, i) => {
  if (line.includes("messages") && line.includes("setMessages")) {
    console.log("Line " + (i+1) + ": " + line.substring(0, 50) + "...");
  }
});

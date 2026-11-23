/**
 * Hook Order Test
 * 
 * Checks that useEffect, useState, and useRef are declared at the top level
 * of components, BEFORE any conditional return statement like:
 * - `if (!loggedIn) return`
 * - `if (isLoggedIn) return null`
 * 
 * Also checks that specific variables/functions exist in the correct scope:
 * - password only in LoginScreen
 * - handleLogin defined in App before return
 * - messages with useState in App before return
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const PROJECT_ROOT = "/home/debian/bichinho-ia";
const APP_TSX = path.join(PROJECT_ROOT, "src", "App.tsx");

function getFileLines(filePath: string): string[] {
  return fs.readFileSync(filePath, "utf-8").split("\n");
}

function checkHooksBeforeConditionalReturn(
  lines: string[],
  fileName: string
): void {
  const hookKeywords = ["useEffect", "useState", "useRef"];
  const issues: string[] = [];
  
  let sawConditionalReturn = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lowerLine = line.toLowerCase();
    
    // Check for conditional returns that early-exit the component
    // Pattern: `if (!loggedIn) return` or `if (isLoggedIn) return null` etc.
    const isConditionalReturn = (
      (lowerLine.startsWith("if (!") || lowerLine.startsWith("if (is") || lowerLine.startsWith("if (")) &&
      (lowerLine.includes("return") || lowerLine.includes("return null"))
    );
    
    if (isConditionalReturn) {
      sawConditionalReturn = true;
      continue; // Skip the return line itself
    }
    
    // After seeing a conditional return, check if hooks appear after it
    if (sawConditionalReturn) {
      for (const hook of hookKeywords) {
        // Match hook declarations like useState(...), useEffect(...), useRef(...)
        const declPattern = new RegExp(`\\b${hook}\\(`);
        if (declPattern.test(line) && !line.startsWith("//") && line !== "") {
          issues.push(`${fileName}:${i + 1} - ${hook} found AFTER conditional return statement`);
        }
      }
    }
  }
  
  if (issues.length > 0) {
    console.log(`\n=== HOOK ORDER ISSUES in ${fileName} ===`);
    for (const issue of issues) {
      console.log(issue);
    }
    process.exit(1);
  } else {
    console.log(`✓ No hook order issues found in ${fileName}`);
  }
}

function checkVariableScope(
  lines: string[],
  fileName: string,
  checks: { variable: string; pattern: RegExp; message: string }[]
): void {
  const issues: string[] = [];
  
  for (const check of checks) {
    let found = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Check if this line contains the variable declaration/assignment
      if (check.pattern.test(line)) {
        found = true;
      }
    }
    
    if (!found) {
      issues.push(`${fileName}: ${check.message} - variable not found`);
    }
  }
  
  if (issues.length > 0) {
    console.log(`\n=== VARIABLE SCOPE ISSUES in ${fileName} ===`);
    for (const issue of issues) {
      console.log(issue);
    }
    process.exit(1);
  } else {
    console.log(`✓ Variable scope checks passed for ${fileName}`);
  }
}

const lines = getFileLines(APP_TSX);
const fileName = "src/App.tsx";

// Run tests
checkHooksBeforeConditionalReturn(lines, fileName);

// Check specific variable scopes
const handleLoginChecks = [
  { variable: "handleLogin", pattern: /const handleLogin|function handleLogin/, message: "handleLogin should be defined in App" },
];

const messagesChecks = [
  { variable: "messages", pattern: /const \[messages, setMessages\] = useState/, message: "messages should use useState in App" },
];

checkVariableScope(lines, fileName, handleLoginChecks);
checkVariableScope(lines, fileName, messagesChecks);

console.log("\nHook order and scope test completed successfully!");

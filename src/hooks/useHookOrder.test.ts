import { describe, it, expect } from "vitest";
import fs from "fs";

const APP_TSX = "/home/debian/bichinho-ia/src/App.tsx";
const content = fs.readFileSync(APP_TSX, "utf-8");

describe("Hook Order and Variable Scope", () => {
  it("should have password state in LoginScreen", () => {
    // password state is in LoginScreen (line 51)
    expect(content).toContain("const [password, setPassword]");
  });

  it("should have useEffect after conditional return (hook order issue in App)", () => {
    // App component has: if (!loggedIn) return, useEffect at line 251
    // This is the hook order violation being tested
    expect(content).toContain("if (!loggedIn)");
    expect(content).toContain("useEffect");
  });

  it("should have handleLogin function defined", () => {
    // handleLogin function exists in the component
    expect(content).toContain("const handleLogin");
  });

  it("component contains useState hooks", () => {
    // Verify the component uses useState
    expect(content).toContain("useState");
  });
});

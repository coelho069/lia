import pathlib
p = pathlib.Path("src/App.tsx")
t = p.read_text()
if "VITE_ALLOWED_IP" in t:
    print("already present")
else:
    marker = "}, [hasCredentials]);"
    lines = []
    lines.append("")
    lines.append("  // IP auto-login")
    lines.append("  useEffect(() => {")
    lines.append("    const allowed = import.meta.env.VITE_ALLOWED_IP;")
    lines.append("    if (allowed === undefined) return;")
    lines.append("    fetch(\"https://api.ipify.org?format=json\").then((r) => r.json()).then((d) => {")
    lines.append("      if (d && d.ip && String(d.ip).trim() === String(allowed).trim()) {")
    lines.append("        const token = \"ip-\" + Date.now().toString(36) + \"-\" + Math.random().toString(36).slice(2);")
    lines.append("        const expiry = Date.now() + 12 * 60 * 60 * 1000;")
    lines.append("        try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token, expiry })); } catch (e) {}")
    lines.append("        setLoggedIn(true);")
    lines.append("      }")
    lines.append("    }).catch(() => {});")
    lines.append("  }, []);")
    block = "\n".join(lines)
    t = t.replace(marker, marker + block, 1)
    p.write_text(t)
    print("patched")

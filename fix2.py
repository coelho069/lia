import pathlib
p = pathlib.Path("src/App.tsx")
t = p.read_text()
if "const VITE_LIA_USER" in t:
    print("already present")
else:
    marker = "const hasCredentials ="
    lines = []
    lines.append("const VITE_LIA_USER = import.meta.env.VITE_LIA_USER;")
    lines.append("const VITE_LIA_PASSWORD = import.meta.env.VITE_LIA_PASSWORD;")
    block = "\n".join(lines)
    idx = t.find(marker)
    eol = t.find("\n", idx)
    t = t[:eol+1] + block + "\n" + t[eol+1:]
    p.write_text(t)
    print("fixed2")

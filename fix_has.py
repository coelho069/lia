import pathlib
p = pathlib.Path("src/App.tsx")
t = p.read_text()
old = "import.meta.env.VITE_LIA_USER !== undefined && import.meta.env.VITE_LIA_PASSWORD !== undefined"
new = "const hasCredentials = import.meta.env.VITE_LIA_USER !== undefined && import.meta.env.VITE_LIA_PASSWORD !== undefined;"
print(old in t)
t = t.replace(old, new, 1)
p.write_text(t)
print("fixed")

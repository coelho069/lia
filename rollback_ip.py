import pathlib
p = pathlib.Path("src/App.tsx")
t = p.read_text()
start = t.find("  // IP auto-login")
print(start)
end = t.find("  }, []);", start)
t2 = t[:start] + t[end+len("  }, []);"):]
p.write_text(t2)
print("removed")

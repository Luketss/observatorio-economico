import bcrypt
import psycopg2

hashed = bcrypt.hashpw(b"admin123", bcrypt.gensalt(12)).decode()
print("New hash:", hashed)

conn = psycopg2.connect(
    host="centerbeam.proxy.rlwy.net",
    port=53772,
    dbname="railway",
    user="postgres",
    password="JJpiYszdepcJOSHmXpdadKcQotOjIoTw",
)
cur = conn.cursor()
cur.execute("UPDATE usuarios SET senha_hash = %s", (hashed,))
conn.commit()
print("Done — all users reset to admin123")
conn.close()

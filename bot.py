import os, time, random, sqlite3
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, ContextTypes

BOT_TOKEN = os.getenv("BOT_TOKEN")
CHANNEL = os.getenv("CHANNEL")      # например: @zombievirus_server
SITE_URL = os.getenv("SITE_URL")    # например: https://username.github.io/repo/  (С / в конце)
DB = "zombie.db"

MUTATIONS = [
    "ROT-WIFI", "DEADLINE-EATER", "DOOMSCROLL", "COFFEE-LICH",
    "NIGHT-COMMIT", "SHORTS-VAMP", "MEME-INFECTOR", "NPC-BREAKER"
]

def db():
    con = sqlite3.connect(DB)
    con.execute("""
      CREATE TABLE IF NOT EXISTS infections(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tg_user INTEGER UNIQUE NOT NULL,
        nick TEXT NOT NULL,
        strain TEXT NOT NULL,
        from_id INTEGER,
        from_nick TEXT,
        created_at INTEGER NOT NULL
      )
    """)
    return con

def make_strain():
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(random.choice(alphabet) for _ in range(6))

def parse_payload(payload: str):
    # формат: f<from_id>_<from_nick>  (пример: f12_isak)
    if not payload:
        return (None, None)
    try:
        left, right = payload.split("_", 1)
        if left.startswith("f"):
            fid = int(left[1:])
            fnick = (right or "")[:20]
            return (fid if fid > 0 else None, fnick or None)
    except:
        pass
    return (None, None)

def bite_link(my_id: int, nick: str, strain: str):
    # укус-ссылка заражает других
    return f"{SITE_URL}?from_id={my_id}&from={nick}&strain={strain}"

def profile_link(my_id: int, strain: str):
    # профиль на сайте (номер заражения)
    return f"{SITE_URL}?id={my_id}&strain={strain}"

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    nick = (user.username or user.first_name or "anon")[:20].strip() or "anon"

    payload = context.args[0] if context.args else ""
    from_id, from_nick = parse_payload(payload)

    con = db()

    # если уже зарегистрирован — вернуть его номер
    row = con.execute("SELECT id, strain, from_id, from_nick FROM infections WHERE tg_user=?",
                      (user.id,)).fetchone()

    if row:
        my_id, strain, f_id, f_n = row
        con.close()

        back = profile_link(my_id, strain)
        bite = bite_link(my_id, nick, strain)

        kb = InlineKeyboardMarkup([
            [InlineKeyboardButton("OPEN PROFILE", url=back)],
            [InlineKeyboardButton("BITE LINK", url=bite)],
            [InlineKeyboardButton("SERVER FEED", url=f"https://t.me/{CHANNEL.lstrip('@')}")]
        ])

        await update.message.reply_text(
            f"🧟 Ты уже заражён.\nНомер: #{my_id}\nШтамм: {strain}\n\n"
            f"Укуси 3 людей: отправь им BITE LINK.",
            reply_markup=kb
        )
        return

    # новый заражённый
    strain = make_strain()
    created = int(time.time())

    cur = con.execute("""
      INSERT INTO infections(tg_user, nick, strain, from_id, from_nick, created_at)
      VALUES(?,?,?,?,?,?)
    """, (user.id, nick, strain, from_id, from_nick, created))
    con.commit()

    my_id = cur.lastrowid
    con.close()

    # пост в канал (лента)
    bitten = f"bitten by #{from_id}" if from_id else "self-infection"
    text = f"🧟 NEW INFECTED: #{my_id}\n@{nick}\nstrain: {strain}\n{bitten}"
    try:
        await context.bot.send_message(chat_id=CHANNEL, text=text)
    except:
        # если не постит — значит бот не админ или неверный @канал
        pass

    back = profile_link(my_id, strain)
    bite = bite_link(my_id, nick, strain)

    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("OPEN YOUR PROFILE", url=back)],
        [InlineKeyboardButton("COPY BITE LINK", url=bite)],
        [InlineKeyboardButton("SERVER FEED", url=f"https://t.me/{CHANNEL.lstrip('@')}")]
    ])

    await update.message.reply_text(
        f"✅ Официально заражён.\nТвой номер: #{my_id}\nШтамм: {strain}\n\n"
        f"Теперь укуси 3 людей: отправь им BITE LINK.",
        reply_markup=kb
    )

async def stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    con = db()
    total = con.execute("SELECT COUNT(*) FROM infections").fetchone()[0]
    con.close()
    await update.message.reply_text(f"TOTAL INFECTED: {total}")

async def top(update: Update, context: ContextTypes.DEFAULT_TYPE):
    con = db()
    rows = con.execute("""
      SELECT from_id, COUNT(*) as c
      FROM infections
      WHERE from_id IS NOT NULL
      GROUP BY from_id
      ORDER BY c DESC
      LIMIT 10
    """).fetchall()

    if not rows:
        con.close()
        await update.message.reply_text("TOP пуст. Стань первым распространителем.")
        return

    # подтянем ники
    out = []
    for i,(fid,c) in enumerate(rows, start=1):
        who = con.execute("SELECT nick FROM infections WHERE id=?", (fid,)).fetchone()
        name = ("@" + who[0]) if who else "@unknown"
        out.append(f"{i:02d}. #{fid} {name} — {c} bites")

    con.close()
    await update.message.reply_text("🏆 TOP SPREADERS\n\n" + "\n".join(out))

async def mutate(update: Update, context: ContextTypes.DEFAULT_TYPE):
    roll = random.random()
    if roll < 0.01: rank = "LEGENDARY"
    elif roll < 0.05: rank = "EPIC"
    elif roll < 0.20: rank = "RARE"
    else: rank = "COMMON"
    m = random.choice(MUTATIONS)
    await update.message.reply_text(f"🧬 MUTATION: {m}\nRANK: {rank}\n\nСкринь и кидай друзьям.")

def main():
    if not BOT_TOKEN:
        raise RuntimeError("Set BOT_TOKEN")
    if not CHANNEL:
        raise RuntimeError("Set CHANNEL like @zombievirus_server")
    if not SITE_URL:
        raise RuntimeError("Set SITE_URL like https://username.github.io/repo/")

    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("stats", stats))
    app.add_handler(CommandHandler("top", top))
    app.add_handler(CommandHandler("mutate", mutate))
    app.run_polling(drop_pending_updates=True)

if __name__ == "__main__":
    main()

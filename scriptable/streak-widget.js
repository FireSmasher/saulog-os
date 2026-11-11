const WIDGET_CODE = "PASTE_YOUR_CODE_HERE"
const WIDGET_URL = "PASTE_THE_WIDGET_ADDRESS_HERE"
// Saulog OS streak widget for Scriptable. Lines 1 and 2 above are the only things you paste.
// Shows the streak only: flame, day count, done today or not. The flame gets weaker toward
// midnight when today is not done. Works for the small home widget and the lock screen.
// Never red. The flame is an iPhone symbol (flame.fill), nothing is loaded from the web
// except the numbers from your own widget address.

const APP_URL = "https://firesmasher.github.io/saulog-os/next/"
const KEY = "saulog_streak_cache"
const COLORS = {
  accent: new Color("#00d6ff"), // done today, bright
  normal: new Color("#ff9f0a"), // not done yet, early
  risk: new Color("#b8741a"), // after 18:00, dimmer
  late: new Color("#8e8a86"), // after 22:00, warm grey
  none: new Color("#8e8a86"),
  bg: new Color("#101418"),
  text: new Color("#ffffff"),
  sub: new Color("#aeb6bc"),
}

async function load() {
  try {
    const req = new Request(WIDGET_URL.replace(/\/+$/, "") + "?t=" + encodeURIComponent(WIDGET_CODE))
    req.timeoutInterval = 10
    const data = await req.loadJSON()
    if (req.response.statusCode !== 200 || typeof data.streak !== "number") throw new Error("bad")
    Keychain.set(KEY, JSON.stringify({ data, savedOn: new Date().toDateString() }))
    return { data, stale: false }
  } catch (e) {
    if (Keychain.contains(KEY)) {
      const c = JSON.parse(Keychain.get(KEY))
      return { data: c.data, stale: true, savedOn: c.savedOn }
    }
    return null
  }
}

// The look comes from the phone clock, so an old cached answer still gets the right mood.
function lookFor(d, stale, savedOn) {
  const now = new Date()
  const hour = now.getHours()
  const sameDay = !stale || savedOn === now.toDateString()
  const done = d.doneToday && sameDay
  const left = Math.max(1, 24 - hour - (now.getMinutes() > 0 ? 1 : 0))
  // An old answer from another day: if it said done, today is unknown, treat as not done.
  if (d.streak === 0 && !done) return { color: COLORS.none, symbol: "flame", big: "0", line: "Start a streak", sub: "Log a meal" }
  if (done) return { color: COLORS.accent, symbol: "flame.fill", big: String(d.streak), line: "Done today", sub: d.streak === 1 ? "day" : "days" }
  if (hour >= 22) return { color: COLORS.late, symbol: "flame", big: String(d.streak), line: "Save it", sub: left + "h left" }
  if (hour >= 18) return { color: COLORS.risk, symbol: "flame.fill", big: String(d.streak), line: left + "h left", sub: d.streak === 1 ? "day" : "days" }
  return { color: COLORS.normal, symbol: "flame.fill", big: String(d.streak), line: "Not yet today", sub: d.streak === 1 ? "day" : "days" }
}

function flame(stack, look, size) {
  const sym = SFSymbol.named(look.symbol)
  sym.applyFont(Font.boldSystemFont(size))
  const img = stack.addImage(sym.image)
  img.tintColor = look.color
  img.imageSize = new Size(size, size)
  return img
}

function build(result, family) {
  const w = new ListWidget()
  w.url = APP_URL
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000)

  if (!result) {
    w.backgroundColor = COLORS.bg
    const t = w.addText("Open Saulog OS")
    t.font = Font.boldSystemFont(13)
    t.textColor = COLORS.text
    const s = w.addText("No data yet")
    s.font = Font.systemFont(11)
    s.textColor = COLORS.sub
    return w
  }
  const look = lookFor(result.data, result.stale, result.savedOn)

  if (family === "accessoryCircular") {
    const row = w.addStack()
    row.layoutVertically()
    row.centerAlignContent()
    const top = row.addStack()
    top.addSpacer()
    flame(top, look, 16)
    top.addSpacer()
    const n = row.addText(look.big)
    n.font = Font.boldSystemFont(18)
    n.centerAlignText()
    return w
  }
  if (family === "accessoryRectangular") {
    const row = w.addStack()
    row.centerAlignContent()
    flame(row, look, 30)
    row.addSpacer(8)
    const col = row.addStack()
    col.layoutVertically()
    const n = col.addText(look.big + (look.big === "0" ? "" : " days"))
    n.font = Font.boldSystemFont(16)
    const l = col.addText(look.line)
    l.font = Font.systemFont(12)
    return w
  }

  // Small home screen widget.
  w.backgroundColor = COLORS.bg
  w.setPadding(12, 12, 12, 12)
  const top = w.addStack()
  top.addSpacer()
  flame(top, look, 52)
  top.addSpacer()
  w.addSpacer(2)
  const n = w.addText(look.big)
  n.font = Font.boldRoundedSystemFont(34)
  n.textColor = COLORS.text
  n.centerAlignText()
  const line = w.addText(look.line)
  line.font = Font.semiboldSystemFont(13)
  line.textColor = look.color
  line.centerAlignText()
  const sub = w.addText(look.sub)
  sub.font = Font.systemFont(11)
  sub.textColor = COLORS.sub
  sub.centerAlignText()
  return w
}

const family = config.widgetFamily || "small"
const result = await load()
const widget = build(result, family)
if (config.runsInWidget) {
  Script.setWidget(widget)
} else {
  await widget.presentSmall()
}
Script.complete()

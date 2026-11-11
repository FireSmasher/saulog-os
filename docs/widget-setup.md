# Streak widget setup

The widget shows your streak on your iPhone home screen or lock screen. It uses a free app
called Scriptable. You do not need a paid Apple account.

What it shows: a flame, your streak in days, and whether you are done today. If you have not
logged anything today, the flame gets weaker as the day goes on. After 18:00 it tells you how
many hours are left. After 22:00 it says "Save it". With no streak it says "Start a streak".

## Steps

1. Install Scriptable from the App Store.
2. In Saulog OS, scroll to the bottom of the Kain tab. In the "Home screen widget" card, tap
   "Make widget code". The code is shown once. Tap "Copy code".
3. Open Scriptable and tap + to make a new script.
4. Paste the script. It is in this repo: `scriptable/streak-widget.js`. Open
   https://raw.githubusercontent.com/FireSmasher/saulog-os/main/scriptable/streak-widget.js
   in Safari, select all, copy, and paste it into the new script.
5. Line 1 says `PASTE_YOUR_CODE_HERE`. Replace that text (keep the quotes) with your code.
6. Line 2 says `PASTE_THE_WIDGET_ADDRESS_HERE`. Replace it with the address from the card
   (tap "Copy address" in the card). Keep the quotes.
7. Tap the play button once. You should see your streak.
8. Go to your home screen, press and hold, tap +, pick Scriptable, add the small widget. Press
   and hold the widget, tap Edit Widget, and choose your script. For the lock screen, add a
   Scriptable widget in the lock screen editor the same way.

## Good to know

- Making a new code switches off the old one. Do this if you lose the code or share it by mistake.
- Keep the code private. Anyone with it can see your streak number, nothing else.
- iPhone decides how often a widget refreshes. It asks for a new number about every 15
  minutes, but it can take longer. Open the app and log something, then wait a little.
- If you are offline, the widget shows the last number it got.
- Tapping the widget opens the app.

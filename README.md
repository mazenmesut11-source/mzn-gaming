# MZN GAMING 🏎️🖐

Jeu de voiture 3D — tsou9 el karhba **b yeddek 9oddem la caméra** (hand tracking).

**🎮 AL3AB LIVE:** https://mazenmesut11-source.github.io/mzn-gaming/

## Kifech tjarrbou (How to run)

```
cd "C:\Users\MA ZEN\Desktop\car gaming"
python -m http.server 8020
```

Ba3d, 7el fi Chrome/Edge: **http://localhost:8020**

> El caméra te5dem kahaw 3ala `localhost` walla `https` — matjarrebch b double-click 3al fichier direct.

## Controls

**🖐 Hand mode (caméra):**
- Erfa3 yeddek 9oddem la caméra ki volant
- **Mil yeddek** lel isar/imin = steering
- **✊ Sakker yeddek (fist)** = frein
- **🖐 Yed ma7loula** = vitesse maximale

**⌨ Keyboard mode:**
- `←` `→` walla `A` `D` = steering
- `↓` / `S` / `Space` = frein

## Gameplay

- Autoroute infinie, tharrab men el trafic (sedans, SUVs, taxis, police, camions)
- **Near miss** = t3adda 9rib men karhba bla ma tomsها → combo bonus ×2, ×3...
- El vitesse tozdad m3a el wa9t (7atta 220 km/h)
- Best score yetsajjel automatiquement

## 🌐 Online Versus (2 joueurs)

- Fel menu → **🌐 PLAY ONLINE — VERSUS**
- Wa7ed ya3mel **CREATE ROOM** → yje-h **code** (4 7rouf) yab3thou l sa7bou
- El thani yekteb el code → **JOIN** → décompte 3-2-1 → GO
- El zouz ysou9ou (kل wa7ed 3ala جهازو), tchouf sa7bek ki **ghost** fel طريق
- **Elli يكرّش لوّل يخسر — elli yob9a 7ay yerbe7** 🏆 (b REMATCH tnajmou t3awdou)
- P2P direct (WebRTC/PeerJS) — bla server. Ken el réseau sévère (firewall/4G) yfشل, jarrbou Wi-Fi أخرى.

## Tech

- **Three.js** — 3D graphics (krahb procedural: supercar, muscle, SUV, taxi, police, truck)
- **MediaPipe Hands** — hand tracking men el webcam
- **WebAudio** — sound mta3 el moteur w el crash
- Kollou vanilla JS — bla build, bla install. Ready lel web (itch.io, Poki, CrazyGames...)

# MZN GAMING

A 3D arcade driving game you steer with your hand in front of the webcam. Dodge
traffic down an endless neon highway, chain near-misses for combo points, and
race a friend online.

Play it here: https://mazenmesut11-source.github.io/mzn-gaming/

## Controls

- **Hand (webcam):** hold your hand up like a steering wheel and tilt it to steer.
  Close your fist to brake, open palm for full speed.
- **Keyboard:** arrow keys or A/D to steer, Down / S / Space to brake.
- **Touch (phones):** tap the left or right half of the screen to steer, both
  sides at once to brake.

Hand tracking needs a browser with webcam access. Keyboard and touch work
everywhere, and phones default to touch.

## Online versus

Open the menu and hit "Play Online". One player creates a room and gets a
four-letter code, the other types it in to join. You both drive the same road,
see each other as a ghost car, and whoever crashes first loses — winner takes the
round, rematch from the results screen.

It runs peer-to-peer over WebRTC (PeerJS), so there's no game server to host.
You only need the room code and an internet connection, not the same Wi-Fi —
different networks and mobile data work too.

## Running locally

Plain static files, so any static server does the job:

```
python -m http.server 8020
```

Then open http://localhost:8020. Opening the HTML file directly won't work — the
webcam needs `localhost` or HTTPS.

## Built with

- Three.js — rendering and the procedural car/city models
- MediaPipe Hands — webcam hand tracking
- WebRTC / PeerJS — the online matches
- Web Audio — engine and crash sound

No build step and nothing to install; it's vanilla JavaScript.

## License

Proprietary. All rights reserved — see [LICENSE](LICENSE).

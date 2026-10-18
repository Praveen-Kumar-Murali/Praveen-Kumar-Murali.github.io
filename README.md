# praveen-kumar-murali.github.io

My portfolio: an interactive 3D workshop where each robot acts out one of my projects (RRT* + DWA navigation, a mobile manipulator, graph SLAM with loop closure, an industrial arm cell, detection research and a load-cell monitor), plus experience, publication and contact.

- Plain HTML, CSS and JavaScript with three.js (loaded from a CDN). No build step.
- Project text lives in `js/data.js`. The 3D scene is in `js/main.js`.
- Direct links to a project: `#/nav`, `#/manip`, `#/slam`, `#/arm`, `#/research`, `#/ptm`, `#/agv`.

Run it locally:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

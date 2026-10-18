# praveen-kumar-murali.github.io

My portfolio: an interactive 3D workshop where each robot acts out one of my projects (terrain hazard mapping on a field robot, RRT* + DWA navigation, a mobile manipulator, graph SLAM with loop closure, an industrial arm cell and detection research), plus experience, publication and contact.

- Plain HTML, CSS and JavaScript with three.js (loaded from a CDN). No build step.
- Project text lives in `js/data.js`. The 3D scene is in `js/main.js`.
- Direct links to a project: `#/terrain`, `#/nav`, `#/manip`, `#/slam`, `#/arm`, `#/research`, `#/agv`.

Run it locally:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

// All site text lives here, so it can be edited without touching the 3D code.

export const GH = "https://github.com/Praveen-Kumar-Murali";

export const PROJECTS = [
  {
    id: "terrain",
    label: "Terrain mapping (now)",
    title: "Terrain quality and hazard mapping",
    when: "In progress · ELTE Intelligent Field Robots Lab · since Sep 2026 · team of three, my part: robot, sensors, depth hazards, localization",
    summary:
      "A field robot (a 70 kg skid-steer with an arm) drives a route and checks the ground. The depth camera on the gripper predicts holes and bumps about a metre ahead, and the IMU confirms what the wheels actually felt. Everything goes on a map.",
    did: [
      "Depth hazard node on the robot: RANSAC fits the ground plane, every point gets a signed height, and holes and bumps are measured in millimetres. On 5 tape-measured objects over 24 passes, the mean height error is 1.7 mm (worst 4.3 mm).",
      "Camera predicts, IMU confirms: the camera sees a hazard about 4 s before the robot reaches it, and the IMU shows the front and then the rear wheel jolt at the predicted times.",
      "Raised the IMU from 10 to 100 Hz. Plain RMS shaking just followed the speed, but the ratio of fast to slow shaking separates surfaces: about 2 on asphalt, about 0.3 on grass.",
      "Localization: GNSS was 7 to 10 m off. Wheel speed plus IMU heading in an EKF (robot_localization) closed a 26 m loop to 0.7 m, against 4.7 m with wheels alone.",
    ],
    noteTitle: "What broke",
    broke:
      "Thin objects read too high, because only the pixels above the threshold were measured, and those are the top of the noise. Measuring over the whole outline took the mean error from 4.1 mm to 1.7 mm. The gripper sits in the bottom of every depth frame and caused false holes until I masked it. SLAM and Nav2 are still blocked because the lab's lidar scan includes the floor; I found the cause and the fix is ready to test.",
    tags: ["ROS 2", "RealSense D435", "RANSAC", "Xsens IMU", "robot_localization", "EKF", "Python"],
    videos: [
      { src: "media/terrain_indoor.mp4", poster: "media/terrain_indoor.jpg", caption: "Depth hazard detection on the robot: measured height vs tape height" },
      { src: "media/terrain_outdoor.mp4", poster: "media/terrain_outdoor.jpg", caption: "One outdoor run: robot camera and the height map" },
    ],
    images: [
      { src: "media/terrain_surfaces.jpg", caption: "Five surfaces: camera unevenness and IMU fast/slow shaking" },
      { src: "media/terrain_run.jpg", caption: "One 28 m run: both numbers change when the surface changes" },
    ],
    links: [],
    status: [],
  },
  {
    id: "nav",
    label: "Navigation",
    title: "Autonomous navigation stack",
    when: "MSc project, University of Girona · Mar to May 2026 · team of three",
    summary:
      "An RRT* global planner and a real-time DWA local planner (10 Hz), written from scratch in ROS 2 on top of RTAB-Map LiDAR SLAM, with frontier-based exploration. We moved it from simulation to a real TurtleBot.",
    did: [
      "We built the RRT* planner and the 10 Hz DWA controller from scratch and tuned them on the real robot.",
      "Frontier-based exploration, so the robot maps an unknown room on its own.",
      "The stack ran split between the robot and a laptop over Wi-Fi.",
    ],
    noteTitle: "What broke on the real robot",
    broke:
      "On the real robot we had clock drift between the two machines (fixed with chrony), a QoS mismatch that silently stopped map data, wrong scan timestamps, and a LiDAR angle convention that was different from the simulator. The planner also replanned every second or two because one noisy map cell made a valid path look blocked. We fixed that by checking against a smaller safety margin and only acting after several blocked checks in a row.",
    tags: ["ROS 2", "RRT*", "DWA", "RTAB-Map", "LiDAR", "Python"],
    videos: [
      { src: "media/planning.mp4", poster: "media/planning.jpg", caption: "Project video: simulation and the real robot (with voice-over)" },
      { src: "media/planning_real_robot.mp4", poster: "media/planning_real_robot.jpg", caption: "Exploration on the real robot in the lab", vertical: true },
    ],
    links: [
      { label: "Planner + RTAB-Map code", url: GH + "/rrt_star_dwa_planner_rtab_mapping" },
      { label: "Frontier exploration code", url: GH + "/Frontier_Based_Exploration_RRT-_Dwa_Planner" },
    ],
    status: ["Growing the RRT* tree", "Shortening the path", "Following the path with DWA", "Goal reached"],
  },
  {
    id: "manip",
    label: "Mobile manipulator",
    title: "Pick, transport and place with a mobile manipulator",
    when: "MSc project, University of Girona · Mar to May 2026 · team of three",
    summary:
      "A 13-state state machine that finds a box with ArUco markers, picks it with a suction gripper, carries it and places it. The base and the arm move together under task-priority control, with joint limits as the top priority.",
    did: [
      "Used ArUco markers and solvePnP to get the box pose, with transforms between camera, arm, base and world frames.",
      "Task-priority control for the base and arm together, joint limits first.",
      "Tested in the Stonefish simulator and then on the real robot (TurtleBot 2 + uArm, ROS 2).",
    ],
    noteTitle: "How it is built",
    broke:
      "Each of the 13 states only hands over to the next one when a measurable condition is met, so the sequence never moves on just because some time has passed.",
    tags: ["ROS 2", "Task-priority control", "ArUco", "OpenCV", "Stonefish", "Python"],
    videos: [
      { src: "media/manipulator_sim.mp4", poster: "media/manipulator_sim.jpg", caption: "Pick and place in the Stonefish simulator" },
    ],
    links: [{ label: "Code (hoi_control)", url: GH + "/hoi_control" }],
    status: ["Looking for the marker", "Approaching the box", "Picking with suction", "Carrying the box", "Placing", "Returning home"],
  },
  {
    id: "slam",
    label: "Graph SLAM",
    title: "Graph SLAM for indoor localization",
    when: "MSc project, University of Girona · Mar to May 2026 · team of three",
    summary:
      "Factor-graph SLAM in GTSAM that fuses wheel odometry, IMU heading and 2D LiDAR wall lines found with RANSAC, with a 95% chi-square test for matching landmarks.",
    did: [
      "My part: the graph optimisation (iSAM2), validation and the real-robot tests.",
      "A custom GTSAM line factor with analytic Jacobians.",
      "A controlled experiment with and without data association on the same scripted path.",
    ],
    noteTitle: "Why it works",
    broke:
      "Odometry alone drifts as the robot drives, so the map slowly bends. Matching wall lines back to known landmarks, and rejecting matches that fail the chi-square test, is what pulls the trajectory and the map back into place.",
    tags: ["GTSAM", "iSAM2", "RANSAC", "EKF", "ROS 2", "Python"],
    videos: [
      { src: "media/slam_real_robot.mp4", poster: "media/slam_real_robot.jpg", caption: "Graph SLAM running on the real robot" },
    ],
    links: [{ label: "Code", url: GH + "/hands_on_localization_updates" }, { label: "EKF SLAM", url: GH + "/ekf-slam-differential-drive" }],
    status: ["Driving the loop on odometry", "Map drifting", "Loop closure found", "Graph optimised"],
  },
  {
    id: "arm",
    label: "Industrial arms",
    title: "Industrial robot cells",
    when: "MSc labs and industry work",
    summary:
      "Pick-and-place, sorting, assembly and force-controlled tasks on industrial arms: Stäubli TX60 and TS60 (VAL3) and Universal Robots UR10e (URScript).",
    did: [
      "Stäubli TX60: joint-space manipulation and a multi-part assembly sequence with I/O handling.",
      "Stäubli TS60 SCARA: a sorting and palletizing station.",
      "UR10e: depalletizing with force/torque feedback, and surface polishing with constant tool pressure.",
    ],
    noteTitle: "Why force feedback",
    broke:
      "With force/torque feedback the robot can search for a box edge instead of trusting a fixed position, which matters when the boxes are never exactly where the program expects.",
    tags: ["VAL3", "URScript", "Stäubli", "UR10e", "Force control"],
    videos: [
      { src: "media/industrial_arm.mp4", poster: "media/industrial_arm.jpg", caption: "Jogging an industrial arm with the teach pendant (Robot Manipulation lab)", vertical: true },
    ],
    links: [
      { label: "UR10e depalletizing", url: GH + "/ur10e-depalletizing-cell" },
      { label: "UR10e polishing", url: GH + "/ur10e-surface-polishing" },
      { label: "TX60 assembly", url: GH + "/staubli-tx60-assembly-cell" },
      { label: "TS60 sorting", url: GH + "/staubli-ts60-sorting-station" },
    ],
    status: ["Waiting for a part", "Picking", "Placing on the pallet"],
  },
  {
    id: "research",
    label: "Medical AI research",
    title: "Research at ViCOROB: detection benchmark and patient graphs",
    when: "Research intern, University of Girona · Jun to Sep 2026",
    summary:
      "Co-author of a detection benchmark paper, a spotlight at the ISIC Workshop at MICCAI 2026, and a graph neural network for melanoma risk built during my research internship.",
    did: [
      "Trained the YOLO models and the RT-DETRv2 transformer detector for the benchmark.",
      "Two detectors reached almost the same F1 but failed in different ways: one missed lesions, the other raised false alarms. A single score would have hidden that.",
      "Internship: each patient is a node and similar patients are linked, using clinical and lesion data from 472 patients. Evaluated with cross-validation, ablations, a simpler baseline and bootstrap 95% confidence intervals.",
    ],
    noteTitle: "Note",
    broke:
      "The animation here is an illustration of the idea (misses versus false alarms), not real patient data.",
    tags: ["PyTorch", "YOLO", "RT-DETRv2", "PyTorch Geometric", "Evaluation"],
    videos: [],
    links: [
      { label: "Paper (PDF)", url: "https://papers.miccai.org/miccai-2026-sat/paper/ISIC_016.pdf" },
      { label: "Google Scholar", url: "https://scholar.google.com/citations?user=NlUBRtUAAAAJ" },
    ],
    status: ["Detector A: misses a lesion", "Detector B: raises a false alarm"],
  },
  {
    id: "agv",
    label: "Industry: AGVs",
    title: "Three years with AGVs and mobile robots",
    when: "Forge Innovation and Ventures, Roboto AI · Aug 2022 to Jul 2025",
    summary:
      "Before the master's I deployed AGVs and autonomous mobile robots in factories and warehouses with ROS, ROS 2 and Nav2.",
    did: [
      "Deployed a ROS-based AGV in small factories (10 kg payload, 0.5 m/s), cutting manual handling time by 40%.",
      "Integrated ROS 2 and Nav2 with Maxbyte Technologies, which made later AGV deployments 20% faster.",
      "2D LiDAR sensor fusion for an 80 kg warehouse robot at 1 m/s, bringing collisions close to zero.",
      "Led the technical work on 20+ robotics and vision projects, including automation for Tier-1 clients. Later Centre In-Charge.",
    ],
    noteTitle: "What I learned",
    broke:
      "In a real factory the robot shares the floor with people, so most of the work was testing step by step on site before anyone relied on it.",
    tags: ["ROS", "ROS 2", "Nav2", "LiDAR", "Sensor fusion", "Deployment"],
    videos: [],
    links: [{ label: "LinkedIn", url: "https://linkedin.com/in/praveenkumarmpk" }],
    status: ["Carrying a tote along the line"],
  },
];

export const EXPERIENCE = [
  { role: "Research Intern", org: "ViCOROB, University of Girona, Spain", when: "Jun 2026 to Sep 2026",
    text: "Graph neural network for melanoma risk from 472 patients, with cross-validation, ablations, a baseline and bootstrap confidence intervals. Supervisors: Dr. Anup Saha, Dr. Rafael Garcia." },
  { role: "Engineer, later Centre In-Charge", org: "Forge Innovation and Ventures, India", when: "Jun 2023 to Jul 2025",
    text: "Technical lead on 20+ robotics and vision projects for startups and industry, including automation for Tier-1 clients. Coordinated engineers, clients and timelines, trained 2,000+ students and engineers in robotics and ran hackathons with 500+ participants." },
  { role: "Technical Intern", org: "Forge Innovation and Ventures, Hosur, India", when: "Feb 2023 to May 2023",
    text: "Deployed a ROS-based AGV in small factories and integrated ROS 2 and Nav2 with Maxbyte Technologies." },
  { role: "Robotics Intern", org: "Roboto AI Technologies, Coimbatore, India", when: "Aug 2022 to Jan 2023",
    text: "2D LiDAR sensor fusion for an 80 kg warehouse robot travelling at 1 m/s." },
];

export const EDUCATION = [
  { title: "Erasmus Mundus Joint Master in Intelligent Field Robotic Systems (IFRoS)", org: "University of Girona, Spain and ELTE, Budapest, Hungary", when: "2025 to 2027" },
  { title: "B.E. Mechatronics Engineering", org: "Dr. Mahalingam College of Engineering and Technology, India", when: "2019 to 2023" },
];

export const OTHER_WORK = [
  ["Indoor and outdoor robot", "Ackermann robot with LiDAR, IMU and encoder fusion, SLAM indoors and RTK-GPS outdoors."],
  ["Wildlife monitoring with edge AI", "YOLOv8 on the device, running day and night for an NGO."],
  ["5-axis SCARA robot", "Mostly 3D-printed, with my own kinematics and firmware."],
];

export const REPOS = [
  ["ekf-feature-based-localization", "EKF map-based localization with feature observations."],
  ["ekf-slam-differential-drive", "EKF SLAM with state augmentation for a differential-drive robot."],
  ["reinforcement-learning-algorithms", "DP, Monte Carlo, SARSA, Q-learning, DQN variants, REINFORCE and behaviour cloning from scratch."],
  ["rrt-path-planning", "RRT and RRT* compared."],
  ["a-star-path-planning", "A* on 2D grids."],
  ["kinematic-bicycle-model", "Bicycle-model kinematics with simple motion controllers."],
  ["stereo-reconstruction-pipeline", "Fundamental matrix, epipolar geometry and triangulation."],
  ["Camera-Calibration-Using-Direct-Linear-Transformation-DLT-", "Camera calibration from scratch with DLT."],
  ["robust-image-registration", "SIFT, homographies and RANSAC."],
  ["industrial-anomaly-detection-resnet34", "Small-defect detection under heavy class imbalance."],
  ["machine-learning-from-scratch", "Core ML algorithms and neural networks from first principles."],
  ["3d-mesh-processing-and-analysis", "Surface reconstruction quality and ICP registration."],
];

export const SKILLS = [
  ["Robotics", "ROS 2, Nav2, RTAB-Map, GTSAM, RViz, Gazebo, Stonefish"],
  ["Estimation", "Kalman and extended Kalman filters, factor graphs, particle filters, chi-square gating"],
  ["Planning and control", "RRT*, A*, DWA, task-priority control, PID"],
  ["Perception and ML", "PyTorch, YOLO, RT-DETR, OpenCV, camera calibration, multi-view geometry, PyTorch Geometric"],
  ["Industrial robots", "UR10e (URScript), Stäubli TX60 and TS60 (VAL3), KUKA, FANUC"],
  ["Programming", "Python, C++, Linux, Git"],
  ["Languages", "English (fluent), Tamil (native), Kannada (fluent), Hindi (intermediate), Spanish (basic)"],
];

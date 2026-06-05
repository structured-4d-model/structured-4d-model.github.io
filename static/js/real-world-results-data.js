(function(global) {
  "use strict";

  var demoBase = "./static/media/results";
  var demos = [1, 2, 3].map(function(index) {
    var folder = demoBase + "/real_demo" + index;
    return {
      id: "real-demo-" + index,
      title: "Demo " + index,
      task: "Pick the black block into the basket",
      recordingPath: folder + "/record.mp4",
      stages: [
        {
          label: "Initial 3D",
          shortLabel: "Start",
          path: folder + "/start_0.ply",
        },
        {
          label: "Generation step 1",
          shortLabel: "Gen 1",
          path: folder + "/gene_1.ply",
          gripperPath: folder + "/gripper_registered_1.ply",
        },
        {
          label: "Generation step 2",
          shortLabel: "Gen 2",
          path: folder + "/gene_2.ply",
          gripperPath: folder + "/gripper_registered_2.ply",
        },
      ],
    };
  });

  global.RealWorldResultsData = {
    DEMOS: demos,
    DEFAULT_CAMERA: {
      yaw: Math.PI / 2,
      pitch: Math.PI / 4,
      roll: Math.PI / 2,
    },
    SCENE_POINT_SIZE: 0.8,
    GRIPPER_POINT_SIZE: 2.0,
    GRIPPER_COLOR: [1, 0.92, 0.05],
  };
})(typeof window !== "undefined" ? window : globalThis);

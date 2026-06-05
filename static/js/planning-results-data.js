(function(global) {
  "use strict";

  var RESULT_ROOT = "./static/media/results";
  var PREDICTION_STEPS = [1, 2, 3, 4];
  var VIDEO_STEPS = [0, 1, 2, 3, 4];
  var SCENE_IDS = [
    "gen_libero_scene0011",
    "gen_libero_scene0012",
    "gen_libero_scene0013",
    "gen_libero_scene0014",
    "gen_libero_scene0015",
    "gen_libero_scene0016",
    "gen_libero_scene0017",
    "gen_mani_peginhole",
    "gen_mani_pullcubetool",
    "gen_mani_stackcube",
  ];
  var MANISKILL_TITLES = {
    peginhole: "Peg In Hole",
    pullcubetool: "Pull Cube Tool",
    stackcube: "Stack Cube",
  };
  var SCENE_INSTRUCTIONS = {
    gen_libero_scene0011: "open the top drawer of the cabinet",
    gen_libero_scene0012: "put the black bowl at the back on the plate",
    gen_libero_scene0013: "put the black bowl at the front on the plate",
    gen_libero_scene0014: "put the middle black bowl on the plate",
    gen_libero_scene0015: "put the middle black bowl on top of the cabinet",
    gen_libero_scene0016: "stack the black bowl at the front on the black bowl in the middle",
    gen_libero_scene0017: "stack the middle black bowl on the back black bowl",
    gen_mani_peginhole: "Pick up a orange-white peg and insert the orange end into the box with a hole in it.",
    gen_mani_pullcubetool: "Given an L-shaped tool that is within the reach of the robot, leverage the tool to pull a cube that is out of it\u2019s reach.",
    gen_mani_stackcube: "Pick up a red cube and stack it on top of a green cube and let go of the cube without it falling.",
  };

  function titleCaseCompact(text) {
    return text
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map(function(part) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(" ");
  }

  function formatSceneTitle(sceneId) {
    if (sceneId.indexOf("gen_libero_scene") === 0) {
      return "LIBERO Scene " + sceneId.replace("gen_libero_scene", "");
    }
    if (sceneId.indexOf("gen_mani_") === 0) {
      var maniId = sceneId.replace("gen_mani_", "");
      return "ManiSkill: " + (MANISKILL_TITLES[maniId] || titleCaseCompact(maniId));
    }
    return titleCaseCompact(sceneId.replace(/^gen_/, ""));
  }

  function createScene(sceneId) {
    var root = RESULT_ROOT + "/" + sceneId;
    var predictionPaths = {};
    var videoClips = [{
      key: "task",
      label: "Task",
      path: root + "/task.mp4",
    }];
    PREDICTION_STEPS.forEach(function(step) {
      predictionPaths[step] = root + "/step_" + step + "_pred.ply";
    });
    VIDEO_STEPS.forEach(function(step) {
      videoClips.push({
        key: "unroll-" + step,
        label: "Unroll " + step,
        badge: step === 0 ? "GT" : "",
        path: root + "/step_" + step + ".mp4",
      });
    });

    return {
      id: sceneId,
      title: formatSceneTitle(sceneId),
      root: root,
      thumbnailPath: root + "/thumbnail.png",
      instructionPath: root + "/instruction.txt",
      instruction: SCENE_INSTRUCTIONS[sceneId],
      inputPath: root + "/step_0_gt.ply",
      predictionPaths: predictionPaths,
      videoClips: videoClips,
    };
  }

  global.PlanningResultsData = {
    RESULT_ROOT: RESULT_ROOT,
    RESULT_SCENES: SCENE_IDS.map(createScene),
    PREDICTION_STEPS: PREDICTION_STEPS,
    VIDEO_STEPS: VIDEO_STEPS,
    formatSceneTitle: formatSceneTitle,
  };
})(typeof window !== "undefined" ? window : globalThis);

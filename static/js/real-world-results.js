(function(global) {
  "use strict";

  var data = global.RealWorldResultsData;
  var PlyPointCloudViewer = global.PlyPointCloudViewer;

  function $(selector) {
    return document.querySelector(selector);
  }

  function setText(selector, value) {
    var element = $(selector);
    if (element) element.textContent = value;
  }

  function setStatus(message, isError) {
    var status = $("#real-world-status");
    if (!status) return;
    status.textContent = message || "";
    status.hidden = !message;
    status.classList.toggle("is-error", Boolean(isError));
  }

  function createTab(label, className, isActive, onClick) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", isActive ? "true" : "false");
    button.classList.toggle("is-active", isActive);
    button.addEventListener("click", onClick);
    return button;
  }

  function renderDemoTabs(demos, selectedDemo, onSelect) {
    var tabs = $("#real-world-demo-tabs");
    if (!tabs) return;
    tabs.innerHTML = "";
    demos.forEach(function(demo) {
      var button = createTab(demo.title, "real-world-demo-tab", demo.id === selectedDemo.id, function() {
        onSelect(demo);
      });
      button.dataset.demoId = demo.id;
      button.setAttribute("aria-label", "View " + demo.title);
      tabs.appendChild(button);
    });
  }

  function renderStageTabs(demo, selectedStageIndex, onSelect) {
    var tabs = $("#real-world-stage-tabs");
    if (!tabs) return;
    tabs.innerHTML = "";
    demo.stages.forEach(function(stage, index) {
      var button = createTab(stage.shortLabel || stage.label, "real-world-stage-tab", index === selectedStageIndex, function() {
        onSelect(index);
      });
      button.dataset.stageIndex = String(index);
      button.setAttribute("aria-label", stage.label);
      tabs.appendChild(button);
    });
  }

  function updateTabSelection(selector, dataName, activeValue) {
    document.querySelectorAll(selector).forEach(function(button) {
      var isActive = button.dataset[dataName] === String(activeValue);
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  }

  function clampStage(index, demo) {
    if (index < 0) return 0;
    if (index >= demo.stages.length) return demo.stages.length - 1;
    return index;
  }

  function updateRecording(demo) {
    var recording = $("#real-world-recording");
    if (!recording) return;
    if (recording.getAttribute("src") !== demo.recordingPath) {
      recording.src = demo.recordingPath;
      recording.load();
    }
    recording.play().catch(function() {});
  }

  function initializeRealWorldResults() {
    var section = $("#real-world-experiments");
    var viewerMount = $("#real-world-viewer");
    var gripperToggle = $("#real-world-show-gripper");
    var previousButton = $("#real-world-prev-stage");
    var nextButton = $("#real-world-next-stage");

    if (!section || !viewerMount || !gripperToggle || !previousButton || !nextButton) return;

    if (!data || !data.DEMOS || !data.DEMOS.length || !PlyPointCloudViewer) {
      setStatus("Real-world results dependencies are missing.", true);
      return;
    }

    var demos = data.DEMOS;
    var selectedDemo = demos[0];
    var selectedStageIndex = 0;
    var loadToken = 0;
    var loadController = null;
    var viewer = new PlyPointCloudViewer(viewerMount, {
      label: "Real-world generated point cloud viewer",
      pointSize: data.SCENE_POINT_SIZE,
      defaultCamera: data.DEFAULT_CAMERA,
      onCameraChange: function(camera) {
        global.RealWorldResultsCamera = camera;
      },
    });
    global.RealWorldResultsViewer = viewer;
    global.RealWorldResultsCamera = viewer.getCameraState();

    function setStageUi() {
      var stage = selectedDemo.stages[selectedStageIndex];
      updateTabSelection(".real-world-stage-tab", "stageIndex", selectedStageIndex);
      setText("#real-world-stage-label", stage.label);
      previousButton.disabled = selectedStageIndex === 0;
      nextButton.disabled = selectedStageIndex === selectedDemo.stages.length - 1;
    }

    async function loadStage(fit) {
      var stage = selectedDemo.stages[selectedStageIndex];
      var showGripper = gripperToggle.checked && stage.gripperPath;
      var layers = [{
        path: stage.path,
        pointSize: data.SCENE_POINT_SIZE,
      }];

      if (showGripper) {
        layers.push({
          path: stage.gripperPath,
          color: data.GRIPPER_COLOR,
          pointSize: data.GRIPPER_POINT_SIZE,
        });
      }

      var token = ++loadToken;
      if (loadController) loadController.abort();
      loadController = new AbortController();

      setStatus("");

      try {
        await viewer.loadComposite(layers, {
          fit: fit,
          signal: loadController.signal,
        });
        if (token !== loadToken) return;
        global.RealWorldResultsCamera = viewer.getCameraState();
        setStatus("");
      } catch (error) {
        if (error.name === "AbortError") return;
        if (token === loadToken) {
          setStatus(error.message || "Failed to load real-world point cloud.", true);
        }
      }
    }

    function selectDemo(demo) {
      selectedDemo = demo;
      selectedStageIndex = 0;
      updateTabSelection(".real-world-demo-tab", "demoId", demo.id);
      renderStageTabs(selectedDemo, selectedStageIndex, selectStage);
      setStageUi();
      setText("#real-world-active-demo", selectedDemo.title);
      setText("#real-world-active-task", selectedDemo.task);
      updateRecording(selectedDemo);
      loadStage(true);
    }

    function selectStage(stageIndex) {
      selectedStageIndex = clampStage(stageIndex, selectedDemo);
      setStageUi();
      loadStage(false);
    }

    gripperToggle.addEventListener("change", function() {
      loadStage(false);
    });

    previousButton.addEventListener("click", function() {
      selectStage(selectedStageIndex - 1);
    });

    nextButton.addEventListener("click", function() {
      selectStage(selectedStageIndex + 1);
    });

    renderDemoTabs(demos, selectedDemo, selectDemo);
    renderStageTabs(selectedDemo, selectedStageIndex, selectStage);
    selectDemo(selectedDemo);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeRealWorldResults);
  } else {
    initializeRealWorldResults();
  }
})(window);

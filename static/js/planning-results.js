(function(global) {
  "use strict";

  var data = global.PlanningResultsData;
  var PlyPointCloudViewer = global.PlyPointCloudViewer;

  if (!data || !PlyPointCloudViewer) {
    console.error("Planning results dependencies are missing.");
    return;
  }

  function $(selector) {
    return document.querySelector(selector);
  }

  function setText(selector, value) {
    var element = $(selector);
    if (element) element.textContent = value;
  }

  function renderGallery(scenes, selectedSceneId, onSelect) {
    var gallery = $("#planning-results-gallery");
    if (!gallery) return;
    gallery.innerHTML = "";

    scenes.forEach(function(scene, index) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "planning-scene-card";
      button.dataset.sceneId = scene.id;
      button.setAttribute("aria-pressed", scene.id === selectedSceneId ? "true" : "false");
      button.setAttribute("aria-label", "View " + scene.title);
      if (scene.id === selectedSceneId) button.classList.add("is-active");

      var image = document.createElement("img");
      image.src = scene.thumbnailPath;
      image.alt = scene.title + " thumbnail";
      image.loading = index < 4 ? "eager" : "lazy";

      var body = document.createElement("span");
      body.className = "planning-scene-card-body";

      var title = document.createElement("span");
      title.className = "planning-scene-title";
      title.textContent = scene.title;

      var instruction = document.createElement("span");
      instruction.className = "planning-scene-instruction";
      instruction.textContent = scene.instruction || "Missing task description.";

      body.appendChild(title);
      body.appendChild(instruction);
      button.appendChild(image);
      button.appendChild(body);
      button.addEventListener("click", function() {
        onSelect(scene);
      });
      gallery.appendChild(button);
    });
  }

  function setGallerySelection(sceneId) {
    document.querySelectorAll(".planning-scene-card").forEach(function(card) {
      var isActive = card.dataset.sceneId === sceneId;
      card.classList.toggle("is-active", isActive);
      card.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function renderSceneVideos(scene) {
    var strip = $("#planning-results-video-strip");
    if (!strip) return;
    strip.innerHTML = "";

    (scene.videoClips || []).forEach(function(clip) {
      var card = document.createElement("figure");
      card.className = "planning-results-video-card";

      var video = document.createElement("video");
      video.src = clip.path;
      video.autoplay = true;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.setAttribute("autoplay", "");
      video.setAttribute("muted", "");
      video.setAttribute("loop", "");
      video.setAttribute("playsinline", "");
      video.setAttribute("aria-label", scene.title + " " + clip.label + " video");

      var caption = document.createElement("figcaption");
      caption.className = "planning-results-video-caption";

      var label = document.createElement("span");
      label.textContent = clip.label;
      caption.appendChild(label);

      if (clip.badge) {
        var badge = document.createElement("span");
        badge.className = "planning-results-video-badge";
        badge.textContent = clip.badge;
        caption.appendChild(badge);
      }

      card.appendChild(video);
      card.appendChild(caption);
      strip.appendChild(card);
    });
  }

  function getStepPath(scene, step) {
    if (step === 0) return scene.inputPath;
    return scene.predictionPaths[step];
  }

  function clampStep(step) {
    if (step < 0) return 0;
    if (step > 4) return 4;
    return step;
  }

  function setStepUi(step) {
    var isInput = step === 0;
    setText("#planning-results-step-title", isInput ? "Input" : "Unroll");
    setText("#planning-results-step-label", isInput ? "Step 0" : "Pred " + step);
    setText("#planning-results-step-value", "Step " + step);

    var previousButton = $("#planning-results-prev-step");
    var nextButton = $("#planning-results-next-step");
    if (previousButton) previousButton.disabled = step === 0;
    if (nextButton) nextButton.disabled = step === 4;
  }

  function setSectionStatus(message, isError) {
    var status = $("#planning-results-status");
    if (!status) return;
    status.textContent = message || "";
    status.hidden = !message;
    status.classList.toggle("is-error", Boolean(isError));
  }

  function initializePlanningResults() {
    var section = $("#planning-results");
    var viewerMount = $("#planning-results-viewer");
    var slider = $("#planning-results-step-slider");
    var previousButton = $("#planning-results-prev-step");
    var nextButton = $("#planning-results-next-step");

    if (!section || !viewerMount || !slider || !previousButton || !nextButton) return;

    var scenes = [];
    var selectedScene = null;
    var selectedStep = clampStep(Number(slider.value) || 0);
    var loadToken = 0;
    var loadController = null;

    var viewer = new PlyPointCloudViewer(viewerMount, {
      label: "Planning point cloud viewer",
      pointSize: 2.35,
    });

    async function loadStep(step, fit) {
      if (!selectedScene) return;
      selectedStep = clampStep(step);
      slider.value = String(selectedStep);
      setStepUi(selectedStep);

      var path = getStepPath(selectedScene, selectedStep);
      if (!path) {
        setSectionStatus("Missing point cloud for step " + selectedStep + ".", true);
        return;
      }

      var token = ++loadToken;
      if (loadController) loadController.abort();
      loadController = new AbortController();
      setSectionStatus(selectedStep === 0 ? "Loading input..." : "Loading unroll step " + selectedStep + "...");
      try {
        await viewer.load(path, {
          fit: fit,
          signal: loadController.signal,
        });
        if (token !== loadToken) return;
        setSectionStatus("");
      } catch (error) {
        if (error.name === "AbortError") return;
        if (token === loadToken) {
          setSectionStatus(error.message, true);
        }
      }
    }

    async function selectScene(scene) {
      selectedScene = scene;
      selectedStep = 0;
      slider.value = String(selectedStep);
      setStepUi(selectedStep);
      setGallerySelection(scene.id);
      setText("#planning-results-active-scene", scene.title);
      setText("#planning-results-active-instruction", scene.instruction || "");
      renderSceneVideos(scene);
      setSectionStatus("Loading " + scene.title + "...");

      await loadStep(selectedStep, true);
    }

    function changeStep(delta) {
      loadStep(clampStep(selectedStep + delta), false);
    }

    var sliderTimer = 0;
    slider.addEventListener("input", function() {
      selectedStep = clampStep(Number(slider.value) || 0);
      setStepUi(selectedStep);
      clearTimeout(sliderTimer);
      sliderTimer = setTimeout(function() {
        loadStep(selectedStep, false);
      }, 120);
    });

    previousButton.addEventListener("click", function() {
      changeStep(-1);
    });

    nextButton.addEventListener("click", function() {
      changeStep(1);
    });

    scenes = data.RESULT_SCENES;
    renderGallery(scenes, scenes[0].id, selectScene);
    selectScene(scenes[0]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializePlanningResults);
  } else {
    initializePlanningResults();
  }
})(window);

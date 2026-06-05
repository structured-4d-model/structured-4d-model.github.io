(function(global) {
  "use strict";

  var TYPE_SIZES = {
    char: 1,
    int8: 1,
    uchar: 1,
    uint8: 1,
    short: 2,
    int16: 2,
    ushort: 2,
    uint16: 2,
    int: 4,
    int32: 4,
    uint: 4,
    uint32: 4,
    float: 4,
    float32: 4,
    double: 8,
    float64: 8,
  };
  var DEFAULT_CAMERA = {
    // Angles are radians. For degrees, use degrees * Math.PI / 180.
    // yaw: Math.PI / 2,
    yaw: Math.PI / 2,
    pitch: 0,
    roll: Math.PI / 2,
  };

  function findHeaderEnd(bytes) {
    var marker = [101, 110, 100, 95, 104, 101, 97, 100, 101, 114];
    for (var i = 0; i <= bytes.length - marker.length; i++) {
      var matches = true;
      for (var j = 0; j < marker.length; j++) {
        if (bytes[i + j] !== marker[j]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        var end = i + marker.length;
        if (bytes[end] === 13) end++;
        if (bytes[end] === 10) end++;
        return end;
      }
    }
    throw new Error("PLY header is missing end_header");
  }

  function parsePlyHeader(buffer) {
    var bytes = new Uint8Array(buffer);
    var headerLength = findHeaderEnd(bytes);
    var headerText = new TextDecoder("ascii").decode(bytes.slice(0, headerLength));
    var lines = headerText.split(/\r?\n/).map(function(line) {
      return line.trim();
    });

    if (lines[0] !== "ply") {
      throw new Error("Unsupported file: expected PLY header");
    }

    var format = "";
    var currentElement = null;
    var vertexCount = 0;
    var vertexProperties = [];
    var vertexStride = 0;

    lines.forEach(function(line) {
      if (!line || line.indexOf("comment ") === 0) return;
      var parts = line.split(/\s+/);

      if (parts[0] === "format") {
        format = parts[1];
        return;
      }

      if (parts[0] === "element") {
        currentElement = parts[1];
        if (currentElement === "vertex") {
          vertexCount = parseInt(parts[2], 10);
          vertexProperties = [];
          vertexStride = 0;
        }
        return;
      }

      if (parts[0] === "property" && currentElement === "vertex") {
        if (parts[1] === "list") {
          throw new Error("List properties in vertex elements are not supported");
        }
        var type = parts[1];
        var name = parts[2];
        var size = TYPE_SIZES[type];
        if (!size) {
          throw new Error("Unsupported PLY property type: " + type);
        }
        vertexProperties.push({
          name: name,
          type: type,
          offset: vertexStride,
          size: size,
        });
        vertexStride += size;
      }
    });

    if (format !== "binary_little_endian") {
      throw new Error("Only binary_little_endian PLY files are supported");
    }
    if (!Number.isFinite(vertexCount) || vertexCount <= 0) {
      throw new Error("PLY file does not contain vertices");
    }

    return {
      format: format,
      headerLength: headerLength,
      vertexCount: vertexCount,
      vertexProperties: vertexProperties,
      vertexStride: vertexStride,
    };
  }

  function readProperty(view, offset, type) {
    switch (type) {
      case "char":
      case "int8":
        return view.getInt8(offset);
      case "uchar":
      case "uint8":
        return view.getUint8(offset);
      case "short":
      case "int16":
        return view.getInt16(offset, true);
      case "ushort":
      case "uint16":
        return view.getUint16(offset, true);
      case "int":
      case "int32":
        return view.getInt32(offset, true);
      case "uint":
      case "uint32":
        return view.getUint32(offset, true);
      case "float":
      case "float32":
        return view.getFloat32(offset, true);
      case "double":
      case "float64":
        return view.getFloat64(offset, true);
      default:
        throw new Error("Unsupported PLY property type: " + type);
    }
  }

  function findProperty(header, names) {
    for (var i = 0; i < names.length; i++) {
      for (var j = 0; j < header.vertexProperties.length; j++) {
        if (header.vertexProperties[j].name === names[i]) {
          return header.vertexProperties[j];
        }
      }
    }
    return null;
  }

  function parseBinaryPly(buffer) {
    var header = parsePlyHeader(buffer);
    var xProp = findProperty(header, ["x"]);
    var yProp = findProperty(header, ["y"]);
    var zProp = findProperty(header, ["z"]);
    var rProp = findProperty(header, ["red", "r", "diffuse_red"]);
    var gProp = findProperty(header, ["green", "g", "diffuse_green"]);
    var bProp = findProperty(header, ["blue", "b", "diffuse_blue"]);

    if (!xProp || !yProp || !zProp) {
      throw new Error("PLY vertices must include x, y, and z properties");
    }

    var view = new DataView(buffer);
    var positions = new Float32Array(header.vertexCount * 3);
    var colors = new Float32Array(header.vertexCount * 3);
    var min = [Infinity, Infinity, Infinity];
    var max = [-Infinity, -Infinity, -Infinity];

    for (var i = 0; i < header.vertexCount; i++) {
      var vertexOffset = header.headerLength + i * header.vertexStride;
      var x = readProperty(view, vertexOffset + xProp.offset, xProp.type);
      var y = readProperty(view, vertexOffset + yProp.offset, yProp.type);
      var z = readProperty(view, vertexOffset + zProp.offset, zProp.type);
      var index = i * 3;

      positions[index] = x;
      positions[index + 1] = y;
      positions[index + 2] = z;

      min[0] = Math.min(min[0], x);
      min[1] = Math.min(min[1], y);
      min[2] = Math.min(min[2], z);
      max[0] = Math.max(max[0], x);
      max[1] = Math.max(max[1], y);
      max[2] = Math.max(max[2], z);

      colors[index] = rProp ? readProperty(view, vertexOffset + rProp.offset, rProp.type) / 255 : 0.75;
      colors[index + 1] = gProp ? readProperty(view, vertexOffset + gProp.offset, gProp.type) / 255 : 0.75;
      colors[index + 2] = bProp ? readProperty(view, vertexOffset + bProp.offset, bProp.type) / 255 : 0.75;
    }

    var center = [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ];
    var radius = 0;
    for (var k = 0; k < header.vertexCount; k++) {
      var p = k * 3;
      var dx = positions[p] - center[0];
      var dy = positions[p + 1] - center[1];
      var dz = positions[p + 2] - center[2];
      radius = Math.max(radius, Math.sqrt(dx * dx + dy * dy + dz * dz));
    }

    return {
      positions: positions,
      colors: colors,
      vertexCount: header.vertexCount,
      bounds: {
        min: min,
        max: max,
        center: center,
        radius: Math.max(radius, 0.01),
      },
    };
  }

  function calculateBounds(positions, vertexCount) {
    var min = [Infinity, Infinity, Infinity];
    var max = [-Infinity, -Infinity, -Infinity];

    for (var i = 0; i < vertexCount; i++) {
      var index = i * 3;
      var x = positions[index];
      var y = positions[index + 1];
      var z = positions[index + 2];
      min[0] = Math.min(min[0], x);
      min[1] = Math.min(min[1], y);
      min[2] = Math.min(min[2], z);
      max[0] = Math.max(max[0], x);
      max[1] = Math.max(max[1], y);
      max[2] = Math.max(max[2], z);
    }

    var center = [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ];
    var radius = 0;
    for (var k = 0; k < vertexCount; k++) {
      var p = k * 3;
      var dx = positions[p] - center[0];
      var dy = positions[p + 1] - center[1];
      var dz = positions[p + 2] - center[2];
      radius = Math.max(radius, Math.sqrt(dx * dx + dy * dy + dz * dz));
    }

    return {
      min: min,
      max: max,
      center: center,
      radius: Math.max(radius, 0.01),
    };
  }

  function combinePointClouds(layers) {
    var validLayers = (layers || []).filter(function(layer) {
      return layer && layer.pointCloud && layer.pointCloud.vertexCount;
    });
    var vertexCount = validLayers.reduce(function(total, layer) {
      return total + layer.pointCloud.vertexCount;
    }, 0);

    if (!vertexCount) {
      throw new Error("No point clouds to combine.");
    }

    var positions = new Float32Array(vertexCount * 3);
    var colors = new Float32Array(vertexCount * 3);
    var hasPointSizes = validLayers.some(function(layer) {
      return Number.isFinite(layer.pointSize) ||
        Boolean(layer.pointCloud.sizes && layer.pointCloud.sizes.length === layer.pointCloud.vertexCount);
    });
    var sizes = hasPointSizes ? new Float32Array(vertexCount) : null;
    var vertexOffset = 0;

    if (sizes) sizes.fill(NaN);

    validLayers.forEach(function(layer) {
      var pointCloud = layer.pointCloud;
      var color = layer.color || null;
      positions.set(pointCloud.positions, vertexOffset * 3);

      if (color) {
        for (var i = 0; i < pointCloud.vertexCount; i++) {
          var colorIndex = (vertexOffset + i) * 3;
          colors[colorIndex] = color[0];
          colors[colorIndex + 1] = color[1];
          colors[colorIndex + 2] = color[2];
        }
      } else {
        colors.set(pointCloud.colors, vertexOffset * 3);
      }

      if (sizes) {
        if (Number.isFinite(layer.pointSize)) {
          for (var j = 0; j < pointCloud.vertexCount; j++) {
            sizes[vertexOffset + j] = layer.pointSize;
          }
        } else if (pointCloud.sizes && pointCloud.sizes.length === pointCloud.vertexCount) {
          sizes.set(pointCloud.sizes, vertexOffset);
        }
      }

      vertexOffset += pointCloud.vertexCount;
    });

    return {
      positions: positions,
      colors: colors,
      sizes: sizes,
      vertexCount: vertexCount,
      bounds: calculateBounds(positions, vertexCount),
    };
  }

  function resolvePointSizes(pointCloud, fallbackPointSize) {
    var fallback = Number.isFinite(fallbackPointSize) && fallbackPointSize > 0 ? fallbackPointSize : 2.2;
    var sizes = new Float32Array(pointCloud.vertexCount);
    var sourceSizes = pointCloud.sizes || null;

    if (!sourceSizes || sourceSizes.length !== pointCloud.vertexCount) {
      sizes.fill(fallback);
      return sizes;
    }

    for (var i = 0; i < pointCloud.vertexCount; i++) {
      var size = sourceSizes[i];
      sizes[i] = Number.isFinite(size) && size > 0 ? size : fallback;
    }
    return sizes;
  }

  function createShader(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      var error = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(error);
    }
    return shader;
  }

  function createProgram(gl) {
    var vertexSource = [
      "attribute vec3 a_position;",
      "attribute vec3 a_color;",
      "attribute float a_point_size;",
      "uniform mat4 u_projection;",
      "uniform mat4 u_view;",
      "uniform float u_pixel_ratio;",
      "varying vec3 v_color;",
      "void main() {",
      "  gl_Position = u_projection * u_view * vec4(a_position, 1.0);",
      "  gl_PointSize = a_point_size * u_pixel_ratio;",
      "  v_color = a_color;",
      "}",
    ].join("\n");
    var fragmentSource = [
      "precision mediump float;",
      "varying vec3 v_color;",
      "void main() {",
      "  vec2 centered = gl_PointCoord - vec2(0.5);",
      "  if (dot(centered, centered) > 0.25) discard;",
      "  gl_FragColor = vec4(v_color, 1.0);",
      "}",
    ].join("\n");
    var program = gl.createProgram();
    gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program));
    }
    return program;
  }

  function identityMatrix() {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }

  function perspectiveMatrix(fovRadians, aspect, near, far) {
    var out = identityMatrix();
    var f = 1 / Math.tan(fovRadians / 2);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
    out[15] = 0;
    return out;
  }

  function normalize(v) {
    var length = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / length, v[1] / length, v[2] / length];
  }

  function subtract(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  function cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  }

  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function viewMatrixFromFrame(frame) {
    var eye = frame.eye;
    var xAxis = frame.xAxis;
    var yAxis = frame.yAxis;
    var zAxis = frame.zAxis;
    return new Float32Array([
      xAxis[0], yAxis[0], zAxis[0], 0,
      xAxis[1], yAxis[1], zAxis[1], 0,
      xAxis[2], yAxis[2], zAxis[2], 0,
      -dot(xAxis, eye), -dot(yAxis, eye), -dot(zAxis, eye), 1,
    ]);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function cloneCamera(camera) {
    return {
      target: camera.target.slice(),
      yaw: camera.yaw,
      pitch: camera.pitch,
      roll: camera.roll || 0,
      distance: camera.distance,
    };
  }

  function resolveDefaultCamera(options) {
    var defaultCamera = options.defaultCamera || {};
    return {
      yaw: Number.isFinite(defaultCamera.yaw) ? defaultCamera.yaw : DEFAULT_CAMERA.yaw,
      pitch: Number.isFinite(defaultCamera.pitch) ? defaultCamera.pitch : DEFAULT_CAMERA.pitch,
      roll: Number.isFinite(defaultCamera.roll) ? defaultCamera.roll : DEFAULT_CAMERA.roll,
    };
  }

  function cameraEye(camera) {
    var cosPitch = Math.cos(camera.pitch);
    return [
      camera.target[0] + camera.distance * cosPitch * Math.sin(camera.yaw),
      camera.target[1] + camera.distance * Math.sin(camera.pitch),
      camera.target[2] + camera.distance * cosPitch * Math.cos(camera.yaw),
    ];
  }

  function cameraFrame(camera) {
    var eye = cameraEye(camera);
    var zAxis = normalize(subtract(eye, camera.target));
    var xAxis = cross([0, 1, 0], zAxis);

    if (Math.hypot(xAxis[0], xAxis[1], xAxis[2]) < 1e-6) {
      xAxis = [1, 0, 0];
    } else {
      xAxis = normalize(xAxis);
    }

    var yAxis = normalize(cross(zAxis, xAxis));
    var roll = camera.roll || 0;
    var cosRoll = Math.cos(roll);
    var sinRoll = Math.sin(roll);
    var rolledXAxis = normalize([
      xAxis[0] * cosRoll + yAxis[0] * sinRoll,
      xAxis[1] * cosRoll + yAxis[1] * sinRoll,
      xAxis[2] * cosRoll + yAxis[2] * sinRoll,
    ]);
    var rolledYAxis = normalize([
      yAxis[0] * cosRoll - xAxis[0] * sinRoll,
      yAxis[1] * cosRoll - xAxis[1] * sinRoll,
      yAxis[2] * cosRoll - xAxis[2] * sinRoll,
    ]);

    return {
      eye: eye,
      xAxis: rolledXAxis,
      yAxis: rolledYAxis,
      zAxis: zAxis,
    };
  }

  function projectAxisToScreen(camera, axis) {
    var frame = cameraFrame(camera);
    var normalizedAxis = normalize(axis);
    return {
      x: dot(normalizedAxis, frame.xAxis),
      y: dot(normalizedAxis, frame.yAxis),
      depth: dot(normalizedAxis, frame.zAxis),
    };
  }

  function orbitDeltaFromPointer(camera, dx, dy, width, height) {
    var normalizedDx = dx / (width || 1);
    var normalizedDy = dy / (height || 1);
    var roll = camera.roll || 0;
    var cosRoll = Math.cos(roll);
    var sinRoll = Math.sin(roll);
    var yawInput = normalizedDx * cosRoll - normalizedDy * sinRoll;
    var pitchInput = normalizedDx * sinRoll + normalizedDy * cosRoll;

    return {
      yawDelta: -yawInput * Math.PI * 1.8,
      pitchDelta: -pitchInput * Math.PI,
    };
  }

  function createAxesWidget(documentRef) {
    var axes = documentRef.createElement("div");
    axes.className = "ply-viewer-axes";
    axes.setAttribute("aria-hidden", "true");
    axes.innerHTML = [
      '<span class="ply-axis-center"></span>',
      '<span class="ply-axis-line ply-axis-line-x"></span>',
      '<span class="ply-axis-line ply-axis-line-y"></span>',
      '<span class="ply-axis-line ply-axis-line-z"></span>',
      '<span class="ply-axis ply-axis-x">X</span>',
      '<span class="ply-axis ply-axis-y">Y</span>',
      '<span class="ply-axis ply-axis-z">Z</span>',
    ].join("");
    return axes;
  }

  function PlyPointCloudViewer(container, options) {
    options = options || {};
    this.container = container;
    this.pointSize = options.pointSize || 2.2;
    this.onCameraChange = options.onCameraChange || null;
    this.defaultCamera = resolveDefaultCamera(options);
    this.camera = {
      target: [0, 0, 0],
      yaw: this.defaultCamera.yaw,
      pitch: this.defaultCamera.pitch,
      roll: this.defaultCamera.roll,
      distance: 2,
    };
    this.vertexCount = 0;
    this.positionBuffer = null;
    this.colorBuffer = null;
    this.sizeBuffer = null;
    this.bounds = null;
    this.animationFrame = 0;
    this.activePointer = null;
    this.document = container.ownerDocument;

    this.canvas = this.document.createElement("canvas");
    this.canvas.className = "ply-viewer-canvas";
    this.canvas.setAttribute("aria-label", options.label || "Interactive point cloud viewer");

    this.status = this.document.createElement("div");
    this.status.className = "ply-viewer-status";
    this.status.hidden = true;

    this.axesWidget = createAxesWidget(this.document);
    this.axisElements = {
      x: {
        label: this.axesWidget.querySelector(".ply-axis-x"),
        line: this.axesWidget.querySelector(".ply-axis-line-x"),
        vector: [1, 0, 0],
      },
      y: {
        label: this.axesWidget.querySelector(".ply-axis-y"),
        line: this.axesWidget.querySelector(".ply-axis-line-y"),
        vector: [0, 1, 0],
      },
      z: {
        label: this.axesWidget.querySelector(".ply-axis-z"),
        line: this.axesWidget.querySelector(".ply-axis-line-z"),
        vector: [0, 0, 1],
      },
    };

    this.container.appendChild(this.canvas);
    this.container.appendChild(this.axesWidget);
    this.container.appendChild(this.status);

    this.gl = this.canvas.getContext("webgl", {
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    if (!this.gl) {
      this.setStatus("WebGL is not available in this browser.", true);
      return;
    }

    this.program = createProgram(this.gl);
    this.locations = {
      position: this.gl.getAttribLocation(this.program, "a_position"),
      color: this.gl.getAttribLocation(this.program, "a_color"),
      pointSize: this.gl.getAttribLocation(this.program, "a_point_size"),
      projection: this.gl.getUniformLocation(this.program, "u_projection"),
      view: this.gl.getUniformLocation(this.program, "u_view"),
      pixelRatio: this.gl.getUniformLocation(this.program, "u_pixel_ratio"),
    };

    this.bindControls();
    this.resizeObserver = new ResizeObserver(this.resize.bind(this));
    this.resizeObserver.observe(this.container);
    this.resize();
    this.updateAxesWidget();
  }

  PlyPointCloudViewer.prototype.setStatus = function(message, isError) {
    this.status.textContent = message || "";
    this.status.classList.toggle("is-error", Boolean(isError));
    this.status.hidden = !message;
  };

  PlyPointCloudViewer.prototype.bindControls = function() {
    var self = this;

    this.canvas.addEventListener("contextmenu", function(event) {
      event.preventDefault();
    });

    this.canvas.addEventListener("pointerdown", function(event) {
      self.activePointer = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        mode: event.shiftKey || event.button === 1 || event.button === 2 ? "pan" : "orbit",
      };
      self.canvas.setPointerCapture(event.pointerId);
    });

    this.canvas.addEventListener("pointermove", function(event) {
      if (!self.activePointer || self.activePointer.id !== event.pointerId) return;
      var width = self.canvas.clientWidth || 1;
      var height = self.canvas.clientHeight || 1;
      var dx = event.clientX - self.activePointer.x;
      var dy = event.clientY - self.activePointer.y;
      self.activePointer.x = event.clientX;
      self.activePointer.y = event.clientY;

      if (self.activePointer.mode === "pan") {
        self.pan(dx, dy, width, height);
      } else {
        var orbitDelta = orbitDeltaFromPointer(self.camera, dx, dy, width, height);
        self.camera.yaw += orbitDelta.yawDelta;
        self.camera.pitch = clamp(self.camera.pitch + orbitDelta.pitchDelta, -1.45, 1.45);
      }
      self.cameraChanged();
    });

    this.canvas.addEventListener("pointerup", function(event) {
      if (self.activePointer && self.activePointer.id === event.pointerId) {
        self.activePointer = null;
      }
    });

    this.canvas.addEventListener("wheel", function(event) {
      event.preventDefault();
      var zoom = Math.exp(event.deltaY * 0.001);
      self.camera.distance = clamp(self.camera.distance * zoom, 0.02, 1000);
      self.cameraChanged();
    }, { passive: false });
  };

  PlyPointCloudViewer.prototype.pan = function(dx, dy, width, height) {
    var frame = cameraFrame(this.camera);
    var right = frame.xAxis;
    var up = frame.yAxis;
    var scaleY = 2 * Math.tan(Math.PI / 8) * this.camera.distance / height;
    var scaleX = scaleY * width / height;
    this.camera.target[0] += -right[0] * dx * scaleX + up[0] * dy * scaleY;
    this.camera.target[1] += -right[1] * dx * scaleX + up[1] * dy * scaleY;
    this.camera.target[2] += -right[2] * dx * scaleX + up[2] * dy * scaleY;
  };

  PlyPointCloudViewer.prototype.updateAxesWidget = function() {
    if (!this.axisElements) return;
    var center = 29;
    var axisLength = 19;
    var labelOffset = 10;
    var self = this;

    Object.keys(this.axisElements).forEach(function(key) {
      var axis = self.axisElements[key];
      var projection = projectAxisToScreen(self.camera, axis.vector);
      var endX = center + projection.x * axisLength;
      var endY = center - projection.y * axisLength;
      var deltaX = endX - center;
      var deltaY = endY - center;
      var lineLength = Math.max(Math.hypot(deltaX, deltaY), 3);
      var opacity = 0.45 + 0.55 * (1 - Math.min(Math.abs(projection.depth), 1));

      axis.label.style.left = (endX - labelOffset) + "px";
      axis.label.style.top = (endY - labelOffset) + "px";
      axis.label.style.opacity = String(opacity);
      axis.line.style.width = lineLength + "px";
      axis.line.style.opacity = String(opacity);
      axis.line.style.transform = "rotate(" + Math.atan2(deltaY, deltaX) + "rad)";
    });
  };

  PlyPointCloudViewer.prototype.cameraChanged = function(silent) {
    this.updateAxesWidget();
    this.requestRender();
    if (!silent && this.onCameraChange) {
      this.onCameraChange(this.getCameraState());
    }
  };

  PlyPointCloudViewer.prototype.getCameraState = function() {
    return cloneCamera(this.camera);
  };

  PlyPointCloudViewer.prototype.setCameraState = function(camera, silent) {
    this.camera = cloneCamera(camera);
    this.cameraChanged(silent);
  };

  PlyPointCloudViewer.prototype.fitToBounds = function(bounds, silent) {
    this.camera.target = bounds.center.slice();
    this.camera.distance = Math.max(bounds.radius * 2.35, 0.1);
    this.camera.pitch = this.defaultCamera.pitch;
    this.camera.yaw = this.defaultCamera.yaw;
    this.camera.roll = this.defaultCamera.roll;
    this.cameraChanged(silent);
  };

  PlyPointCloudViewer.prototype.resize = function() {
    var rect = this.container.getBoundingClientRect();
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var width = Math.max(1, Math.floor(rect.width * dpr));
    var height = Math.max(1, Math.floor(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.requestRender();
    }
  };

  PlyPointCloudViewer.prototype.setPointCloud = function(pointCloud, options) {
    options = options || {};
    if (!this.gl) return;
    var gl = this.gl;
    this.vertexCount = pointCloud.vertexCount;
    this.bounds = pointCloud.bounds;

    if (!this.positionBuffer) this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, pointCloud.positions, gl.STATIC_DRAW);

    if (!this.colorBuffer) this.colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, pointCloud.colors, gl.STATIC_DRAW);

    if (!this.sizeBuffer) this.sizeBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sizeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, resolvePointSizes(
      pointCloud,
      Number.isFinite(options.pointSize) ? options.pointSize : this.pointSize
    ), gl.STATIC_DRAW);

    if (options.fit !== false) {
      this.fitToBounds(pointCloud.bounds, true);
    }
    this.requestRender();
  };

  PlyPointCloudViewer.prototype.load = async function(url, options) {
    if (!this.gl) return;
    options = options || {};
    this.setStatus("Loading point cloud");
    try {
      var response = await fetch(url, { signal: options.signal });
      if (!response.ok) {
        throw new Error("Failed to load " + url);
      }
      var buffer = await response.arrayBuffer();
      this.setPointCloud(parseBinaryPly(buffer), options);
      this.setStatus("");
    } catch (error) {
      if (error.name === "AbortError") {
        this.setStatus("");
      } else if (error instanceof TypeError && global.location && global.location.protocol === "file:") {
        this.setStatus("Point clouds require a local HTTP server. Open the page through localhost instead of file://.", true);
      } else {
        this.setStatus(error.message || "Failed to load point cloud.", true);
      }
      throw error;
    }
  };

  PlyPointCloudViewer.prototype.loadComposite = async function(layers, options) {
    if (!this.gl) return;
    options = options || {};
    this.setStatus("Loading point clouds");
    try {
      var parsedLayers = await Promise.all((layers || []).map(async function(layer) {
        var response = await fetch(layer.path, { signal: options.signal });
        if (!response.ok) {
          throw new Error("Failed to load " + layer.path);
        }
        var buffer = await response.arrayBuffer();
        return {
          pointCloud: parseBinaryPly(buffer),
          color: layer.color || null,
          pointSize: layer.pointSize,
        };
      }));
      this.setPointCloud(combinePointClouds(parsedLayers), options);
      this.setStatus("");
    } catch (error) {
      if (error.name === "AbortError") {
        this.setStatus("");
      } else if (error instanceof TypeError && global.location && global.location.protocol === "file:") {
        this.setStatus("Point clouds require a local HTTP server. Open the page through localhost instead of file://.", true);
      } else {
        this.setStatus(error.message || "Failed to load point clouds.", true);
      }
      throw error;
    }
  };

  PlyPointCloudViewer.prototype.requestRender = function() {
    if (this.animationFrame || !this.gl) return;
    var self = this;
    this.animationFrame = requestAnimationFrame(function() {
      self.animationFrame = 0;
      self.render();
    });
  };

  PlyPointCloudViewer.prototype.render = function() {
    if (!this.gl) return;
    var gl = this.gl;
    var width = this.canvas.width || 1;
    var height = this.canvas.height || 1;
    gl.viewport(0, 0, width, height);
    gl.clearColor(1, 1, 1, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (!this.vertexCount) return;

    var projection = perspectiveMatrix(Math.PI / 4, width / height, 0.001, Math.max(this.camera.distance * 20, 10));
    var view = viewMatrixFromFrame(cameraFrame(this.camera));

    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.locations.projection, false, projection);
    gl.uniformMatrix4fv(this.locations.view, false, view);
    gl.uniform1f(this.locations.pixelRatio, Math.min(global.devicePixelRatio || 1, 2));

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.locations.position);
    gl.vertexAttribPointer(this.locations.position, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.enableVertexAttribArray(this.locations.color);
    gl.vertexAttribPointer(this.locations.color, 3, gl.FLOAT, false, 0, 0);

    if (this.locations.pointSize >= 0 && this.sizeBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.sizeBuffer);
      gl.enableVertexAttribArray(this.locations.pointSize);
      gl.vertexAttribPointer(this.locations.pointSize, 1, gl.FLOAT, false, 0, 0);
    }

    gl.drawArrays(gl.POINTS, 0, this.vertexCount);
  };

  PlyPointCloudViewer.parsePlyHeader = parsePlyHeader;
  PlyPointCloudViewer.parseBinaryPly = parseBinaryPly;
  PlyPointCloudViewer.combinePointClouds = combinePointClouds;
  PlyPointCloudViewer.DEFAULT_CAMERA = DEFAULT_CAMERA;
  PlyPointCloudViewer.projectAxisToScreen = projectAxisToScreen;
  PlyPointCloudViewer.orbitDeltaFromPointer = orbitDeltaFromPointer;

  function PlyCameraSync(viewers) {
    this.viewers = viewers;
    this.syncing = false;
    this.bind();
  }

  PlyCameraSync.prototype.bind = function() {
    var self = this;
    this.viewers.forEach(function(viewer) {
      viewer.onCameraChange = function(camera) {
        if (self.syncing) return;
        self.syncing = true;
        self.viewers.forEach(function(other) {
          if (other !== viewer) {
            other.setCameraState(camera, true);
          }
        });
        self.syncing = false;
      };
    });
  };

  global.PlyPointCloudViewer = PlyPointCloudViewer;
  global.PlyCameraSync = PlyCameraSync;
})(typeof window !== "undefined" ? window : globalThis);

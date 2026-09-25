import {
  AssetRecordType,
  Tldraw,
  createElement,
  createRoot,
  createShapeId,
  getAssetUrls,
  useCallback,
  useMemo,
} from '../libs/tldraw/tldraw-vendor.mjs';

const ANNOTATION_STYLE_PREFERENCES_KEY = 'editorAnnotationStylePreferences';
const CLOSE_AFTER_ACTION_KEY = 'editorCloseAfterAction';
const DECORATION_PREFERENCES_KEY = 'editorDecorationPreferences';
const EXPORT_IMAGE_FORMAT = 'jpeg';
const EXPORT_IMAGE_QUALITY = 0.85;
const EXPORT_IMAGE_PIXEL_RATIO = 1;
const CLIPBOARD_IMAGE_FORMAT = 'png';
const CLIPBOARD_IMAGE_MIME_TYPE = 'image/png';
const ANNOTATION_SHAPE_TYPES = new Set(['arrow', 'draw', 'geo', 'highlight', 'line', 'note', 'text']);
const SHARED_ANNOTATION_STYLE_IDS = new Set(['tldraw:color']);

/**
 * @typedef {Object} DecorationPreferences
 * @property {boolean} enabled
 * @property {number} hue
 * @property {string} preset
 * @property {number} padding
 */

/** @type {DecorationPreferences} */
const DEFAULT_DECORATION_PREFERENCES = {
  enabled: true,
  hue: 165,
  preset: 'mint',
  padding: 56,
};

/** @type {Record<string, { name: string, hue: number, stops: string[] }>} */
const DECORATION_PRESETS = {
  neutral: {
    name: 'Neutral',
    hue: 210,
    stops: ['hsl(210, 20%, 96%)', 'hsl(215, 25%, 88%)', 'hsl(220, 20%, 82%)'],
  },
  mint: {
    name: 'Mint Teal',
    hue: 165,
    stops: ['hsl(150, 85%, 72%)', 'hsl(170, 85%, 62%)', 'hsl(185, 80%, 55%)'],
  },
  sunset: {
    name: 'Sunset Coral',
    hue: 18,
    stops: ['hsl(15, 95%, 75%)', 'hsl(345, 90%, 70%)', 'hsl(25, 95%, 68%)'],
  },
  lavender: {
    name: 'Lavender',
    hue: 270,
    stops: ['hsl(260, 85%, 78%)', 'hsl(285, 80%, 70%)', 'hsl(315, 85%, 72%)'],
  },
  ocean: {
    name: 'Ocean Blue',
    hue: 210,
    stops: ['hsl(200, 90%, 72%)', 'hsl(215, 85%, 62%)', 'hsl(230, 80%, 55%)'],
  },
  rose: {
    name: 'Berry Rose',
    hue: 330,
    stops: ['hsl(330, 90%, 72%)', 'hsl(345, 85%, 64%)', 'hsl(10, 90%, 68%)'],
  },
  dark: {
    name: 'Midnight Slate',
    hue: 225,
    stops: ['hsl(220, 25%, 22%)', 'hsl(225, 30%, 14%)', 'hsl(230, 35%, 8%)'],
  },
};

/**
 * @typedef {Object} AnnotationStylePreference
 * @property {Record<string, string | number | boolean>} stylesForNextShape
 * @property {number | undefined} opacityForNextShape
 * @property {number} updatedAt
 */

/**
 * @typedef {Object} AnnotationStylePreferences
 * @property {number} version
 * @property {Record<string, AnnotationStylePreference>} shapes
 * @property {Record<string, string | number | boolean>} sharedStylesForNextShape
 */

/**
 * @typedef {Object} ScreenshotInfo
 * @property {string} dataUrl
 * @property {number} width
 * @property {number} height
 * @property {string} mimeType
 */

/**
 * @typedef {Object} EditorState
 * @property {any} editor
 * @property {string | null} screenshotShapeId
 * @property {ScreenshotInfo | null} screenshotInfo
 * @property {any} bounds
 * @property {boolean} isCroppingScreenshot
 * @property {boolean} closeAfterAction
 * @property {Record<string, number>} actionFeedbackTimers
 * @property {AnnotationStylePreferences} annotationStylePreferences
 * @property {number | null} stylePreferencesSaveTimer
 * @property {DecorationPreferences} decorationPreferences
 * @property {number | null} decorationPreferencesSaveTimer
 * @property {any | null} [cropInitialState]
 */

/** @type {EditorState} */
const editorState = {
  editor: null,
  screenshotShapeId: null,
  screenshotInfo: null,
  bounds: null,
  isCroppingScreenshot: false,
  cropInitialState: null,
  closeAfterAction: false,
  actionFeedbackTimers: {},
  annotationStylePreferences: { version: 1, shapes: {}, sharedStylesForNextShape: {} },
  stylePreferencesSaveTimer: null,
  decorationPreferences: { ...DEFAULT_DECORATION_PREFERENCES },
  decorationPreferencesSaveTimer: null,
};

const h = createElement;

/**
 * @param {string} message
 * @returns {void}
 */
function setStatus(message) {
  const status = document.getElementById('editor-status');
  if (!status) return;
  status.textContent = message;
  status.classList.remove('hidden');
}

/**
 * @returns {void}
 */
function hideStatus() {
  const status = document.getElementById('editor-status');
  if (!status) return;
  status.classList.add('hidden');
}

/**
 * @returns {string}
 */
function getSuccessIconSvg() {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
}

/**
 * @param {string} buttonId
 * @returns {void}
 */
function showActionSuccessIcon(buttonId) {
  const button = /** @type {HTMLButtonElement | null} */ (document.getElementById(buttonId));
  if (!button) return;

  if (!button.dataset.originalIconHtml) {
    button.dataset.originalIconHtml = button.innerHTML;
  }

  const existingTimer = editorState.actionFeedbackTimers[buttonId];
  if (existingTimer) {
    window.clearTimeout(existingTimer);
  }

  button.innerHTML = getSuccessIconSvg();
  editorState.actionFeedbackTimers[buttonId] = window.setTimeout(() => {
    if (button.dataset.originalIconHtml) {
      button.innerHTML = button.dataset.originalIconHtml;
    }
    delete editorState.actionFeedbackTimers[buttonId];
  }, 2000);
}

/**
 * @param {HTMLButtonElement | null} button
 * @param {boolean} busy
 * @returns {void}
 */
function setButtonBusy(button, busy) {
  if (!button) return;
  button.disabled = busy;
  button.classList.toggle('loading', busy);
}

/**
 * @param {string} dataUrl
 * @returns {Promise<ScreenshotInfo>}
 */
function loadScreenshotInfo(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const mimeType = /^data:([^;,]+)/.exec(dataUrl)?.[1] || 'image/png';
      resolve({
        dataUrl,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        mimeType,
      });
    };
    image.onerror = () => reject(new Error('Failed to load screenshot image'));
    image.src = dataUrl;
  });
}

/**
 * @returns {Promise<ScreenshotInfo>}
 */
async function loadStoredScreenshot() {
  const result = await chrome.storage.local.get('editorScreenshot');
  const dataUrl = typeof result.editorScreenshot === 'string' ? result.editorScreenshot : '';

  if (!dataUrl) {
    throw new Error('No screenshot found. Take a screenshot again.');
  }

  return loadScreenshotInfo(dataUrl);
}

/**
 * @param {unknown} value
 * @returns {value is string | number | boolean}
 */
function isSerializableStyleValue(value) {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

/**
 * @param {unknown} value
 * @returns {AnnotationStylePreferences}
 */
function normalizeAnnotationStylePreferences(value) {
  if (!value || typeof value !== 'object') {
    return { version: 1, shapes: {}, sharedStylesForNextShape: {} };
  }

  const source = /** @type {{ shapes?: unknown, sharedStylesForNextShape?: unknown }} */ (value);
  const shapes = source.shapes && typeof source.shapes === 'object' ? source.shapes : {};
  /** @type {Record<string, AnnotationStylePreference>} */
  const normalizedShapes = {};
  /** @type {Record<string, string | number | boolean>} */
  const sharedStylesForNextShape = {};

  if (
    source.sharedStylesForNextShape &&
    typeof source.sharedStylesForNextShape === 'object'
  ) {
    for (const [styleId, styleValue] of Object.entries(source.sharedStylesForNextShape)) {
      if (SHARED_ANNOTATION_STYLE_IDS.has(styleId) && isSerializableStyleValue(styleValue)) {
        sharedStylesForNextShape[styleId] = styleValue;
      }
    }
  }

  for (const [key, preference] of Object.entries(shapes)) {
    if (!preference || typeof preference !== 'object') continue;

    const sourcePreference = /** @type {{ stylesForNextShape?: unknown, opacityForNextShape?: unknown, updatedAt?: unknown }} */ (
      preference
    );
    const sourceStyles =
      sourcePreference.stylesForNextShape && typeof sourcePreference.stylesForNextShape === 'object'
        ? sourcePreference.stylesForNextShape
        : {};
    /** @type {Record<string, string | number | boolean>} */
    const stylesForNextShape = {};

    for (const [styleId, styleValue] of Object.entries(sourceStyles)) {
      if (isSerializableStyleValue(styleValue)) {
        stylesForNextShape[styleId] = styleValue;
      }
    }

    const opacityForNextShape =
      typeof sourcePreference.opacityForNextShape === 'number'
        ? Math.max(0, Math.min(1, sourcePreference.opacityForNextShape))
        : undefined;

    if (Object.keys(stylesForNextShape).length > 0 || opacityForNextShape !== undefined) {
      normalizedShapes[key] = {
        stylesForNextShape,
        opacityForNextShape,
        updatedAt:
          typeof sourcePreference.updatedAt === 'number'
            ? sourcePreference.updatedAt
            : Date.now(),
      };
    }
  }

  return { version: 1, shapes: normalizedShapes, sharedStylesForNextShape };
}

/**
 * @returns {Promise<AnnotationStylePreferences>}
 */
async function loadAnnotationStylePreferences() {
  const result = await chrome.storage.local.get(ANNOTATION_STYLE_PREFERENCES_KEY);
  return normalizeAnnotationStylePreferences(result[ANNOTATION_STYLE_PREFERENCES_KEY]);
}

/**
 * @returns {Promise<boolean>}
 */
async function loadCloseAfterActionPreference() {
  const result = await chrome.storage.local.get(CLOSE_AFTER_ACTION_KEY);
  return result[CLOSE_AFTER_ACTION_KEY] === true;
}

/**
 * @param {boolean} value
 * @returns {void}
 */
function saveCloseAfterActionPreference(value) {
  void chrome.storage.local.set({
    [CLOSE_AFTER_ACTION_KEY]: value,
  });
}

/**
 * @param {number} hue
 * @returns {string[]}
 */
function getGradientStopsForHue(hue) {
  const h1 = (hue - 15 + 360) % 360;
  const h2 = hue % 360;
  const h3 = (hue + 25) % 360;
  return [
    `hsl(${h1}, 88%, 74%)`,
    `hsl(${h2}, 85%, 65%)`,
    `hsl(${h3}, 82%, 58%)`,
  ];
}

/**
 * @param {DecorationPreferences} preferences
 * @returns {string[]}
 */
function getDecorationGradientStops(preferences) {
  if (preferences.preset !== 'custom' && DECORATION_PRESETS[preferences.preset]) {
    return DECORATION_PRESETS[preferences.preset].stops;
  }
  return getGradientStopsForHue(preferences.hue);
}

/**
 * @param {DecorationPreferences} preferences
 * @returns {string}
 */
function getDecorationGradientCss(preferences) {
  const stops = getDecorationGradientStops(preferences);
  return `linear-gradient(135deg, ${stops.join(', ')})`;
}

/**
 * @param {unknown} value
 * @returns {DecorationPreferences}
 */
function normalizeDecorationPreferences(value) {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_DECORATION_PREFERENCES };
  }
  const source = /** @type {Record<string, unknown>} */ (value);
  const enabled = typeof source.enabled === 'boolean' ? source.enabled : DEFAULT_DECORATION_PREFERENCES.enabled;
  const hue = typeof source.hue === 'number' && !Number.isNaN(source.hue) ? Math.max(0, Math.min(360, source.hue)) : DEFAULT_DECORATION_PREFERENCES.hue;
  const preset = typeof source.preset === 'string' && (source.preset in DECORATION_PRESETS || source.preset === 'custom') ? source.preset : DEFAULT_DECORATION_PREFERENCES.preset;
  const padding = typeof source.padding === 'number' && [32, 56, 80].includes(source.padding) ? source.padding : DEFAULT_DECORATION_PREFERENCES.padding;
  return { enabled, hue, preset, padding };
}

/**
 * @returns {Promise<DecorationPreferences>}
 */
async function loadDecorationPreferences() {
  const result = await chrome.storage.local.get(DECORATION_PREFERENCES_KEY);
  return normalizeDecorationPreferences(result[DECORATION_PREFERENCES_KEY]);
}

/**
 * @returns {void}
 */
function scheduleDecorationPreferencesSave() {
  if (editorState.decorationPreferencesSaveTimer !== null) {
    window.clearTimeout(editorState.decorationPreferencesSaveTimer);
  }
  editorState.decorationPreferencesSaveTimer = window.setTimeout(() => {
    editorState.decorationPreferencesSaveTimer = null;
    void chrome.storage.local.set({
      [DECORATION_PREFERENCES_KEY]: editorState.decorationPreferences,
    });
  }, 250);
}

/**
 * @returns {void}
 */
function syncDecorationUI() {
  const { enabled, hue, preset, padding } = editorState.decorationPreferences;
  const main = document.querySelector('.screenshot-editor-main');
  const actionBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('action-decorate'));
  const toggleBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('prop-decoration-toggle'));
  const floatingBar = document.getElementById('decoration-bar');
  const hueSlider = /** @type {HTMLInputElement | null} */ (document.getElementById('prop-decoration-hue'));

  if (main instanceof HTMLElement) {
    main.classList.toggle('decoration-active', enabled);
    const gradientCss = getDecorationGradientCss(editorState.decorationPreferences);
    main.style.setProperty('--decoration-gradient', gradientCss);
  }

  if (actionBtn) {
    actionBtn.classList.toggle('btn-active', enabled);
    actionBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  }

  if (toggleBtn) {
    toggleBtn.classList.toggle('active', enabled);
    toggleBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  }

  if (floatingBar) {
    floatingBar.classList.toggle('hidden', !enabled);
  }

  if (hueSlider) {
    hueSlider.value = String(hue);
  }

  document.querySelectorAll('.decoration-preset-dot').forEach((el) => {
    const dotPreset = el.getAttribute('data-preset');
    el.classList.toggle('active', dotPreset === preset);
  });
}

/**
 * @returns {void}
 */
function scheduleAnnotationStylePreferencesSave() {
  if (editorState.stylePreferencesSaveTimer !== null) {
    window.clearTimeout(editorState.stylePreferencesSaveTimer);
  }

  editorState.stylePreferencesSaveTimer = window.setTimeout(() => {
    editorState.stylePreferencesSaveTimer = null;
    void chrome.storage.local.set({
      [ANNOTATION_STYLE_PREFERENCES_KEY]: editorState.annotationStylePreferences,
    });
  }, 250);
}

/**
 * @param {any} shape
 * @returns {boolean}
 */
function isAnnotationShape(shape) {
  return Boolean(shape && ANNOTATION_SHAPE_TYPES.has(shape.type));
}

/**
 * @param {any} shape
 * @returns {string | null}
 */
function getAnnotationStylePreferenceKeyForShape(shape) {
  if (!isAnnotationShape(shape)) return null;
  if (shape.type === 'geo') {
    return `geo:${typeof shape.props?.geo === 'string' ? shape.props.geo : 'rectangle'}`;
  }

  return shape.type;
}

/**
 * @param {any} editor
 * @param {string} shapeType
 * @returns {Map<any, string> | null}
 */
function getShapeStyleProps(editor, shapeType) {
  const styleProps = editor?.styleProps?.[shapeType];
  return styleProps instanceof Map ? styleProps : null;
}

/**
 * @param {any} editor
 * @param {any} shape
 * @returns {AnnotationStylePreference | null}
 */
function getAnnotationStylePreferenceForShape(editor, shape) {
  const styleProps = getShapeStyleProps(editor, shape.type);
  if (!styleProps) return null;

  /** @type {Record<string, string | number | boolean>} */
  const stylesForNextShape = {};

  for (const [styleProp, propName] of styleProps) {
    const value = shape.props?.[propName];
    if (styleProp?.id && isSerializableStyleValue(value)) {
      stylesForNextShape[styleProp.id] = value;
    }
  }

  const opacityForNextShape =
    typeof shape.opacity === 'number' ? Math.max(0, Math.min(1, shape.opacity)) : undefined;

  if (Object.keys(stylesForNextShape).length === 0 && opacityForNextShape === undefined) {
    return null;
  }

  return {
    stylesForNextShape,
    opacityForNextShape,
    updatedAt: Date.now(),
  };
}

/**
 * @param {Record<string, string | number | boolean>} styles
 * @returns {Record<string, string | number | boolean>}
 */
function getSharedAnnotationStyles(styles) {
  /** @type {Record<string, string | number | boolean>} */
  const sharedStyles = {};

  for (const [styleId, value] of Object.entries(styles)) {
    if (SHARED_ANNOTATION_STYLE_IDS.has(styleId) && isSerializableStyleValue(value)) {
      sharedStyles[styleId] = value;
    }
  }

  return sharedStyles;
}

/**
 * @param {Record<string, string | number | boolean>} styles
 * @returns {void}
 */
function rememberSharedAnnotationStyles(styles) {
  const sharedStyles = getSharedAnnotationStyles(styles);
  if (Object.keys(sharedStyles).length === 0) return;

  editorState.annotationStylePreferences = {
    version: 1,
    shapes: editorState.annotationStylePreferences.shapes,
    sharedStylesForNextShape: {
      ...editorState.annotationStylePreferences.sharedStylesForNextShape,
      ...sharedStyles,
    },
  };
  scheduleAnnotationStylePreferencesSave();
}

/**
 * @param {any} editor
 * @returns {void}
 */
function rememberSharedAnnotationStylesFromEditor(editor) {
  const styles = editor?.getInstanceState?.()?.stylesForNextShape;
  if (!styles || typeof styles !== 'object') return;
  rememberSharedAnnotationStyles(styles);
}

/**
 * @param {any} editor
 * @returns {{ key: string } | null}
 */
function getCurrentAnnotationStylePreferenceTarget(editor) {
  const shapeType = editor?.getCurrentTool?.()?.shapeType;
  if (!ANNOTATION_SHAPE_TYPES.has(shapeType)) return null;

  if (shapeType === 'geo') {
    const geo = editor.getInstanceState?.().stylesForNextShape?.['tldraw:geo'];
    return { key: `geo:${typeof geo === 'string' ? geo : 'rectangle'}` };
  }

  return { key: shapeType };
}

/**
 * @param {any} editor
 * @param {string} key
 * @returns {void}
 */
function applyAnnotationStylePreference(editor, key) {
  const preference = editorState.annotationStylePreferences.shapes[key];
  const sharedStyles = editorState.annotationStylePreferences.sharedStylesForNextShape;

  if (!preference && Object.keys(sharedStyles).length === 0) return;

  const instanceState = editor.getInstanceState?.();
  if (!instanceState) return;

  /** @type {{ stylesForNextShape: Record<string, string | number | boolean>, opacityForNextShape?: number }} */
  const nextState = {
    stylesForNextShape: {
      ...(instanceState.stylesForNextShape || {}),
      ...(preference?.stylesForNextShape || {}),
      ...sharedStyles,
    },
  };

  if (preference?.opacityForNextShape !== undefined) {
    nextState.opacityForNextShape = preference.opacityForNextShape;
  }

  editor.updateInstanceState(nextState);
}

/**
 * @param {any} editor
 * @returns {void}
 */
function applyCurrentAnnotationStylePreference(editor) {
  const target = getCurrentAnnotationStylePreferenceTarget(editor);
  if (!target) return;
  applyAnnotationStylePreference(editor, target.key);
}

/**
 * @param {string} key
 * @param {AnnotationStylePreference | null} preference
 * @returns {void}
 */
function rememberAnnotationStylePreference(key, preference) {
  if (!preference) return;
  rememberSharedAnnotationStyles(preference.stylesForNextShape);

  editorState.annotationStylePreferences = {
    version: 1,
    shapes: {
      ...editorState.annotationStylePreferences.shapes,
      [key]: preference,
    },
    sharedStylesForNextShape: editorState.annotationStylePreferences.sharedStylesForNextShape,
  };
  scheduleAnnotationStylePreferencesSave();
}

/**
 * @param {any} editor
 * @param {any} shape
 * @returns {void}
 */
function rememberAnnotationShapeStyle(editor, shape) {
  const key = getAnnotationStylePreferenceKeyForShape(shape);
  if (!key) return;
  rememberAnnotationStylePreference(key, getAnnotationStylePreferenceForShape(editor, shape));
}

/**
 * @param {any} value
 * @returns {any[]}
 */
function getChangeRecords(value) {
  if (!value) return [];
  if (value instanceof Map) return Array.from(value.values());
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return Object.values(value);
  return [];
}

/**
 * @param {any} editor
 * @returns {() => void}
 */
function bindAnnotationStylePreferences(editor) {
  applyCurrentAnnotationStylePreference(editor);

  const scheduleApplyCurrentPreference = () => {
    window.requestAnimationFrame(() => {
      rememberSharedAnnotationStylesFromEditor(editor);
      applyCurrentAnnotationStylePreference(editor);
    });
  };
  const applyBeforeCreatingShape = () => {
    rememberSharedAnnotationStylesFromEditor(editor);
    applyCurrentAnnotationStylePreference(editor);
  };

  document.addEventListener('pointerdown', applyBeforeCreatingShape, true);
  document.addEventListener('pointerup', scheduleApplyCurrentPreference, true);
  document.addEventListener('keydown', scheduleApplyCurrentPreference, true);

  const disposeDocumentListener = editor.store.listen(
    ({ changes }) => {
      for (const record of getChangeRecords(changes?.added)) {
        if (record?.typeName === 'shape') {
          rememberAnnotationShapeStyle(editor, record);
        }
      }

      for (const value of getChangeRecords(changes?.updated)) {
        const record = Array.isArray(value) ? value[1] : value;
        if (record?.typeName === 'shape') {
          rememberAnnotationShapeStyle(editor, record);
        }
      }
    },
    { source: 'user', scope: 'document' }
  );

  return () => {
    document.removeEventListener('pointerdown', applyBeforeCreatingShape, true);
    document.removeEventListener('pointerup', scheduleApplyCurrentPreference, true);
    document.removeEventListener('keydown', scheduleApplyCurrentPreference, true);
    disposeDocumentListener?.();
  };
}

/**
 * @returns {HTMLButtonElement | null}
 */
function getCropButton() {
  return /** @type {HTMLButtonElement | null} */ (document.getElementById('action-crop'));
}

/**
 * @param {boolean} active
 * @returns {void}
 */
function setCropButtonActive(active) {
  const button = getCropButton();
  if (!button) return;
  button.classList.toggle('btn-active', active);
  button.setAttribute('aria-pressed', active ? 'true' : 'false');
}

/**
 * @returns {any | null}
 */
function getScreenshotShape() {
  const { editor, screenshotShapeId } = editorState;
  if (!editor || !screenshotShapeId) return null;
  return editor.getShape?.(screenshotShapeId) || null;
}

/**
 * Returns the uncropped natural dimensions (width, height) and the uncropped top-left origin (originX, originY)
 * in page coordinates for the current screenshot shape.
 * @returns {{ originX: number, originY: number, width: number, height: number } | null}
 */
function getScreenshotUncroppedMetrics() {
  const shape = getScreenshotShape();
  if (!shape) return null;

  const natW = editorState.screenshotInfo?.width || shape.props?.w || 1;
  const natH = editorState.screenshotInfo?.height || shape.props?.h || 1;
  const crop = shape.props?.crop;

  let originX = shape.x;
  let originY = shape.y;

  if (crop && crop.topLeft) {
    originX = shape.x - crop.topLeft.x * natW;
    originY = shape.y - crop.topLeft.y * natH;
  }

  return { originX, originY, width: natW, height: natH };
}

/**
 * @returns {void}
 */
function updateScreenshotExportBounds() {
  const { editor, screenshotShapeId } = editorState;
  if (!editor || !screenshotShapeId) return;

  const bounds = editor.getShapePageBounds?.(screenshotShapeId);
  if (bounds) {
    editorState.bounds = bounds;
  }
}

/**
 * @param {{ width: number, height: number }} viewport
 * @returns {number}
 */
function getScreenshotFitInset(viewport) {
  const minDim = Math.min(viewport.width, viewport.height);
  const dynamicInset = Math.round(minDim * 0.22);
  const maxSafeInset = Math.round(minDim * 0.28);
  return Math.min(maxSafeInset, Math.max(140, dynamicInset));
}

/**
 * Zooms the camera to fit the screenshot bounds within the viewport.
 * @param {{ immediate?: boolean }} [options]
 * @returns {void}
 */
function fitScreenshotToViewport(options = {}) {
  const { editor, screenshotShapeId } = editorState;
  if (!editor || !screenshotShapeId) return;

  const bounds = editor.getShapePageBounds?.(screenshotShapeId);
  if (!bounds) return;

  editorState.bounds = bounds;

  const viewport = editor.getViewportScreenBounds?.() || {
    width: window.innerWidth,
    height: window.innerHeight,
  };
  const inset = getScreenshotFitInset(viewport);

  editor.zoomToBounds(bounds, {
    inset,
    animation: options.immediate ? undefined : { duration: 240 },
    immediate: Boolean(options.immediate),
  });
}

/**
 * Checks whether the screenshot shape crop or dimensions have changed since crop started.
 * @returns {boolean}
 */
function hasScreenshotCropChanged() {
  const shape = getScreenshotShape();
  if (!shape || !editorState.cropInitialState) return false;
  const currentCrop = shape.props?.crop ? JSON.stringify(shape.props.crop) : null;
  return (
    currentCrop !== editorState.cropInitialState.crop ||
    Math.abs((shape.props?.w || 0) - (editorState.cropInitialState.w || 0)) > 1 ||
    Math.abs((shape.props?.h || 0) - (editorState.cropInitialState.h || 0)) > 1 ||
    Math.abs((shape.x || 0) - (editorState.cropInitialState.x || 0)) > 1 ||
    Math.abs((shape.y || 0) - (editorState.cropInitialState.y || 0)) > 1
  );
}

/**
 * @param {boolean} locked
 * @returns {void}
 */
function setScreenshotLocked(locked) {
  const { editor } = editorState;
  const shape = getScreenshotShape();
  if (!editor || !shape || shape.isLocked === locked) return;

  editor.run(
    () => {
      editor.updateShape({
        id: shape.id,
        type: shape.type,
        isLocked: locked,
      });
    },
    { history: 'ignore', ignoreShapeLock: true }
  );
}

/**
 * @returns {boolean}
 */
function isScreenshotCropModeActive() {
  const { editor, screenshotShapeId } = editorState;
  if (!editor || !screenshotShapeId) return false;

  return Boolean(editor.isIn?.('select.crop'));
}

/**
 * @returns {void}
 */
function syncScreenshotCropState() {
  const active = isScreenshotCropModeActive();
  setCropButtonActive(active);
  document.body.classList.toggle('crop-mode-active', active);
  updateScreenshotExportBounds();

  if (editorState.isCroppingScreenshot && !active) {
    finishScreenshotCrop({ preserveTool: true });
  }
}

/**
 * @param {any} editor
 * @returns {() => void}
 */
function bindScreenshotCropState(editor) {
  let syncFrame = 0;
  const scheduleSync = () => {
    if (syncFrame) return;
    syncFrame = window.requestAnimationFrame(() => {
      syncFrame = 0;
      syncScreenshotCropState();
    });
  };

  const disposeStoreListener = editor.store.listen(scheduleSync);
  document.addEventListener('pointerup', scheduleSync, true);
  document.addEventListener('pointerdown', scheduleSync, true);
  document.addEventListener('click', scheduleSync, true);
  document.addEventListener('keydown', scheduleSync, true);
  document.addEventListener('keyup', scheduleSync, true);

  return () => {
    if (syncFrame) {
      window.cancelAnimationFrame(syncFrame);
    }
    document.removeEventListener('pointerup', scheduleSync, true);
    document.removeEventListener('pointerdown', scheduleSync, true);
    document.removeEventListener('click', scheduleSync, true);
    document.removeEventListener('keydown', scheduleSync, true);
    document.removeEventListener('keyup', scheduleSync, true);
    disposeStoreListener?.();
  };
}

/**
 * Enables click-drag-and-release anywhere across the screenshot to set the crop area,
 * while preserving native corner/edge handles for fine-tuning.
 *
 * @param {any} editor
 * @returns {() => void}
 */
function bindCropDragInteraction(editor) {
  let isPointerDown = false;
  let hasMovedEnough = false;
  let startClientX = 0;
  let startClientY = 0;
  let lastClientX = 0;
  let lastClientY = 0;
  let startPageX = 0;
  let startPageY = 0;
  let currentMetrics = null;

  let marqueeEl = document.getElementById('crop-marquee-overlay');
  if (!marqueeEl) {
    marqueeEl = document.createElement('div');
    marqueeEl.id = 'crop-marquee-overlay';
    marqueeEl.className = 'crop-marquee-overlay hidden';
    marqueeEl.innerHTML = '<div class="crop-marquee-badge"></div>';
    document.body.appendChild(marqueeEl);
  }
  const badgeEl = marqueeEl.querySelector('.crop-marquee-badge');

  function hideMarquee() {
    marqueeEl.classList.add('hidden');
    marqueeEl.style.width = '0px';
    marqueeEl.style.height = '0px';
    document.body.classList.remove('crop-dragging-active');
  }

  function isNearHandle(clientX, clientY) {
    const pagePoint = editor.screenToPage({ x: clientX, y: clientY });
    const zoom = editor.getZoomLevel?.() || 1;
    const hitMargin = (editor.options?.hitTestMargin || 14) / zoom;
    const overlay = editor.overlays?.getOverlayAtPoint?.(pagePoint, hitMargin);
    if (
      overlay &&
      (overlay.props?.overlayType === 'resize_handle' ||
        overlay.props?.overlayType === 'crop_handle' ||
        overlay.props?.handle)
    ) {
      return true;
    }

    const currentBounds = editor.getShapePageBounds?.(editorState.screenshotShapeId);
    if (currentBounds) {
      const handlePoints = [
        editor.pageToScreen({ x: currentBounds.minX, y: currentBounds.minY }),
        editor.pageToScreen({ x: currentBounds.maxX, y: currentBounds.minY }),
        editor.pageToScreen({ x: currentBounds.minX, y: currentBounds.maxY }),
        editor.pageToScreen({ x: currentBounds.maxX, y: currentBounds.maxY }),
        editor.pageToScreen({ x: currentBounds.midX, y: currentBounds.minY }),
        editor.pageToScreen({ x: currentBounds.midX, y: currentBounds.maxY }),
        editor.pageToScreen({ x: currentBounds.minX, y: currentBounds.midY }),
        editor.pageToScreen({ x: currentBounds.maxX, y: currentBounds.midY }),
      ];
      for (const pt of handlePoints) {
        if (Math.hypot(pt.x - clientX, pt.y - clientY) <= 18) {
          return true;
        }
      }
    }
    return false;
  }

  function calculateCropBox(currClientX, currClientY, shiftKey) {
    if (!currentMetrics) return null;
    const currPage = editor.screenToPage({ x: currClientX, y: currClientY });

    const minX = currentMetrics.originX;
    const maxX = currentMetrics.originX + currentMetrics.width;
    const minY = currentMetrics.originY;
    const maxY = currentMetrics.originY + currentMetrics.height;

    const csX = Math.max(minX, Math.min(maxX, startPageX));
    const csY = Math.max(minY, Math.min(maxY, startPageY));

    const rawEndX = Math.max(minX, Math.min(maxX, currPage.x));
    const rawEndY = Math.max(minY, Math.min(maxY, currPage.y));

    let endX = rawEndX;
    let endY = rawEndY;

    if (shiftKey) {
      const dx = rawEndX - csX;
      const dy = rawEndY - csY;
      let side = Math.max(Math.abs(dx), Math.abs(dy));
      const signX = dx >= 0 ? 1 : -1;
      const signY = dy >= 0 ? 1 : -1;
      const maxSideX = signX > 0 ? maxX - csX : csX - minX;
      const maxSideY = signY > 0 ? maxY - csY : csY - minY;
      side = Math.min(side, maxSideX, maxSideY);
      endX = csX + signX * side;
      endY = csY + signY * side;
    }

    const boxPageX = Math.min(csX, endX);
    const boxPageY = Math.min(csY, endY);
    const boxPageW = Math.abs(endX - csX);
    const boxPageH = Math.abs(endY - csY);

    return {
      boxPageX,
      boxPageY,
      boxPageW,
      boxPageH,
      metrics: currentMetrics,
    };
  }

  function updateMarqueeUI(box) {
    const screenP1 = editor.pageToScreen({ x: box.boxPageX, y: box.boxPageY });
    const screenP2 = editor.pageToScreen({ x: box.boxPageX + box.boxPageW, y: box.boxPageY + box.boxPageH });

    const left = Math.min(screenP1.x, screenP2.x);
    const top = Math.min(screenP1.y, screenP2.y);
    const width = Math.abs(screenP2.x - screenP1.x);
    const height = Math.abs(screenP2.y - screenP1.y);

    marqueeEl.style.left = `${left}px`;
    marqueeEl.style.top = `${top}px`;
    marqueeEl.style.width = `${width}px`;
    marqueeEl.style.height = `${height}px`;
    marqueeEl.classList.remove('hidden');
    document.body.classList.add('crop-dragging-active');

    if (badgeEl) {
      const naturalW = Math.round((box.boxPageW / box.metrics.width) * currentMetrics.width);
      const naturalH = Math.round((box.boxPageH / box.metrics.height) * currentMetrics.height);
      badgeEl.textContent = `${naturalW} × ${naturalH}`;

      if (top + height + 34 > window.innerHeight) {
        badgeEl.style.bottom = 'auto';
        badgeEl.style.top = '-28px';
      } else {
        badgeEl.style.top = 'auto';
        badgeEl.style.bottom = '-28px';
      }
    }
  }

  function onPointerDown(e) {
    syncScreenshotCropState();
    if (!isScreenshotCropModeActive()) return;
    if (e.button !== 0) return;

    const target = e.target;
    if (
      target instanceof HTMLElement &&
      target.closest(
        'button, input, select, textarea, [role="toolbar"], [role="menu"], [role="dialog"], .tl-toolbar, .tl-floating-toolbar, .decoration-floating-bar, .screenshot-editor-toolbar, .glass-nav, .tlui-toolbar, .tlui-main-toolbar, .tlui-menu, .tlui-popover, .tl-popover'
      )
    ) {
      return;
    }

    if (
      (target instanceof HTMLElement || target instanceof SVGElement) &&
      target.closest('[data-testid*="handle"], [class*="handle"], [class*="corner"], [class*="edge"]')
    ) {
      return;
    }

    if (isNearHandle(e.clientX, e.clientY)) {
      return;
    }

    currentMetrics = getScreenshotUncroppedMetrics();
    if (!currentMetrics) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    isPointerDown = true;
    hasMovedEnough = false;
    startClientX = e.clientX;
    startClientY = e.clientY;
    lastClientX = e.clientX;
    lastClientY = e.clientY;

    const startP = editor.screenToPage({ x: e.clientX, y: e.clientY });
    startPageX = startP.x;
    startPageY = startP.y;

    window.addEventListener('pointermove', onPointerMove, { capture: true });
    window.addEventListener('pointerup', onPointerUp, { capture: true });
    window.addEventListener('pointercancel', onPointerCancel, { capture: true });
    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true });
  }

  function onPointerMove(e) {
    if (!isPointerDown || !currentMetrics) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    lastClientX = e.clientX;
    lastClientY = e.clientY;

    const screenDist = Math.hypot(e.clientX - startClientX, e.clientY - startClientY);
    if (!hasMovedEnough && screenDist >= 4) {
      hasMovedEnough = true;
    }

    if (hasMovedEnough) {
      const box = calculateCropBox(e.clientX, e.clientY, e.shiftKey);
      if (box) {
        updateMarqueeUI(box);
      }
    }
  }

  function onPointerUp(e) {
    if (!isPointerDown) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const screenDist = Math.hypot(e.clientX - startClientX, e.clientY - startClientY);
    const box = calculateCropBox(e.clientX, e.clientY, e.shiftKey);

    cleanupDrag();

    if (screenDist >= 10 && box && box.boxPageW >= 4 && box.boxPageH >= 4) {
      applyCropBox(box);
    }
  }

  function onPointerCancel() {
    if (!isPointerDown) return;
    cleanupDrag();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape' && isPointerDown) {
      e.preventDefault();
      e.stopPropagation();
      cleanupDrag();
      return;
    }

    if (e.key === 'Shift' && isPointerDown && hasMovedEnough) {
      const box = calculateCropBox(lastClientX, lastClientY, true);
      if (box) updateMarqueeUI(box);
    }
  }

  function onKeyUp(e) {
    if (e.key === 'Shift' && isPointerDown && hasMovedEnough) {
      const box = calculateCropBox(lastClientX, lastClientY, false);
      if (box) updateMarqueeUI(box);
    }
  }

  function cleanupDrag() {
    isPointerDown = false;
    hasMovedEnough = false;
    currentMetrics = null;
    hideMarquee();
    window.removeEventListener('pointermove', onPointerMove, { capture: true });
    window.removeEventListener('pointerup', onPointerUp, { capture: true });
    window.removeEventListener('pointercancel', onPointerCancel, { capture: true });
    window.removeEventListener('keydown', onKeyDown, { capture: true });
    window.removeEventListener('keyup', onKeyUp, { capture: true });
  }

  function applyCropBox(box) {
    const shape = getScreenshotShape();
    if (!editor || !shape || !box.metrics) return;

    const tlx = Math.max(0, Math.min(1, (box.boxPageX - box.metrics.originX) / box.metrics.width));
    const tly = Math.max(0, Math.min(1, (box.boxPageY - box.metrics.originY) / box.metrics.height));
    const brx = Math.max(0, Math.min(1, (box.boxPageX + box.boxPageW - box.metrics.originX) / box.metrics.width));
    const bry = Math.max(0, Math.min(1, (box.boxPageY + box.boxPageH - box.metrics.originY) / box.metrics.height));

    if (brx - tlx < 0.001 || bry - tly < 0.001) return;

    editor.run(
      () => {
        editor.updateShape({
          id: shape.id,
          type: shape.type,
          x: box.boxPageX,
          y: box.boxPageY,
          isLocked: true,
          props: {
            ...shape.props,
            w: box.boxPageW,
            h: box.boxPageH,
            crop: {
              topLeft: { x: tlx, y: tly },
              bottomRight: { x: brx, y: bry },
            },
          },
        });
        editor.setCroppingShape?.(null);
        editor.selectNone();
        editor.setCurrentTool('select.idle');
      },
      { history: 'ignore', ignoreShapeLock: true }
    );

    editorState.isCroppingScreenshot = false;
    setCropButtonActive(false);
    document.body.classList.remove('crop-mode-active');
    updateScreenshotExportBounds();
    fitScreenshotToViewport();
    editorState.cropInitialState = null;
  }

  window.addEventListener('pointerdown', onPointerDown, { capture: true });

  return () => {
    cleanupDrag();
    window.removeEventListener('pointerdown', onPointerDown, { capture: true });
    marqueeEl?.remove();
  };
}

/**
 * @param {EventTarget | null} target
 * @returns {boolean}
 */
function isEditableShortcutTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'));
}

/**
 * @param {KeyboardEvent} event
 * @returns {boolean}
 */
function isCropShortcutEvent(event) {
  return (
    event.key.toLowerCase() === 'c' &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    !isEditableShortcutTarget(event.target) &&
    !editorState.editor?.getEditingShapeId?.()
  );
}

/**
 * @param {KeyboardEvent} event
 * @returns {boolean}
 */
function isDecorateShortcutEvent(event) {
  return (
    event.key.toLowerCase() === 'd' &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    !isEditableShortcutTarget(event.target) &&
    !editorState.editor?.getEditingShapeId?.()
  );
}

/**
 * @returns {void}
 */
function toggleDecorationMode() {
  editorState.decorationPreferences = {
    ...editorState.decorationPreferences,
    enabled: !editorState.decorationPreferences.enabled,
  };
  syncDecorationUI();
  scheduleDecorationPreferencesSave();
}

/**
 * @param {KeyboardEvent} event
 * @returns {void}
 */
function handleScreenshotEditorShortcut(event) {
  if (isCropShortcutEvent(event)) {
    event.preventDefault();
    event.stopPropagation();
    if (isScreenshotCropModeActive()) {
      finishScreenshotCrop();
    } else {
      startScreenshotCrop();
    }
    return;
  }

  if (event.key === 'Enter' && isScreenshotCropModeActive()) {
    event.preventDefault();
    event.stopPropagation();
    finishScreenshotCrop();
    return;
  }

  if (event.key === 'Escape' && isScreenshotCropModeActive()) {
    event.preventDefault();
    event.stopPropagation();
    finishScreenshotCrop();
    return;
  }

  if (isDecorateShortcutEvent(event)) {
    event.preventDefault();
    event.stopPropagation();
    toggleDecorationMode();
  }
}

/**
 * @param {any} editor
 * @param {ScreenshotInfo} screenshot
 * @returns {void}
 */
function insertScreenshot(editor, screenshot) {
  const assetId = AssetRecordType.createId();
  const shapeId = createShapeId('screenshot-background');

  editor.run(
    () => {
      editor.createAssets([
        {
          id: assetId,
          typeName: 'asset',
          type: 'image',
          props: {
            name: 'screenshot.png',
            src: screenshot.dataUrl,
            w: screenshot.width,
            h: screenshot.height,
            mimeType: screenshot.mimeType,
            isAnimated: false,
          },
          meta: {},
        },
      ]);

      editor.createShape({
        id: shapeId,
        type: 'image',
        x: 0,
        y: 0,
        isLocked: true,
        props: {
          assetId,
          w: screenshot.width,
          h: screenshot.height,
          altText: 'Captured screenshot',
        },
      });

      editor.selectNone();
    },
    { history: 'ignore', ignoreShapeLock: true }
  );

  editorState.screenshotInfo = screenshot;
  editorState.screenshotShapeId = shapeId;
  editorState.bounds =
    editor.getShapePageBounds(shapeId) || {
      x: 0,
      y: 0,
      w: screenshot.width,
      h: screenshot.height,
    };

  fitScreenshotToViewport({ immediate: true });
}

/**
 * @returns {void}
 */
function startScreenshotCrop() {
  if (isScreenshotCropModeActive()) {
    finishScreenshotCrop();
    return;
  }

  const { editor, screenshotShapeId } = editorState;
  const shape = getScreenshotShape();

  if (!editor || !screenshotShapeId || !shape) {
    alert('Screenshot editor is not ready yet.');
    return;
  }

  editorState.cropInitialState = {
    crop: shape.props?.crop ? JSON.stringify(shape.props.crop) : null,
    w: shape.props?.w,
    h: shape.props?.h,
    x: shape.x,
    y: shape.y,
  };

  editor.complete?.();
  editor.run(
    () => {
      editor.updateShape({
        id: shape.id,
        type: shape.type,
        isLocked: false,
      });
      editor.select(screenshotShapeId);
      editor.setCroppingShape?.(screenshotShapeId);
      editor.setCurrentTool('select.crop.idle');
    },
    { history: 'ignore', ignoreShapeLock: true }
  );

  editorState.isCroppingScreenshot = true;
  setCropButtonActive(true);
  document.body.classList.add('crop-mode-active');
}

/**
 * @param {{ preserveTool?: boolean, forceFit?: boolean }} [options]
 * @returns {void}
 */
function finishScreenshotCrop(options = {}) {
  const { editor } = editorState;
  if (!editor || (!editorState.isCroppingScreenshot && !isScreenshotCropModeActive())) return;

  const cropChanged = hasScreenshotCropChanged();

  editor.complete?.();
  editor.setCroppingShape?.(null);
  if (!options.preserveTool) {
    editor.setCurrentTool?.('select.idle');
  }
  editor.selectNone();
  editorState.isCroppingScreenshot = false;
  setScreenshotLocked(true);
  setCropButtonActive(false);
  document.body.classList.remove('crop-mode-active');
  updateScreenshotExportBounds();

  if (cropChanged || options.forceFit) {
    fitScreenshotToViewport();
  }
  editorState.cropInitialState = null;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {number} radius
 * @returns {void}
 */
function drawRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/**
 * @param {Blob} imageBlob
 * @param {'png' | 'jpeg'} format
 * @returns {Promise<Blob>}
 */
async function compositeDecoratedScreenshot(imageBlob, format) {
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(imageBlob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load exported screenshot for composition'));
    };
    img.src = url;
  });

  const sw = image.naturalWidth || image.width;
  const sh = image.naturalHeight || image.height;
  const { padding } = editorState.decorationPreferences;
  const stops = getDecorationGradientStops(editorState.decorationPreferences);

  const scaleFactor = Math.max(1, Math.min(sw, sh) / 1080);
  const pad = Math.round(52 * scaleFactor);
  const bWidth = Math.max(8, Math.round(10 * scaleFactor));
  const innerRadius = Math.max(12, Math.round(18 * scaleFactor));
  const outerRadius = innerRadius + bWidth;

  const totalW = sw + (pad * 2);
  const totalH = sh + (pad * 2);

  const canvas = document.createElement('canvas');
  canvas.width = totalW;
  canvas.height = totalH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D canvas context for decoration');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 1. Soft Gradient Background
  const grad = ctx.createLinearGradient(0, 0, totalW, totalH);
  if (stops.length === 2) {
    grad.addColorStop(0, stops[0]);
    grad.addColorStop(1, stops[1]);
  } else if (stops.length >= 3) {
    grad.addColorStop(0, stops[0]);
    grad.addColorStop(0.5, stops[1]);
    grad.addColorStop(1, stops[2]);
  } else if (stops.length === 1) {
    grad.addColorStop(0, stops[0]);
    grad.addColorStop(1, stops[0]);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, totalW, totalH);

  // Frame dimensions (screenshot + border bezel)
  const frameX = pad - bWidth;
  const frameY = pad - bWidth;
  const frameW = sw + (bWidth * 2);
  const frameH = sh + (bWidth * 2);

  // 2. Soft Drop Shadows (Multi-pass realistic diffusion)
  // Layer 1: Ambient soft blur
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.16)';
  ctx.shadowBlur = Math.round(36 * scaleFactor);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = Math.round(16 * scaleFactor);
  ctx.fillStyle = '#000000';
  drawRoundedRect(ctx, frameX, frameY, frameW, frameH, outerRadius);
  ctx.fill();
  ctx.restore();

  // Layer 2: Key light depth
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
  ctx.shadowBlur = Math.round(18 * scaleFactor);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = Math.round(8 * scaleFactor);
  ctx.fillStyle = '#000000';
  drawRoundedRect(ctx, frameX, frameY, frameW, frameH, outerRadius);
  ctx.fill();
  ctx.restore();

  // Layer 3: Contact shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
  ctx.shadowBlur = Math.round(6 * scaleFactor);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = Math.round(2 * scaleFactor);
  ctx.fillStyle = '#000000';
  drawRoundedRect(ctx, frameX, frameY, frameW, frameH, outerRadius);
  ctx.fill();
  ctx.restore();

  // Restore clean gradient background inside frame so translucent border blends naturally
  ctx.save();
  drawRoundedRect(ctx, frameX, frameY, frameW, frameH, outerRadius);
  ctx.clip();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, totalW, totalH);
  ctx.restore();

  // 3. Thick Semi-Transparent Rounded Border
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  drawRoundedRect(ctx, frameX, frameY, frameW, frameH, outerRadius);
  ctx.fill();

  // Subtle 1px translucent highlight stroke
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.50)';
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, frameX + 0.5, frameY + 0.5, frameW - 1, frameH - 1, outerRadius);
  ctx.stroke();
  ctx.restore();

  // 4. Rounded Screenshot & Annotations (clipped to inner rounded rect)
  ctx.save();
  drawRoundedRect(ctx, pad, pad, sw, sh, innerRadius);
  ctx.clip();
  ctx.drawImage(image, pad, pad, sw, sh);
  ctx.restore();

  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const quality = format === 'jpeg' ? EXPORT_IMAGE_QUALITY : undefined;

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to generate composite image'));
      },
      mimeType,
      quality
    );
  });
}

/**
 * @param {'png' | 'jpeg'} format
 * @returns {Promise<Blob>}
 */
async function exportAnnotatedScreenshot(format) {
  const { editor } = editorState;
  if (!editor || !editorState.bounds) {
    throw new Error('Screenshot editor is not ready yet.');
  }

  finishScreenshotCrop();
  editor.selectNone();
  updateScreenshotExportBounds();
  if (!editorState.bounds) {
    throw new Error('Screenshot editor is not ready yet.');
  }

  const shapeIds = Array.from(editor.getCurrentPageShapeIds());
  const isDecorated = editorState.decorationPreferences.enabled;

  const result = await editor.toImage(shapeIds, {
    format: isDecorated ? 'png' : format,
    bounds: editorState.bounds,
    background: !isDecorated,
    padding: 0,
    pixelRatio: EXPORT_IMAGE_PIXEL_RATIO,
    ...(!isDecorated && format === 'jpeg' ? { quality: EXPORT_IMAGE_QUALITY } : {}),
  });

  if (!result || !result.blob) {
    throw new Error('Failed to export annotated screenshot.');
  }

  if (isDecorated) {
    return compositeDecoratedScreenshot(result.blob, format);
  }

  return result.blob;
}

/**
 * @returns {string}
 */
function createScreenshotFilename() {
  return `screenshot-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.jpg`;
}

/**
 * @returns {Promise<void>}
 */
async function copyToClipboard() {
  const button = /** @type {HTMLButtonElement | null} */ (document.getElementById('action-copy'));
  try {
    setButtonBusy(button, true);
    // ClipboardItem only supports image/png for image clipboard writes in Chrome.
    const blob = await exportAnnotatedScreenshot(CLIPBOARD_IMAGE_FORMAT);
    await navigator.clipboard.write([new ClipboardItem({ [CLIPBOARD_IMAGE_MIME_TYPE]: blob })]);
    showActionSuccessIcon('action-copy');

    if (editorState.closeAfterAction) {
      window.setTimeout(() => window.close(), 500);
    }
  } catch (error) {
    console.error('[editor] Failed to copy annotated screenshot:', error);
    alert(error instanceof Error ? error.message : 'Failed to copy to clipboard.');
  } finally {
    setButtonBusy(button, false);
  }
}

/**
 * @returns {Promise<void>}
 */
async function saveImage() {
  const button = /** @type {HTMLButtonElement | null} */ (document.getElementById('action-save'));
  let objectUrl = '';
  try {
    setButtonBusy(button, true);
    const blob = await exportAnnotatedScreenshot(EXPORT_IMAGE_FORMAT);
    objectUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.download = createScreenshotFilename();
    link.href = objectUrl;
    link.click();

    showActionSuccessIcon('action-save');

    if (editorState.closeAfterAction) {
      window.setTimeout(() => window.close(), 500);
    }
  } catch (error) {
    console.error('[editor] Failed to save annotated screenshot:', error);
    alert(error instanceof Error ? error.message : 'Failed to save screenshot.');
  } finally {
    if (objectUrl) {
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
    setButtonBusy(button, false);
  }
}

/**
 * @param {{ screenshot: ScreenshotInfo }} props
 * @returns {any}
 */
function ScreenshotEditorApp({ screenshot }) {
  const assetUrls = useMemo(() => {
    return getAssetUrls({
      baseUrl: chrome.runtime.getURL('libs/tldraw/assets'),
    });
  }, []);

  const handleMount = useCallback(
    (editor) => {
      editorState.editor = editor;
      insertScreenshot(editor, screenshot);
      const disposeAnnotationStylePreferences = bindAnnotationStylePreferences(editor);
      const disposeScreenshotCropState = bindScreenshotCropState(editor);
      const disposeCropDrag = bindCropDragInteraction(editor);
      hideStatus();
      return () => {
        disposeAnnotationStylePreferences();
        disposeScreenshotCropState();
        disposeCropDrag();
      };
    },
    [screenshot]
  );

  return h(Tldraw, {
    assetUrls,
    autoFocus: true,
    onMount: handleMount,
  });
}

/**
 * @returns {void}
 */
function bindActions() {
  const closeAfter = /** @type {HTMLInputElement | null} */ (
    document.getElementById('prop-close-after')
  );
  if (closeAfter) {
    closeAfter.checked = editorState.closeAfterAction;
  }

  closeAfter?.addEventListener('change', () => {
    editorState.closeAfterAction = Boolean(closeAfter.checked);
    saveCloseAfterActionPreference(editorState.closeAfterAction);
  });

  document.getElementById('action-decorate')?.addEventListener('click', () => {
    toggleDecorationMode();
  });

  document.getElementById('prop-decoration-toggle')?.addEventListener('click', () => {
    toggleDecorationMode();
  });

  const hueSlider = /** @type {HTMLInputElement | null} */ (
    document.getElementById('prop-decoration-hue')
  );
  hueSlider?.addEventListener('input', () => {
    const hueVal = Number(hueSlider.value);
    editorState.decorationPreferences = {
      ...editorState.decorationPreferences,
      hue: hueVal,
      preset: 'custom',
    };
    syncDecorationUI();
    scheduleDecorationPreferencesSave();
  });

  document.querySelectorAll('.decoration-preset-dot').forEach((el) => {
    el.addEventListener('click', () => {
      const presetKey = el.getAttribute('data-preset');
      if (!presetKey) return;
      const presetDef = DECORATION_PRESETS[presetKey];
      editorState.decorationPreferences = {
        ...editorState.decorationPreferences,
        preset: presetKey,
        hue: presetDef ? presetDef.hue : editorState.decorationPreferences.hue,
      };
      syncDecorationUI();
      scheduleDecorationPreferencesSave();
    });
  });

  getCropButton()?.addEventListener('click', () => {
    if (isScreenshotCropModeActive()) {
      finishScreenshotCrop();
    } else {
      startScreenshotCrop();
    }
  });
  document.addEventListener('keydown', handleScreenshotEditorShortcut, true);
  document.getElementById('action-copy')?.addEventListener('click', () => {
    void copyToClipboard();
  });
  document.getElementById('action-save')?.addEventListener('click', () => {
    void saveImage();
  });
}

/**
 * @returns {Promise<void>}
 */
async function init() {
  bindActions();

  try {
    const [screenshot, annotationStylePreferences, closeAfterAction, decorationPreferences] = await Promise.all([
      loadStoredScreenshot(),
      loadAnnotationStylePreferences(),
      loadCloseAfterActionPreference(),
      loadDecorationPreferences(),
    ]);
    editorState.annotationStylePreferences = annotationStylePreferences;
    editorState.closeAfterAction = closeAfterAction;
    editorState.decorationPreferences = decorationPreferences;

    syncDecorationUI();

    const closeAfter = /** @type {HTMLInputElement | null} */ (
      document.getElementById('prop-close-after')
    );
    if (closeAfter) {
      closeAfter.checked = closeAfterAction;
    }

    const mountNode = document.getElementById('tldraw-editor');
    if (!mountNode) {
      throw new Error('Screenshot editor mount node is missing.');
    }

    const root = createRoot(mountNode);
    root.render(h(ScreenshotEditorApp, { screenshot }));
  } catch (error) {
    console.error('[editor] Failed to initialize screenshot editor:', error);
    setStatus(error instanceof Error ? error.message : 'Failed to initialize screenshot editor.');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  void init();
});

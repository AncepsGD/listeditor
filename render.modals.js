import { state, escHtml, makeLevelId, findDuplicateLevel, detectColumnsFromLevels, addDetectedColumn, removeDetectedColumn, FIELD_ID_SET } from './state.js';
import { startInsertion, saveSession, isRankedVariant, moveToPosition } from './logic.js';
import { showToast, deleteLevel, reevaluateRanked, resolveContradiction } from './logic.js';
import { addCustomValue, removeCustomValue, updateCustomValue, listImportTemplates, saveImportTemplate, loadImportTemplate, deleteImportTemplate } from './state.js';

let _importPreviewData = { records: [], schema: [], type: 'main' };
const MODAL_INTERNAL_FIELDS = new Set(['_id', 'pending', 'lowConfidence', 'confidence', 'lastEdited', 'customValues']);
const MODAL_VALUE_TYPES = ['text', 'number', 'boolean', 'object', 'array', 'null'];

function isManagedField(key) {
  return MODAL_INTERNAL_FIELDS.has(key);
}

function createNewLevelDraft() {
  const fieldKeys = new Set(['name']);
  state.rawLevels.forEach(level => {
    Object.keys(level)
      .filter(key => !isManagedField(key))
      .forEach(key => fieldKeys.add(key));
  });

  const values = Object.create(null);
  const types = Object.create(null);
  fieldKeys.forEach(key => {
    const type = inferExpectedFieldType(
      state.rawLevels.filter(level => Object.prototype.hasOwnProperty.call(level, key)).map(level => level[key])
    );
    types[key] = type;
    values[key] = createBlankValue(type);
  });
  return { values, types };
}

export function openEditModal(levelId) {
  const level = state.levelMap.get(levelId);
  if (!level) return;

  state.modalMode = 'edit';
  state.modalLevelId = levelId;
  state.modalOriginalKeys = Object.keys(level).filter(key => !isManagedField(key));

  document.getElementById('modal-title').textContent = `Editing: ${level.name || 'Untitled'}`;
  renderModalFields(level);
  const formHint = document.querySelector('.editor-form-hint');
  if (formHint) {
    formHint.textContent = state.lastImportWasArray
      ? 'Edit every value, including nested object properties and array items. Values retain their JSON types.'
      : 'Edit every value, including nested object properties and array items. Values retain their JSON types. Dragging a ranked level updates its rank.';
  }
  const editStatusGroup = document.getElementById('modal-status-group');
  if (editStatusGroup) editStatusGroup.style.display = 'none';

  document.getElementById('level-modal').classList.add('active');
  setTimeout(() => document.querySelector('#modal-fields [data-field-key="name"] .structured-value-editor input, #modal-fields [data-field-key="name"] .structured-value-editor textarea, #modal-fields [data-field-key="name"] .structured-value-editor select')?.focus(), 50);
}

export function openAddModal() {
  state.modalMode = 'add';
  state.modalLevelId = null;
  state.modalOriginalKeys = [];

  document.getElementById('modal-title').textContent = 'Add New Level';
  const draft = createNewLevelDraft();
  renderModalFields(draft.values, draft.types);
  const formHint = document.querySelector('.editor-form-hint');
  if (formHint) {
    formHint.textContent = state.lastImportWasArray
      ? 'Edit every value, including nested object properties and array items. Values retain their JSON types.'
      : 'Edit every value, including nested object properties and array items. Values retain their JSON types. Dragging a ranked level updates its rank.';
  }
  const newFieldName = document.getElementById('modal-new-field-name');
  if (newFieldName) newFieldName.value = '';
  const addStatusGroup = document.getElementById('modal-status-group');
  if (addStatusGroup) addStatusGroup.style.display = 'block';

  const defaultStatusRadio = document.querySelector(
    `input[name="modal-status"][value="${state.settings.defaultNewStatus}"]`
  );
  if (defaultStatusRadio) defaultStatusRadio.checked = true;

  document.getElementById('level-modal').classList.add('active');
  setTimeout(() => document.querySelector('#modal-fields [data-field-key="name"] .structured-value-editor input, #modal-fields [data-field-key="name"] .structured-value-editor textarea, #modal-fields [data-field-key="name"] .structured-value-editor select')?.focus(), 50);
}

function inferModalValueType(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return 'text';
}

function inferExpectedFieldType(values) {
  const presentValues = values.filter(value => value !== undefined && value !== '');
  const typedValues = presentValues.filter(value => value !== null);
  if (typedValues.length === 0) {
    return presentValues.length ? 'null' : 'text';
  }

  const counts = new Map();
  typedValues.forEach(value => {
    const type = inferModalValueType(value);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  });
  return typedValues
    .map(inferModalValueType)
    .reduce((mostCommon, type) =>
      counts.get(type) > counts.get(mostCommon) ? type : mostCommon
    );
}

function createBlankValue(type) {
  if (type === 'object') return {};
  if (type === 'array') return [];
  return null;
}

function isEmptyFieldValue(value) {
  return value === null || value === undefined || value === '';
}

function getExpectedFieldType(key, currentLevel) {
  const peerValues = state.rawLevels
    .filter(level => level !== currentLevel && Object.prototype.hasOwnProperty.call(level, key))
    .map(level => level[key]);
  const expectedType = inferExpectedFieldType(peerValues);
  return expectedType === 'text' && peerValues.length === 0
    ? inferModalValueType(currentLevel[key])
    : expectedType;
}

function isStructuredValueType(type) {
  return type === 'object' || type === 'array';
}

function findTextExamples(fieldKey) {
  const examples = new Set();
  const findInValue = value => {
    if (!value || typeof value !== 'object') return '';
    if (!Array.isArray(value) && Object.hasOwn(value, fieldKey)) {
      const candidate = value[fieldKey];
      if (typeof candidate === 'string' && candidate.trim()) examples.add(candidate.trim());
    }
    for (const child of Object.values(value)) {
      findInValue(child);
    }
  };

  state.rawLevels.forEach(findInValue);
  return [...examples];
}

function findNumberExamples(fieldKey) {
  const examples = new Set();
  const findInValue = value => {
    if (!value || typeof value !== 'object') return;
    if (!Array.isArray(value) && Object.hasOwn(value, fieldKey)) {
      const candidate = value[fieldKey];
      if (typeof candidate === 'number' && Number.isFinite(candidate)) examples.add(candidate);
    }
    Object.values(value).forEach(findInValue);
  };

  state.rawLevels.forEach(findInValue);
  return [...examples];
}

function setRandomNumberPlaceholder(control, examples) {
  if (!examples.length) return;
  const example = examples[Math.floor(Math.random() * examples.length)];
  control.placeholder = `e.g. ${example}`;
}

function createValuePickerButton(fieldKey) {
  const button = document.createElement('button');
  button.classList.add('btn', 'btn-xs', 'editor-value-picker-button');
  button.type = 'button';
  button.innerHTML = '<i class="fa-solid fa-list" aria-hidden="true"></i>';
  button.title = `Choose an existing value for ${fieldKey}`;
  button.setAttribute('aria-label', `Choose an existing value for ${fieldKey}`);
  return button;
}

function configureValuePicker(button, select, fieldKey, control) {
  const isEnabled = () => state.settings.valuePickerFields?.[fieldKey] === true;
  const updatePickerState = () => {
    select.hidden = !isEnabled();
    button.setAttribute('aria-pressed', String(isEnabled()));
    button.setAttribute('aria-label', `${isEnabled() ? 'Hide' : 'Show'} existing values for ${fieldKey}`);
    button.title = `${isEnabled() ? 'Hide' : 'Show'} existing values for ${fieldKey}`;
  };

  updatePickerState();
  button.addEventListener('click', () => {
    if (!state.settings.valuePickerFields || typeof state.settings.valuePickerFields !== 'object') {
      state.settings.valuePickerFields = {};
    }
    state.settings.valuePickerFields[fieldKey] = !isEnabled();
    persistModalSettings();
    updatePickerState();
    if (isEnabled()) select.focus();
  });
  select.addEventListener('change', () => {
    if (!select.value) return;
    control.value = select.value;
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    select.value = '';
  });
}

function addExistingValuesPicker(control, fieldKey, examples) {
  if (!examples.length || !(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) {
    return control;
  }

  const picker = document.createElement('div');
  picker.className = 'editor-value-picker';
  const button = createValuePickerButton(fieldKey);

  const select = document.createElement('select');
  select.className = 'field-input editor-value-picker-select';
  select.hidden = true;
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose an existing value…';
  select.appendChild(placeholder);
  examples.forEach(example => {
    const option = document.createElement('option');
    option.value = example;
    option.textContent = example.length > 100 ? `${example.slice(0, 97)}…` : example;
    option.title = example;
    select.appendChild(option);
  });

  configureValuePicker(button, select, fieldKey, control);

  picker.append(control, button, select);
  return picker;
}

function findArrayItemTextExamples(fieldKey) {
  const examples = new Set();
  const visit = (value, currentKey = '') => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      if (currentKey === fieldKey) {
        value.forEach(item => {
          if (typeof item === 'string' && item.trim()) examples.add(item.trim());
        });
      }
      value.forEach(item => visit(item));
      return;
    }
    Object.entries(value).forEach(([key, child]) => visit(child, key));
  };

  state.rawLevels.forEach(level => visit(level));
  return [...examples];
}

function findArrayItemNumberExamples(fieldKey) {
  const examples = new Set();
  const visit = (value, currentKey = '') => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      if (currentKey === fieldKey) {
        value.forEach(item => {
          if (typeof item === 'number' && Number.isFinite(item)) examples.add(item);
        });
      }
      value.forEach(item => visit(item));
      return;
    }
    Object.entries(value).forEach(([key, child]) => visit(child, key));
  };

  state.rawLevels.forEach(level => visit(level));
  return [...examples];
}

function addNumberValuesPicker(control, fieldKey, examples) {
  if (!examples.length || !(control instanceof HTMLInputElement)) return control;

  const picker = document.createElement('div');
  picker.className = 'editor-value-picker';
  const button = createValuePickerButton(fieldKey);

  const select = document.createElement('select');
  select.className = 'field-input editor-value-picker-select';
  select.hidden = true;
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose an existing value…';
  select.appendChild(placeholder);
  examples.forEach(example => {
    const option = document.createElement('option');
    option.value = String(example);
    option.textContent = String(example);
    select.appendChild(option);
  });

  configureValuePicker(button, select, fieldKey, control);

  picker.append(control, button, select);
  return picker;
}

function createBlankObjectTemplate(objectEditors) {
  const propertiesByEditor = objectEditors.map(editor =>
    Array.from(editor.querySelectorAll(':scope > .structured-entries > .object-entry'))
      .map(entry => ({
        key: entry.querySelector('.structured-key').value.trim(),
        editor: entry.querySelector('.structured-entry-value > .structured-value-editor'),
      }))
      .filter(property => property.key)
  );
  const keys = new Set(propertiesByEditor.flatMap(properties =>
    properties.map(property => property.key)
  ));

  const value = {};
  const types = {};
  [...keys].forEach(key => {
    const propertyEditors = propertiesByEditor
      .flat()
      .filter(property => property.key === key)
      .map(property => property.editor);
    const propertyType = getMostCommonArrayItemType(propertyEditors.map(editor => editor.dataset.valueType));
    types[key] = propertyType;
    if (propertyType === 'object') {
      const nested = createBlankObjectTemplate(propertyEditors.filter(editor => editor.dataset.valueType === 'object'));
      value[key] = nested.value;
      types[key] = { type: propertyType, properties: nested.types };
    } else if (propertyType === 'array') {
      value[key] = [];
      types[key] = { type: propertyType };
    } else {
      value[key] = propertyType === 'text' ? '' : null;
      types[key] = { type: propertyType };
    }
  });
  return { value, types };
}

function findArrayExamples(fieldKey) {
  const arrays = [];
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    Object.entries(value).forEach(([key, child]) => {
      if (key === fieldKey && Array.isArray(child)) arrays.push(child);
      visit(child);
    });
  };
  state.rawLevels.forEach(visit);
  return arrays;
}

function findObjectExamples(fieldKey) {
  const objects = [];
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    Object.entries(value).forEach(([key, child]) => {
      if (key === fieldKey && child && typeof child === 'object' && !Array.isArray(child)) {
        objects.push(child);
      }
      visit(child);
    });
  };
  state.rawLevels.forEach(visit);
  return objects;
}

function createBlankObjectValueTemplate(objects) {
  const keys = new Set(objects.flatMap(object => Object.keys(object)));
  const value = {};
  const types = {};
  [...keys].forEach(key => {
    const values = objects
      .filter(object => Object.prototype.hasOwnProperty.call(object, key))
      .map(object => object[key]);
    const type = inferExpectedFieldType(values);
    if (type === 'object') {
      const nested = createBlankObjectValueTemplate(values.filter(value =>
        value && typeof value === 'object' && !Array.isArray(value)
      ));
      value[key] = nested.value;
      types[key] = { type, properties: nested.types };
    } else if (type === 'array') {
      value[key] = [];
      types[key] = { type };
    } else {
      value[key] = type === 'text' ? '' : null;
      types[key] = { type };
    }
  });
  return { value, types };
}

function getMostCommonArrayItemType(types) {
  const counts = new Map();
  types.forEach(type => {
    counts.set(type, (counts.get(type) ?? 0) + 1);
  });
  return types.reduce((mostCommon, type) =>
    counts.get(type) > counts.get(mostCommon) ? type : mostCommon
  );
}

function getDefaultArrayItemTemplate(fieldKey) {
  const itemValues = findArrayExamples(fieldKey).flat();
  if (!itemValues.length) return null;

  const type = getMostCommonArrayItemType(itemValues.map(inferModalValueType));
  if (type === 'object') {
    const template = createBlankObjectValueTemplate(itemValues.filter(value =>
      value && typeof value === 'object' && !Array.isArray(value)
    ));
    return {
      ...template,
      type,
    };
  }
  if (type === 'array') return { value: [], type };
  if (type === 'boolean' || type === 'number' || type === 'null') {
    return { value: null, type };
  }
  return { value: '', type: 'text' };
}

function renumberArrayItems(entries) {
  Array.from(entries.children)
    .filter(entry => entry.classList.contains('array-entry'))
    .forEach((entry, index) => {
      const label = entry.querySelector(':scope > .structured-entry-header > .structured-item-label');
      if (label) label.textContent = `Item ${index + 1}`;
    });
}

function updateModalFieldCount() {
  const fields = document.getElementById('modal-fields');
  const count = document.getElementById('modal-field-count');
  if (!fields || !count) return;
  const fieldCount = fields.children.length;
  count.textContent = `${fieldCount} field${fieldCount === 1 ? '' : 's'}`;
}

function formatFieldLabel(key) {
  const label = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  const aliases = { id: 'ID', tps: 'TPS', url: 'URL' };
  return label.split(/\s+/).map(word => aliases[word.toLowerCase()] || word[0].toUpperCase() + word.slice(1)).join(' ');
}

function createValueTypeSelect(value, onChange, valueType = inferModalValueType(value)) {
  const select = document.createElement('select');
  select.className = 'editor-field-type';
  MODAL_VALUE_TYPES.forEach(type => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type === 'object' ? 'Object' : type === 'array' ? 'Array' : type;
    select.appendChild(option);
  });
  select.value = valueType;
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

function makeFieldControl(type, value, fieldKey) {
  if (type === 'null') {
    const note = document.createElement('div');
    note.className = 'editor-null-value';
    note.textContent = 'null';
    return note;
  }
  if (type === 'boolean') {
    const select = document.createElement('select');
    select.className = 'field-input';
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = '—';
    select.appendChild(emptyOption);
    [['true', 'True'], ['false', 'False']].forEach(([optionValue, label]) => {
      const option = document.createElement('option');
      option.value = optionValue;
      option.textContent = label;
      select.appendChild(option);
    });
    select.value = value === true ? 'true' : value === false ? 'false' : '';
    return select;
  }

  const useTextarea = type === 'text' && typeof value === 'string' && /[\r\n]/.test(value);
  const control = useTextarea ? document.createElement('textarea') : document.createElement('input');
  const examples = type === 'text' && fieldKey ? findTextExamples(fieldKey) : [];
  const numberExamples = type === 'number' && fieldKey ? findNumberExamples(fieldKey) : [];
  control.className = useTextarea ? 'field-input field-textarea editor-string-value' : 'field-input';
  if (type === 'number') {
    control.type = 'number';
    control.step = 'any';
    control.value = typeof value === 'number' ? String(value) : '';
    setRandomNumberPlaceholder(control, numberExamples);
  } else {
    control.type = 'text';
    control.value = typeof value === 'string' ? value : '';
    if (examples.length) {
      const example = examples[Math.floor(Math.random() * examples.length)];
      control.placeholder = `e.g. ${example.length > 80 ? `${example.slice(0, 77)}…` : example}`;
    }
  }
  if (examples.length) return addExistingValuesPicker(control, fieldKey, examples);
  return numberExamples.length ? addNumberValuesPicker(control, fieldKey, numberExamples) : control;
}

function getStructuredEditorPath(rootEditor, targetEditor) {
  const path = [];
  let currentEditor = targetEditor;
  while (currentEditor && currentEditor !== rootEditor) {
    const entry = currentEditor.parentElement?.parentElement;
    if (!entry?.classList.contains('structured-entry')) return null;

    if (entry.classList.contains('object-entry')) {
      const key = entry.querySelector(':scope > .structured-entry-header > .structured-key')?.value.trim();
      if (!key) return null;
      path.push({ type: 'property', key });
    } else if (entry.classList.contains('array-entry')) {
      path.push({ type: 'item' });
    } else {
      return null;
    }
    currentEditor = entry.parentElement?.parentElement;
  }
  return currentEditor === rootEditor ? path.reverse() : null;
}

function resolveStructuredEditors(rootEditor, path) {
  let editors = [rootEditor];
  path.forEach(part => {
    editors = editors.flatMap(editor => {
      const entries = editor.querySelector(':scope > .structured-entries');
      if (!entries) return [];

      if (part.type === 'item') {
        return Array.from(entries.children)
          .filter(entry => entry.classList.contains('array-entry'))
          .map(entry => entry.querySelector(':scope > .structured-entry-value > .structured-value-editor'))
          .filter(Boolean);
      }

      const propertyEntry = Array.from(entries.children).find(entry =>
        entry.classList.contains('object-entry')
        && entry.querySelector(':scope > .structured-entry-header > .structured-key')?.value.trim() === part.key
      );
      const childEditor = propertyEntry?.querySelector(':scope > .structured-entry-value > .structured-value-editor');
      return childEditor ? [childEditor] : [];
    });
  });
  return editors;
}

function resolveStructuredValues(rootValue, path) {
  let values = [rootValue];
  path.forEach(part => {
    values = values.flatMap(value => {
      if (part.type === 'item') return Array.isArray(value) ? value : [];
      return value && typeof value === 'object' && !Array.isArray(value)
        && Object.prototype.hasOwnProperty.call(value, part.key)
        ? [value[part.key]]
        : [];
    });
  });
  return values;
}

function addPropertiesToObject(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  let added = 0;
  keys.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(value, key)) return;
    Object.defineProperty(value, key, {
      value: '',
      enumerable: true,
      configurable: true,
      writable: true,
    });
    added++;
  });
  return added;
}

function createStructuredValueEditor(value, type = inferModalValueType(value), fieldKey = '', arrayItem = false, typeHints = null) {
  const editor = document.createElement('div');
  editor.className = 'structured-value-editor';
  editor.dataset.valueType = type;

  if (type === 'object') {
    const sourceObject = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const hasObjectProperties = Object.keys(sourceObject).length > 0;
    const exampleObjects = arrayItem
      ? findArrayExamples(fieldKey).flat().filter(item =>
        item && typeof item === 'object' && !Array.isArray(item)
      )
      : findObjectExamples(fieldKey);
    const expectedTemplate = !hasObjectProperties && !typeHints && exampleObjects.length
      ? createBlankObjectValueTemplate(exampleObjects)
      : null;
    const objectValue = expectedTemplate?.value ?? sourceObject;
    const objectTypeHints = expectedTemplate?.types ?? typeHints;
    const entries = document.createElement('div');
    entries.className = 'structured-entries';
    Object.entries(objectValue)
      .forEach(([key, childValue]) => {
        const childHint = objectTypeHints?.[key];
        entries.appendChild(createStructuredEntry(
          key,
          childValue,
          fieldKey,
          childHint?.type,
          childHint?.properties,
        ));
      });

    const add = document.createElement('div');
    add.className = 'structured-add-entry';
    const keyInput = document.createElement('input');
    keyInput.className = 'field-input';
    keyInput.type = 'text';
    keyInput.placeholder = 'Property name';
    keyInput.setAttribute('aria-label', 'Property name');
    const addButton = document.createElement('button');
    addButton.className = 'btn btn-xs';
    addButton.type = 'button';
    addButton.textContent = '＋ Property';
    const hasProperty = (objectEntries, key) => Array.from(objectEntries.children).some(entry =>
      entry.classList.contains('object-entry')
      && entry.querySelector('.structured-key').value.trim() === key
    );
    const addProperty = (objectEditor, key) => {
      const objectEntries = objectEditor.querySelector(':scope > .structured-entries');
      if (!objectEntries || hasProperty(objectEntries, key)) return false;
      objectEntries.appendChild(createStructuredEntry(key, '', fieldKey));
      return true;
    };
    addButton.addEventListener('click', () => {
      const key = keyInput.value.trim();
      if (!key) {
        keyInput.focus();
        return;
      }
      if (!addProperty(editor, key)) {
        showToast(`"${key}" is already in this object.`, 'danger');
        return;
      }
      keyInput.value = '';
    });
    keyInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addButton.click();
      }
    });
    add.append(keyInput, addButton);

    const bulkAdd = document.createElement('details');
    bulkAdd.className = 'structured-bulk-add';
    const bulkSummary = document.createElement('summary');
    bulkSummary.textContent = 'Bulk properties';
    const bulkHint = document.createElement('small');
    bulkHint.className = 'structured-bulk-add-hint';
    bulkHint.textContent = 'Adds properties to matching object items in this array across all levels.';
    const bulkInput = document.createElement('textarea');
    bulkInput.className = 'field-input field-textarea';
    bulkInput.rows = 3;
    bulkInput.placeholder = 'Enter one property name per line';
    bulkInput.setAttribute('aria-label', 'Property names to add, one per line');
    const bulkButton = document.createElement('button');
    bulkButton.className = 'btn btn-xs';
    bulkButton.type = 'button';
    bulkButton.textContent = '＋ Apply properties';
    bulkButton.addEventListener('click', () => {
      const keys = [...new Set(bulkInput.value
        .split(/\r?\n/)
        .map(key => key.trim())
        .filter(Boolean))];
      if (!keys.length) {
        bulkInput.focus();
        showToast('Enter one or more property names first.', 'danger');
        return;
      }

      const fieldRow = editor.closest('.editor-field');
      const fieldKey = fieldRow?.dataset.fieldKey;
      const rootEditor = fieldRow?.querySelector(':scope > .editor-field-value > .structured-value-editor');
      const path = rootEditor && getStructuredEditorPath(rootEditor, editor);
      if (!fieldKey || !rootEditor || !path || !path.some(part => part.type === 'item')) {
        showToast('Bulk apply is only available for object items inside an array.', 'danger');
        return;
      }

      const objectEditors = resolveStructuredEditors(rootEditor, path)
        .filter(objectEditor => objectEditor?.dataset.valueType === 'object');
      let added = 0;
      objectEditors.forEach(objectEditor => {
        keys.forEach(key => {
          if (addProperty(objectEditor, key)) added++;
        });
      });

      let updatedLevels = 0;
      let otherLevelAdded = 0;
      let otherLevelTargets = 0;
      state.rawLevels.forEach(level => {
        if (level._id === state.modalLevelId) return;
        const targets = resolveStructuredValues(level[fieldKey], path)
          .filter(value => value && typeof value === 'object' && !Array.isArray(value));
        if (!targets.length) return;
        otherLevelTargets += targets.length;
        let levelAdded = 0;
        targets.forEach(target => {
          levelAdded += addPropertiesToObject(target, keys);
        });
        if (levelAdded) {
          updatedLevels++;
          otherLevelAdded += levelAdded;
        }
      });
      if (otherLevelAdded) {
        saveSession();
        document.dispatchEvent(new CustomEvent('dl:render'));
      }

      const alreadyPresent = keys.length * (objectEditors.length + otherLevelTargets) - added - otherLevelAdded;
      bulkInput.value = '';
      if (added + otherLevelAdded === 0) {
        showToast('Those properties already exist, or no matching object items were found.', 'danger');
      } else {
        const details = [];
        if (alreadyPresent) details.push(`${alreadyPresent} already present`);
        if (updatedLevels) details.push(`updated ${updatedLevels} other level${updatedLevels === 1 ? '' : 's'}`);
        showToast(`Added ${added + otherLevelAdded} propert${added + otherLevelAdded === 1 ? 'y' : 'ies'}${details.length ? `; ${details.join(', ')}` : ''}.`);
      }
    });
    bulkAdd.append(bulkSummary, bulkHint, bulkInput, bulkButton);

    editor.append(entries, add);
    editor.appendChild(bulkAdd);
    return editor;
  }

  if (type === 'array') {
    const entries = document.createElement('div');
    entries.className = 'structured-entries';
    (Array.isArray(value) ? value : []).forEach(childValue => {
      entries.appendChild(createStructuredEntry(null, childValue, fieldKey));
    });
    renumberArrayItems(entries);
    const getNewItemTemplate = () => {
      const defaultTemplate = getDefaultArrayItemTemplate(fieldKey);
      if (defaultTemplate) return defaultTemplate;

      const itemEditors = Array.from(entries.querySelectorAll(':scope > .array-entry .structured-entry-value > .structured-value-editor'));
      if (!itemEditors.length) return { value: null, type: 'null' };

      const itemType = getMostCommonArrayItemType(itemEditors.map(itemEditor => itemEditor.dataset.valueType));

      if (itemType === 'object') {
        const objectEditors = itemEditors.filter(itemEditor => itemEditor.dataset.valueType === 'object');
        const template = createBlankObjectTemplate(objectEditors);
        return { ...template, type: 'object' };
      }
      if (itemType === 'array') return { value: [], type: 'array' };
      if (itemType === 'boolean') return { value: false, type: 'boolean' };
      if (itemType === 'number') return { value: null, type: 'number' };
      if (itemType === 'null') return { value: null, type: 'null' };
      return { value: '', type: 'text' };
    };
    const addButton = document.createElement('button');
    addButton.className = 'btn btn-xs';
    addButton.type = 'button';
    addButton.textContent = '＋ Item';
    addButton.addEventListener('click', () => {
      const newItem = getNewItemTemplate();
      entries.appendChild(createStructuredEntry(null, newItem.value, fieldKey, newItem.type, newItem.types));
      renumberArrayItems(entries);
    });
    editor.append(entries, addButton);
    return editor;
  }

  if (arrayItem && (type === 'text' || type === 'number')) {
    const control = makeFieldControl(type, value, '');
    const examples = type === 'text'
      ? findArrayItemTextExamples(fieldKey)
      : findArrayItemNumberExamples(fieldKey);
    if (type === 'number') setRandomNumberPlaceholder(control, examples);
    editor.appendChild(type === 'text' && examples.length
      ? addExistingValuesPicker(control, fieldKey, examples)
      : type === 'number' && examples.length
        ? addNumberValuesPicker(control, fieldKey, examples)
        : control);
  } else {
    editor.appendChild(makeFieldControl(type, value, fieldKey));
  }
  return editor;
}

function createStructuredEntry(key, value, parentFieldKey = '', valueType = inferModalValueType(value), typeHints = null) {
  const entry = document.createElement('div');
  entry.className = key === null ? 'structured-entry array-entry' : 'structured-entry object-entry';
  if (key !== null) entry.dataset.propertyKey = key;

  const header = document.createElement('div');
  header.className = 'structured-entry-header';
  if (key === null) {
    header.classList.add('structured-entry-header--array-item');
    const label = document.createElement('span');
    label.className = 'structured-item-label';
    label.textContent = 'Item';
    header.appendChild(label);
  } else {
    const keyInput = document.createElement('input');
    keyInput.className = 'field-input structured-key';
    keyInput.type = 'text';
    keyInput.value = key;
    keyInput.setAttribute('aria-label', 'Property name');
    header.appendChild(keyInput);
  }

  const valueHost = document.createElement('div');
  valueHost.className = 'structured-entry-value';
  const typeSelect = createValueTypeSelect(value, type => {
    entry.classList.toggle('structured-entry--structured', isStructuredValueType(type));
    valueHost.replaceChildren(createStructuredValueEditor(null, type, key ?? parentFieldKey, key === null));
  }, valueType);
  if (isStructuredValueType(valueType)) {
    entry.classList.add('structured-entry--structured');
  }
  header.appendChild(typeSelect);

  if (key === null) {
    const duplicateButton = document.createElement('button');
    duplicateButton.className = 'editor-duplicate-button';
    duplicateButton.type = 'button';
    duplicateButton.textContent = '⧉';
    duplicateButton.title = 'Duplicate item';
    duplicateButton.setAttribute('aria-label', 'Duplicate array item');
    duplicateButton.addEventListener('click', () => {
      try {
        const currentValue = readStructuredValue(
          valueHost.querySelector(':scope > .structured-value-editor')
        );
        entry.insertAdjacentElement('afterend', createStructuredEntry(null, currentValue, parentFieldKey));
        renumberArrayItems(entry.parentElement);
      } catch (error) {
        showToast(`Can't duplicate this item: ${error.message}`, 'danger');
      }
    });
    header.appendChild(duplicateButton);
  }

  const removeButton = document.createElement('button');
  removeButton.className = 'editor-remove-button';
  removeButton.type = 'button';
  removeButton.textContent = '×';
  removeButton.title = key === null ? 'Remove item' : `Remove ${key}`;
  removeButton.setAttribute('aria-label', removeButton.title);
  removeButton.addEventListener('click', () => {
    const entries = entry.parentElement;
    entry.remove();
    if (key === null && entries) renumberArrayItems(entries);
  });
  header.appendChild(removeButton);

  valueHost.appendChild(createStructuredValueEditor(
    value,
    valueType,
    key ?? parentFieldKey,
    key === null,
    typeHints,
  ));
  entry.append(header, valueHost);
  return entry;
}

function setModalFieldControl(row, type, value) {
  row.dataset.valueType = type;
  row.classList.toggle('editor-field--structured', isStructuredValueType(type));
  row.classList.toggle('editor-field--wide', isStructuredValueType(type)
    || ['name', 'creators', 'ratio', 'victors'].includes(row.dataset.fieldKey));
  const host = row.querySelector('.editor-field-value');
  host.replaceChildren();
  host.appendChild(createStructuredValueEditor(value, type, row.dataset.fieldKey));
}

function createModalField(key, value, valueType = inferModalValueType(value)) {
  const row = document.createElement('div');
  const isStructured = valueType === 'object' || valueType === 'array';
  const isWide = isStructured || ['name', 'creators', 'ratio', 'victors'].includes(key);
  row.className = `editor-field${isStructured ? ' editor-field--structured' : ''}${isWide ? ' editor-field--wide' : ''}`;
  row.dataset.fieldKey = key;

  const heading = document.createElement('div');
  heading.className = 'editor-field-heading';
  const fieldName = document.createElement('div');
  fieldName.className = 'editor-field-name';
  const label = document.createElement('label');
  label.className = 'field-label';
  label.textContent = formatFieldLabel(key);
  label.title = key;
  const jsonKey = document.createElement('small');
  jsonKey.className = 'editor-json-key';
  jsonKey.textContent = key;
  jsonKey.hidden = state.settings.showJsonFieldNames === false;
  fieldName.append(label, jsonKey);
  const typeSelect = createValueTypeSelect(
    value,
    type => setModalFieldControl(row, type, null),
    valueType,
  );
  typeSelect.setAttribute('aria-label', `${key} value type`);
  typeSelect.title = `Value type: ${key}`;
  const remove = document.createElement('button');
  remove.className = 'editor-remove-button';
  remove.type = 'button';
  remove.textContent = '×';
  remove.title = `Remove ${formatFieldLabel(key)} field`;
  remove.setAttribute('aria-label', `Remove ${key}`);
  remove.addEventListener('click', () => {
    row.remove();
    updateModalFieldCount();
  });
  heading.append(fieldName, typeSelect, remove);

  const host = document.createElement('div');
  host.className = 'editor-field-value';
  row.append(heading, host);

  setModalFieldControl(row, valueType, value);
  return row;
}

function renderModalFields(level, valueTypes = {}) {
  const container = document.getElementById('modal-fields');
  if (!container) return;
  container.replaceChildren();
  Object.entries(level)
    .filter(([key]) => !isManagedField(key))
    .forEach(([key, value]) => {
      const valueType = valueTypes[key] ?? (
        isEmptyFieldValue(value) ? getExpectedFieldType(key, level) : inferModalValueType(value)
      );
      container.appendChild(createModalField(key, value, valueType));
    });
  updateModalFieldCount();
}

export function addModalField() {
  const nameInput = document.getElementById('modal-new-field-name');
  const names = [...new Set((nameInput?.value ?? '')
    .split(/\r?\n/)
    .map(name => name.trim())
    .filter(Boolean))];
  if (names.length === 0) {
    nameInput?.focus();
    return;
  }
  const reserved = names.find(isManagedField);
  if (reserved) {
    showToast(`"${reserved}" is reserved by the editor.`, 'danger');
    return;
  }

  const container = document.getElementById('modal-fields');
  const existingNames = new Set(Array.from(container.querySelectorAll('.editor-field'))
    .map(row => row.dataset.fieldKey));
  const fieldsToAdd = names.filter(name => !existingNames.has(name));
  if (fieldsToAdd.length === 0) {
    showToast('Those fields are already in this record.', 'gold');
    nameInput?.focus();
    return;
  }

  fieldsToAdd.forEach(name => {
    const expectedType = inferExpectedFieldType(
      state.rawLevels.filter(level => Object.prototype.hasOwnProperty.call(level, name)).map(level => level[name])
    );
    container.appendChild(createModalField(name, createBlankValue(expectedType), expectedType));
  });
  updateModalFieldCount();
  nameInput.value = '';
  container.lastElementChild?.querySelector('.structured-value-editor input, .structured-value-editor textarea, .structured-value-editor select')?.focus();
  if (fieldsToAdd.length > 1 || fieldsToAdd.length < names.length) {
    const skipped = names.length - fieldsToAdd.length;
    showToast(`Added ${fieldsToAdd.length} field(s)${skipped ? `; skipped ${skipped} already in this record` : ''}.`);
  }
}

function getBulkFieldNames() {
  const input = document.getElementById('bulk-fields-input');
  const names = [...new Set((input?.value ?? '')
    .split(/\r?\n/)
    .map(name => name.trim())
    .filter(Boolean))];
  if (names.length === 0) {
    showToast('Enter one or more field names first.', 'danger');
    input?.focus();
    return null;
  }

  const reserved = names.find(isManagedField);
  if (reserved) {
    showToast(`"${reserved}" is reserved by the editor and cannot be changed here.`, 'danger');
    return null;
  }
  return names;
}

export function openBulkFieldsModal() {
  const input = document.getElementById('bulk-fields-input');
  if (input) input.value = '';
  const renameFrom = document.getElementById('bulk-field-rename-from');
  const renameTo = document.getElementById('bulk-field-rename-to');
  if (renameFrom) renameFrom.value = '';
  if (renameTo) renameTo.value = '';
  document.getElementById('bulk-fields-modal')?.classList.add('active');
  input?.focus();
}

export function closeBulkFieldsModal() {
  document.getElementById('bulk-fields-modal')?.classList.remove('active');
}

export function addBulkFields() {
  const names = getBulkFieldNames();
  if (!names) return;
  if (state.rawLevels.length === 0) {
    showToast('Load levels before adding fields.', 'danger');
    return;
  }

  const levelsChanged = new Set();
  let valuesAdded = 0;
  state.rawLevels.forEach(level => {
    names.forEach(name => {
      if (Object.prototype.hasOwnProperty.call(level, name)) return;
      Object.defineProperty(level, name, {
        value: '',
        enumerable: true,
        configurable: true,
        writable: true,
      });
      valuesAdded++;
      levelsChanged.add(level);
    });
  });

  if (valuesAdded === 0) {
    showToast('Those fields already exist on every level.', 'gold');
    return;
  }
  detectColumnsFromLevels();
  saveSession();
  document.dispatchEvent(new CustomEvent('dl:render'));
  showToast(`Added ${valuesAdded} blank field value(s) across ${levelsChanged.size} level(s).`);
}

export function removeBulkFields() {
  const names = getBulkFieldNames();
  if (!names) return;
  if (names.includes('name')) {
    showToast('"name" is required and cannot be removed.', 'danger');
    return;
  }

  if (!confirm(`Remove ${names.length} field(s) and all their values from every level?`)) return;

  let valuesRemoved = 0;
  state.rawLevels.forEach(level => {
    names.forEach(name => {
      if (Object.prototype.hasOwnProperty.call(level, name)) {
        delete level[name];
        valuesRemoved++;
      }
    });
  });

  if (valuesRemoved === 0) {
    showToast('None of those fields were found.', 'gold');
    return;
  }
  names.forEach(name => removeDetectedColumn(name));
  state.hiddenColumns = state.hiddenColumns.filter(column => !names.includes(column));
  state.dynamicFields = state.dynamicFields.filter(field => !names.includes(field.id));

  detectColumnsFromLevels();
  saveSession();
  document.dispatchEvent(new CustomEvent('dl:render'));
  showToast(`Removed ${valuesRemoved} field value(s) from the levels.`);
}

export function renameBulkField() {
  const fromInput = document.getElementById('bulk-field-rename-from');
  const toInput = document.getElementById('bulk-field-rename-to');
  const from = fromInput?.value.trim() ?? '';
  const to = toInput?.value.trim() ?? '';
  if (!from || !to) {
    showToast('Enter both the current and new field names.', 'danger');
    (!from ? fromInput : toInput)?.focus();
    return;
  }
  if (from === to) {
    showToast('The new field name must be different.', 'danger');
    toInput?.focus();
    return;
  }
  if (isManagedField(from) || isManagedField(to) || FIELD_ID_SET.has(from) || FIELD_ID_SET.has(to)) {
    showToast('That field name is reserved by the editor and cannot be renamed.', 'danger');
    return;
  }

  const sourceExists = state.rawLevels.some(level =>
    Object.prototype.hasOwnProperty.call(level, from)
  );
  if (!sourceExists) {
    showToast(`Field "${from}" was not found on any level.`, 'danger');
    fromInput?.focus();
    return;
  }
  const targetExists = state.rawLevels.some(level =>
    Object.prototype.hasOwnProperty.call(level, to)
  );
  if (targetExists) {
    showToast(`Cannot rename to "${to}" because that field already exists on a level.`, 'danger');
    toInput?.focus();
    return;
  }

  const wasHidden = state.hiddenColumns.includes(from);
  state.rawLevels.forEach(level => {
    if (!Object.prototype.hasOwnProperty.call(level, from)) return;
    Object.defineProperty(level, to, {
      value: level[from],
      enumerable: true,
      configurable: true,
      writable: true,
    });
    delete level[from];
  });

  removeDetectedColumn(from);
  addDetectedColumn(to);
  state.hiddenColumns = state.hiddenColumns.filter(column => column !== from && column !== to);
  if (wasHidden) state.hiddenColumns.push(to);
  state.dynamicFields = state.dynamicFields.map(field =>
    field.id === from
      ? {
          ...field,
          id: to,
          label: to.replace(/\./g, ' › ').replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim(),
        }
      : field
  );

  detectColumnsFromLevels();
  saveSession();
  document.dispatchEvent(new CustomEvent('dl:render'));
  showToast(`Renamed "${from}" to "${to}" across the levels.`);
}

function readModalFieldValue(row) {
  const key = row.dataset.fieldKey;
  const type = row.dataset.valueType;
  const editor = row.querySelector('.editor-field-value > .structured-value-editor');
  try {
    return readStructuredValue(editor, type);
  } catch (error) {
    throw new Error(`"${key}": ${error.message}`);
  }
}

function readStructuredValue(editor, type = editor.dataset.valueType) {
  if (type === 'null') return null;
  if (type === 'object') {
    const result = {};
    editor.querySelectorAll(':scope > .structured-entries > .object-entry').forEach(entry => {
      const key = entry.querySelector('.structured-key').value.trim();
      if (!key) throw new Error('object property names cannot be blank.');
      if (Object.prototype.hasOwnProperty.call(result, key)) {
        throw new Error(`object property "${key}" is duplicated.`);
      }
      Object.defineProperty(result, key, {
        value: readStructuredValue(entry.querySelector('.structured-entry-value > .structured-value-editor')),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    });
    return result;
  }
  if (type === 'array') {
    return Array.from(editor.querySelectorAll(':scope > .structured-entries > .array-entry'))
      .map(entry => readStructuredValue(entry.querySelector('.structured-entry-value > .structured-value-editor')));
  }

  const input = editor.querySelector(':scope > input, :scope > textarea, :scope > select, :scope > .editor-value-picker > input, :scope > .editor-value-picker > textarea');
  if (type === 'boolean') return input.value === '' ? null : input.value === 'true';
  if (type === 'number') {
    if (input.value.trim() === '') return null;
    const value = Number(input.value);
    if (!Number.isFinite(value)) throw new Error('number must be valid.');
    return value;
  }
  return input.value === '' ? null : input.value;
}

export function closeModal() {
  document.getElementById('level-modal').classList.remove('active');
  state.modalMode = null;
  state.modalLevelId = null;
}

export function submitModal() {
  let data;
  try {
    data = Object.fromEntries(
      Array.from(document.querySelectorAll('#modal-fields .editor-field')).map(row => [
        row.dataset.fieldKey,
        readModalFieldValue(row),
      ])
    );
  } catch (error) {
    showToast(error.message, 'danger');
    return;
  }

  const name = String(data.name ?? '').trim();
  const nameInput = document.querySelector('#modal-fields [data-field-key="name"] .structured-value-editor input, #modal-fields [data-field-key="name"] .structured-value-editor textarea, #modal-fields [data-field-key="name"] .structured-value-editor select');
  if (!name) {
    nameInput?.classList.add('error');
    nameInput?.focus();
    setTimeout(() => nameInput?.classList.remove('error'), 600);
    return;
  }
  data.name = name;

  const duplicate = findDuplicateLevel(
    { ...data, _id: state.modalLevelId ?? undefined },
    state.rawLevels.filter(l => l._id !== state.modalLevelId)
  );

  if (duplicate) {
    showToast(`A level with the same name already exists: "${duplicate.name || name}".`, 'danger');
    return;
  }

  const editingLevel = state.modalMode === 'edit' && state.modalLevelId
    ? state.levelMap.get(state.modalLevelId)
    : null;
  const currentRankedIdx = editingLevel
    ? state.rankedList.findIndex(item => item._id === editingLevel._id)
    : -1;
  const rankChanged = editingLevel
    && Object.prototype.hasOwnProperty.call(data, 'rank')
    && data.rank !== editingLevel.rank;
  if (
    rankChanged
    && currentRankedIdx !== -1
    && !isRankedVariant(editingLevel)
    && data.rank !== null
    && (!Number.isInteger(data.rank) || data.rank < 1 || data.rank > state.rankedList.length)
  ) {
    showToast(`Rank must be a whole number between 1 and ${state.rankedList.length}.`, 'danger');
    return;
  }

  if (state.modalMode === 'edit' && state.modalLevelId) {
    const level = state.levelMap.get(state.modalLevelId);
    if (level) {
      const wasRanked = state.rankedList.some(item => item._id === level._id);
      state.modalOriginalKeys.forEach(key => delete level[key]);
      Object.entries(data).forEach(([key, value]) => {
        Object.defineProperty(level, key, {
          value,
          enumerable: true,
          configurable: true,
          writable: true,
        });
      });
      level.lastEdited = new Date().toISOString();
      const rankedIdx = state.rankedList.findIndex(item => item._id === level._id);
      if (isRankedVariant(level)) {
        if (rankedIdx !== -1) state.rankedList.splice(rankedIdx, 1);
        level.pending = false;
        state.pendingLevels = state.pendingLevels.filter(item => item._id !== level._id);
      } else if (!wasRanked && !level.pending) {
        state.rankedList.push(level);
      }
      detectColumnsFromLevels();
      if (
        rankChanged
        && rankedIdx !== -1
        && !isRankedVariant(level)
        && Number.isInteger(level.rank)
      ) {
        moveToPosition(rankedIdx, level.rank - 1);
      } else {
        saveSession();
        document.dispatchEvent(new CustomEvent('dl:render'));
      }
      showToast(`"${name}" updated`);
    }
  } else if (state.modalMode === 'add') {
    const statusEl = document.querySelector('input[name="modal-status"]:checked');
    const status = statusEl ? statusEl.value : 'pending';
    const _id = makeLevelId(data, state.rawLevels.length);
    const level = { ...data, _id, pending: true, customValues: {} };
    state.rawLevels.push(level);
    state.levelMap.set(_id, level);
    detectColumnsFromLevels();

    if (isRankedVariant(level)) {
      level.pending = false;
      saveSession();
      document.dispatchEvent(new CustomEvent('dl:render'));
      showToast(`"${name}" added as a rankless variant`);
      closeModal();
      return;
    }

    if (status === 'ranked') {
      level.pending = false;
      state.rankedList.push(level);
      saveSession();
      document.dispatchEvent(new CustomEvent('dl:render'));
      showToast(`"${name}" added to ranked list`);
    } else if (status === 'immediate') {
      state.pendingLevels.push(level);
      saveSession();
      document.dispatchEvent(new CustomEvent('dl:render'));
      showToast(`"${name}" added — starting placement`);
      closeModal();
      startInsertion(level);
      return;
    } else {
      state.pendingLevels.push(level);
      saveSession();
      document.dispatchEvent(new CustomEvent('dl:render'));
      showToast(`"${name}" added to pending`);
    }
  }

  closeModal();
}

export function openSettingsModal() {
  document.getElementById('confirm-delete').checked = state.settings.confirmDelete;
  document.getElementById('confirm-reset').checked = state.settings.confirmReset;
  document.getElementById('confirm-import-overwrite').checked = state.settings.confirmImportOverwrite;
  document.getElementById('enable-drag-drop').checked = state.settings.enableDragDrop;
  document.getElementById('show-json-field-names').checked = state.settings.showJsonFieldNames !== false;
  document.getElementById('show-ranking-thumbnails').checked = state.settings.showRankingThumbnails !== false;
  document.getElementById('expand-ranking-details').checked = state.settings.expandRankingDetails === true;
  document.getElementById('existing-import-behavior').value = state.settings.existingImportBehavior || 'ask';
  document.getElementById('include-pending-in-export').checked = state.settings.includePendingInExport === true;

  document.querySelectorAll('input[name="default-new-status"]').forEach(radio => {
    radio.checked = radio.value === state.settings.defaultNewStatus;
  });

  document.getElementById('settings-modal').classList.add('active');
  setTimeout(() => document.querySelector('#settings-modal input')?.focus(), 50);
}

export function closeSettingsModal() {
  document.getElementById('settings-modal').classList.remove('active');
}

export function saveSettingsModal() {
  const expandRankingDetails = document.getElementById('expand-ranking-details').checked;
  state.resetRankingDetailsToDefault = state.settings.expandRankingDetails !== expandRankingDetails;
  state.settings.confirmDelete = document.getElementById('confirm-delete').checked;
  state.settings.confirmReset = document.getElementById('confirm-reset').checked;
  state.settings.confirmImportOverwrite = document.getElementById('confirm-import-overwrite').checked;
  state.settings.enableDragDrop = document.getElementById('enable-drag-drop').checked;
  state.settings.showJsonFieldNames = document.getElementById('show-json-field-names').checked;
  state.settings.showRankingThumbnails = document.getElementById('show-ranking-thumbnails').checked;
  state.settings.expandRankingDetails = expandRankingDetails;
  state.settings.existingImportBehavior = document.getElementById('existing-import-behavior').value;
  state.settings.includePendingInExport = document.getElementById('include-pending-in-export').checked;
  state.settings.defaultNewStatus = document.querySelector('input[name="default-new-status"]:checked')?.value || 'pending';

  document.querySelectorAll('.editor-json-key').forEach(key => {
    key.hidden = !state.settings.showJsonFieldNames;
  });
  saveSettings();
  closeSettingsModal();
  document.dispatchEvent(new CustomEvent('dl:render'));
  showToast('Settings saved');
}

export function openCustomValuesModal() {
  renderCustomValuesList();
  document.getElementById('custom-values-modal').classList.add('active');
  setTimeout(() => document.getElementById('new-custom-value-name')?.focus(), 50);
}

export function closeCustomValuesModal() {
  document.getElementById('custom-values-modal').classList.remove('active');
}

export function renderCustomValuesList() {
  const listEl = document.getElementById('custom-values-list');
  if (!listEl) return;

  const builtinTemplates = [
    { id: 'rank', label: 'Rank' },
    { id: 'tags', label: 'Tags' },
  ];

  const templateHtml = `
    <div class="custom-values-section">
      <div class="custom-values-templates">
        <div class="custom-values-templates-header">Field templates</div>
        <div class="custom-values-templates-list">
          ${builtinTemplates.map(template => `
            <button type="button" class="btn btn-secondary template-btn" data-template-id="${template.id}" ${hasColumn(template.id) ? 'disabled' : ''}>
              ${escHtml(template.label)} ${hasColumn(template.id) ? '✓' : 'Add'}
            </button>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  if (state.customValues.length === 0) {
    listEl.innerHTML = `${templateHtml}<p class="no-custom-values">No custom fields defined yet.</p>`;
  } else {
    listEl.innerHTML = `${templateHtml}${state.customValues.map(value => `
      <div class="custom-value-item">
        <div class="custom-value-meta">
          <span class="custom-value-name">${escHtml(value.name)}</span>
          <span class="custom-value-type">${escHtml(value.type)}</span>
          ${value.type === 'enum' ? `<span class="custom-value-options">(${escHtml(value.options.join(', '))})</span>` : ''}
        </div>
        <div class="custom-value-controls">
          <label><input type="checkbox" class="custom-value-toggle" data-value-id="${value.id}" data-prop="filterable" ${value.filterable ? 'checked' : ''}>Filter</label>
          <label><input type="checkbox" class="custom-value-toggle" data-value-id="${value.id}" data-prop="sortable" ${value.sortable ? 'checked' : ''}>Sort</label>
          <label><input type="checkbox" class="custom-value-toggle" data-value-id="${value.id}" data-prop="exportable" ${value.exportable ? 'checked' : ''}>Export</label>
          <button class="custom-value-remove" data-value-id="${value.id}" title="Remove ${escHtml(value.name)}">×</button>
        </div>
      </div>
    `).join('')}`;
  }

  listEl.querySelectorAll('.template-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const templateId = btn.dataset.templateId;
      if (!templateId || hasColumn(templateId)) return;
      addDetectedColumn(templateId);
      saveSession();
      document.dispatchEvent(new CustomEvent('dl:render'));
      renderCustomValuesList();
      showToast(`${templateId.charAt(0).toUpperCase() + templateId.slice(1)} field added`);
    });
  });

  listEl.querySelectorAll('.custom-value-toggle').forEach(input => {
    input.addEventListener('change', () => {
      const valueId = input.dataset.valueId;
      const prop = input.dataset.prop;
      updateCustomValue(valueId, { [prop]: input.checked });
      saveSession();
      document.dispatchEvent(new CustomEvent('dl:render'));
    });
  });

  listEl.querySelectorAll('.custom-value-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const valueId = btn.dataset.valueId;
      const valueName = state.customValues.find(v => v.id === valueId)?.name ?? valueId;
      if (confirm(`Remove custom field "${valueName}"? This deletes all data for this field from all levels.`)) {
        removeCustomValue(valueId);
        saveSession();
        renderCustomValuesList();
        document.dispatchEvent(new CustomEvent('dl:render'));
        showToast('Custom field removed');
      }
    });
  });
}

export function addCustomValueFromModal() {
  const nameInput = document.getElementById('new-custom-value-name');
  const typeSelect = document.getElementById('new-custom-value-type');
  const optionsInput = document.getElementById('new-custom-value-options');
  const filterableInput = document.getElementById('new-custom-value-filterable');
  const sortableInput = document.getElementById('new-custom-value-sortable');
  const exportableInput = document.getElementById('new-custom-value-exportable');
  const name = nameInput?.value.trim() ?? '';
  const type = typeSelect?.value ?? 'text';
  const options = optionsInput?.value ?? '';
  const filterable = filterableInput?.checked ?? true;
  const sortable = sortableInput?.checked ?? true;
  const exportable = exportableInput?.checked ?? true;

  if (!name) {
    showToast('Please enter a name for the custom field', 'danger');
    nameInput?.focus();
    return;
  }

  if (type === 'enum' && !options.trim()) {
    showToast('Enum fields require at least one option', 'danger');
    optionsInput?.focus();
    return;
  }

  try {
    addCustomValue(name, type, options, filterable, sortable, exportable);
    saveSession();
    if (nameInput) nameInput.value = '';
    if (optionsInput) optionsInput.value = '';
    renderCustomValuesList();
    document.dispatchEvent(new CustomEvent('dl:render'));
    showToast(`Custom field "${name}" added`);
  } catch (error) {
    showToast(error.message, 'danger');
    nameInput?.focus();
  }
}

function persistModalSettings() {
  try {
    localStorage.setItem('demonListSettings', JSON.stringify(state.settings));
  } catch (_) { }
}

export function showImportPanel(panelId) {
  document.querySelectorAll('#import-tab .import-panel').forEach(p => p.classList.add('hidden'));
  const target = document.getElementById(panelId);
  if (target) target.classList.remove('hidden');
}

export function showImportError(type, msg) {
  const el = document.querySelector(`.import-error[data-type="${type}"]`);
  if (el) el.textContent = msg;
}

function ensureImportPreviewPanel() {
  let panel = document.getElementById('import-preview-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'import-preview-panel';
    panel.className = 'import-panel hidden';
    panel.setAttribute('data-panel', 'preview');
    const importTab = document.getElementById('import-tab');
    if (importTab) importTab.appendChild(panel);
  }
  return panel;
}

export function buildSchemaRowHtml(field, i) {
  const TYPE_OPTIONS = ['text', 'number', 'boolean', 'enum', 'date', 'url', 'tags', 'json'];
  const typeLabel = {
    text: '📝', number: '#', boolean: '☑', enum: '📋', date: '📅', url: '🔗', tags: '🏷', json: '{ }'
  };
  const sample = field.sampleValues.slice(0, 2).join(' · ');
  const sampleDisplay = sample.length > 70 ? sample.slice(0, 70) + '…' : sample;
  const enumHint = field.type === 'enum' && field.enumOptions.length
    ? `<span class="schema-enum-hint" title="${escHtml(field.enumOptions.join(', '))}">options: ${escHtml(field.enumOptions.slice(0, 4).join(', '))}${field.enumOptions.length > 4 ? '…' : ''}</span>`
    : '';

  return `<tr class="schema-row${!field.visible ? ' schema-row-hidden' : ''}" data-idx="${i}" draggable="true">
    <td class="schema-drag-cell" title="Drag to reorder">⠿</td>
    <td class="schema-visible-cell">
      <input type="checkbox" class="schema-cb schema-field-visible" data-idx="${i}" ${field.visible ? 'checked' : ''} title="Show this field">
    </td>
    <td class="schema-key-cell" title="${escHtml(field.id)}">
      <code class="schema-key-code">${escHtml(field.id)}</code>
      ${field.isBuiltin ? '<span class="schema-builtin-badge" title="Built-in field">★</span>' : ''}
    </td>
    <td class="schema-label-cell">
      <input type="text" class="schema-field-label field-input" data-idx="${i}" value="${escHtml(field.label)}" placeholder="Display label">
    </td>
    <td class="schema-type-cell">
      <select class="schema-field-type field-input" data-idx="${i}">
        ${TYPE_OPTIONS.map(t => `<option value="${t}"${field.type === t ? ' selected' : ''}>${typeLabel[t] || ''} ${t}</option>`).join('')}
      </select>
    </td>
    <td class="schema-flag-cell">
      <input type="checkbox" class="schema-cb schema-field-sortable" data-idx="${i}" ${field.sortable ? 'checked' : ''} title="Sortable">
    </td>
    <td class="schema-flag-cell">
      <input type="checkbox" class="schema-cb schema-field-filterable" data-idx="${i}" ${field.filterable ? 'checked' : ''} title="Filterable">
    </td>
    <td class="schema-sample-cell" title="${escHtml(sample)}">
      <span class="schema-sample-text">${escHtml(sampleDisplay)}</span>
      ${enumHint}
    </td>
  </tr>`;
}

export function renderImportPreview() {
  const panel = ensureImportPreviewPanel();
  const { records, schema, type } = _importPreviewData;

  const templates = listImportTemplates();
  const templateNames = Object.keys(templates);
  const visibleCount = schema.filter(f => f.visible).length;

  const backPanelId = type === 'pending' ? 'import-pending-panel'
    : type === 'replace' ? 'replace-main-panel'
      : 'import-main-panel';

  const typeLabels = { main: 'Main List', pending: 'Pending Queue', replace: 'Replace Main' };

  panel.innerHTML = `
    <div class="import-header">
      <h2>Configure Schema</h2>
      <p>${records.length} record${records.length !== 1 ? 's' : ''} detected &mdash; importing to: <strong>${typeLabels[type] || type}</strong></p>
    </div>

    <div class="schema-templates-bar">
      <div class="schema-template-row">
        <select id="schema-template-select" class="field-input">
          <option value="">Load a saved template&hellip;</option>
          ${templateNames.map(n => `<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('')}
        </select>
        <button id="schema-load-template-btn" class="btn btn-primary"${!templateNames.length ? ' disabled' : ''}>Apply</button>
        <button id="schema-delete-template-btn" class="btn btn-danger"${!templateNames.length ? ' disabled' : ''}>Delete</button>
      </div>
      <div class="schema-template-row">
        <input type="text" id="schema-template-name-input" class="field-input" placeholder="New template name&hellip;">
        <button id="schema-save-template-btn" class="btn">💾 Save Template</button>
      </div>
    </div>
  `;
}
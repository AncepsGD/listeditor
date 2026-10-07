function initConsistencyEvaluator() {
  if (window.__consistencyEvaluatorInitialized) return;
  window.__consistencyEvaluatorInitialized = true;

  const storageKey = 'geometryDashConsistencyCalculator';
  const profilesStorageKey = 'geometryDashConsistencyProfiles';
  const profileControlIds = [
    'baseline', 'currentScore', 'levelPrecision', 'levelHours', 'levelMinutes', 'levelSeconds', 'nerveEnabled'
  ];
  const controlIds = [
    'baseline', 'margin', 'fillerMax', 'currentScore', 'weight', 'decay', 'preWeight', 'postWeight',
    'coverageEnabled', 'exp', 'fillerThreshold', 'fillerLimitPercent', 'fillerDecay',
    'levelHours', 'levelMinutes', 'levelSeconds', 'nerveRate', 'postPeakQualificationNerve',
    'levelPrecision', 'referencePrecision', 'nerveEnabled', 'noclipPenaltyRate'
  ];
  const state = {
    runs: [
      { start: 0, end: 75, noclip: false, deathPercents: '', accuracy: '', noclipTool: 'Mega Hack' },
      { start: 0, end: 100, noclip: false, deathPercents: '', accuracy: '', noclipTool: 'Mega Hack' }
    ],
    listSegments: [{ coverage: 75, difficulty: 75, precision: null }]
  };

  function getInput(id) {
    return document.getElementById(id);
  }

  function loadSavedState() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (!saved || typeof saved !== 'object') return;

      if (Array.isArray(saved.runs)) {
        state.runs = saved.runs.filter(run => run && typeof run === 'object').map(run => {
          const start = Number(run.start);
          const end = Number(run.end);
          const accuracy = Number(run.accuracy);
          return {
            start: Number.isFinite(start) ? start : 0,
            end: Number.isFinite(end) ? end : 0,
            noclip: run.noclip === true,
            deathPercents: typeof run.deathPercents === 'string' ? run.deathPercents : '',
            accuracy: run.accuracy === '' || run.accuracy == null ? '' :
              (Number.isFinite(accuracy) ? accuracy : ''),
            noclipTool: run.noclipTool === 'Eclipse' ? 'Eclipse' : 'Mega Hack'
          };
        });
      }
      if (Array.isArray(saved.listSegments)) {
        state.listSegments = saved.listSegments
          .filter(segment => segment && typeof segment === 'object')
          .map(segment => {
            const coverage = Number(segment.coverage);
            const difficulty = Number(segment.difficulty);
            const precision = Number(segment.precision);
            return {
              coverage: Number.isFinite(coverage) ? coverage : 75,
              difficulty: segment.difficulty === '' || segment.difficulty == null ? null :
                (Number.isFinite(difficulty) ? difficulty : null),
              precision: segment.precision === '' || segment.precision == null ? null :
                (Number.isFinite(precision) ? precision : null)
            };
          });
      }
      if (saved.controls && typeof saved.controls === 'object') {
        controlIds.forEach(id => {
          const input = getInput(id);
          if (!input || !Object.prototype.hasOwnProperty.call(saved.controls, id)) return;
          if (input.type === 'checkbox') {
            input.checked = saved.controls[id] === true;
          } else if (typeof saved.controls[id] === 'string') {
            let savedValue = saved.controls[id];
            if (id === 'noclipPenaltyRate') {
              const rate = Number(savedValue);
              savedValue = savedValue === '0.25' ? input.value :
                Number.isFinite(rate) ? String(Math.max(0, Math.min(0.5, rate))) : input.value;
            }
            input.value = savedValue;
          }
        });
      }
      const advancedOptions = document.querySelector('.consistency-advanced');
      if (advancedOptions && typeof saved.advancedOpen === 'boolean') {
        advancedOptions.open = saved.advancedOpen;
      }
    } catch (error) {
      console.error('Unable to load saved consistency calculator data.', error);
    }
  }

  function saveState() {
    const controls = {};
    controlIds.forEach(id => {
      const input = getInput(id);
      if (input) controls[id] = input.type === 'checkbox' ? input.checked : input.value;
    });

    try {
      localStorage.setItem(storageKey, JSON.stringify({
        runs: state.runs,
        listSegments: state.listSegments,
        controls,
        advancedOpen: document.querySelector('.consistency-advanced')?.open ?? false
      }));
    } catch (error) {
      console.error('Unable to save consistency calculator data.', error);
    }
  }

  function readProfiles() {
    const profiles = JSON.parse(localStorage.getItem(profilesStorageKey) || '[]');
    if (!Array.isArray(profiles)) throw new Error('Saved profiles data is not a list.');
    return profiles.filter(profile =>
      profile && typeof profile.name === 'string' &&
      profile.snapshot && typeof profile.snapshot === 'object'
    );
  }

  function setProfileStatus(message) {
    const status = getInput('consistencyProfileStatus');
    if (status) status.textContent = message;
  }

  function refreshProfileOptions(selectedName = '') {
    const select = getInput('consistencyProfileSelect');
    if (!select) return;

    const profiles = readProfiles();
    select.replaceChildren();
    if (profiles.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No saved profiles';
      select.appendChild(option);
    } else {
      profiles.sort((a, b) => a.name.localeCompare(b.name)).forEach(profile => {
        const option = document.createElement('option');
        option.value = profile.name;
        option.textContent = profile.name;
        select.appendChild(option);
      });
      select.value = profiles.some(profile => profile.name === selectedName) ?
        selectedName :
        profiles[0].name;
    }

    const hasSelection = select.value !== '';
    getInput('loadConsistencyProfile').disabled = !hasSelection;
    getInput('deleteConsistencyProfile').disabled = !hasSelection;
  }

  function captureConsistencyProfile() {
    const controls = {};
    profileControlIds.forEach(id => {
      const input = getInput(id);
      if (input) controls[id] = input.type === 'checkbox' ? input.checked : input.value;
    });
    return {
      runs: state.runs.map(run => ({ ...run })),
      listSegments: state.listSegments.map(segment => ({ ...segment })),
      controls
    };
  }

  function loadConsistencyProfile(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new Error('The selected profile has invalid data.');
    }
    if (Array.isArray(snapshot.runs)) {
      state.runs = snapshot.runs
        .filter(run => run && typeof run === 'object')
        .map(run => {
          const start = Number(run.start);
          const end = Number(run.end);
          const accuracy = Number(run.accuracy);
          return {
            start: Number.isFinite(start) ? Math.max(0, Math.min(100, start)) : 0,
            end: Number.isFinite(end) ? Math.max(0, Math.min(100, end)) : 0,
            noclip: run.noclip === true,
            deathPercents: typeof run.deathPercents === 'string' ? run.deathPercents : '',
            accuracy: run.accuracy === '' || run.accuracy == null ? '' :
              (Number.isFinite(accuracy) ? Math.max(0, Math.min(100, accuracy)) : ''),
            noclipTool: run.noclipTool === 'Eclipse' ? 'Eclipse' : 'Mega Hack'
          };
        });
    }
    if (Array.isArray(snapshot.listSegments)) {
      state.listSegments = snapshot.listSegments
        .filter(segment => segment && typeof segment === 'object')
        .map(segment => {
          const coverage = Number(segment.coverage);
          const difficulty = Number(segment.difficulty);
          const precision = Number(segment.precision);
          return {
            coverage: Number.isFinite(coverage) ? Math.max(0, Math.min(100, coverage)) : 75,
            difficulty: segment.difficulty === '' || segment.difficulty == null ? null :
              (Number.isFinite(difficulty) ? Math.max(0, difficulty) : null),
            precision: segment.precision === '' || segment.precision == null ? null :
              (Number.isFinite(precision) ? Math.max(0.001, precision) : null)
          };
        });
    }
    if (snapshot.controls && typeof snapshot.controls === 'object') {
      profileControlIds.forEach(id => {
        const input = getInput(id);
        if (!input || !Object.prototype.hasOwnProperty.call(snapshot.controls, id)) return;
        if (input.type === 'checkbox') {
          input.checked = snapshot.controls[id] === true;
        } else if (typeof snapshot.controls[id] === 'string') {
          input.value = snapshot.controls[id];
        }
      });
    }
    renderRuns();
    renderListSegments();
    calculate();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function getDeathPositions(deathPercents) {
    return deathPercents.split(',')
      .map(value => value.trim().replace(/%$/, ''))
      .map(value => {
        const match = value.match(/^(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)$/i);
        if (match) return (Number(match[1]) + Number(match[2])) / 2;
        const position = Number(value);
        return value !== '' && Number.isFinite(position) ? position : null;
      })
      .filter(position => position !== null)
      .map(position => Math.max(0, Math.min(100, position)));
  }

  function formatDeathCount(deathPercents) {
    const count = getDeathPositions(deathPercents).length;
    return `${count} ${count === 1 ? 'death' : 'deaths'}`;
  }

  function getNoclipSeverity(run) {
    if (!run.noclip) return 0;

    const deathPositions = getDeathPositions(run.deathPercents);
    const deathSeverity = deathPositions.reduce((sum, position) => {
      const progress = position / 100;
      return sum + 0.1 + 0.9 * progress * progress;
    }, 0);

    const accuracy = run.accuracy === '' || run.accuracy == null ? null : Number(run.accuracy);
    const accuracyExposure = Number.isFinite(accuracy) ?
      Math.max(0, 99.7 - Math.max(0, Math.min(100, accuracy))) * 1000 :
      0;
    const toolExposureMultiplier = run.noclipTool === 'Eclipse' ? 0.165 / 0.39 : 1;
    return deathSeverity + accuracyExposure * toolExposureMultiplier;
  }

  function renderRuns() {
    const container = getInput('runsContainer');
    if (!container) return;

    container.innerHTML = `
      <div class="consistency-run-row consistency-run-header">
        <div></div>
        <div class="consistency-hint">Start %</div>
        <div class="consistency-hint">End % (≤100)</div>
        <div></div>
      </div>
    `;

    state.runs.forEach((run, idx) => {
      const entry = document.createElement('div');
      entry.className = 'consistency-run-entry';
      entry.innerHTML = `
        <div class="consistency-run-row">
          <div class="consistency-run-rank">#${idx + 1}</div>
          <input type="number" min="0" max="100" step="1" data-idx="${idx}" class="consistency-input consistency-run-start">
          <input type="number" min="0" max="100" step="1" data-idx="${idx}" class="consistency-input consistency-run-end">
          <button class="consistency-remove-btn" data-idx="${idx}" type="button" aria-label="Remove run ${idx + 1}">×</button>
        </div>
        <div class="consistency-run-noclip">
          <label class="consistency-nerve-toggle">
            <input type="checkbox" class="consistency-run-noclip-toggle" data-idx="${idx}">
            <span>Noclip used</span>
          </label>
          <div class="consistency-run-noclip-fields${run.noclip ? '' : ' hidden'}">
            <label class="consistency-run-field">
              <span>Mod menu</span>
              <select class="consistency-input consistency-run-tool" data-idx="${idx}">
                <option>Mega Hack</option>
                <option>Eclipse</option>
              </select>
            </label>
            <label class="consistency-run-field consistency-run-death-percents-field">
              <span>Death %s (comma-separated)</span>
              <input type="text" class="consistency-input consistency-run-death-percents" placeholder="e.g. 5, 13, 99" aria-describedby="deathCount-${idx}" data-idx="${idx}">
              <span class="consistency-hint consistency-run-death-count" id="deathCount-${idx}"></span>
            </label>
            <label class="consistency-run-field">
              <span>Accuracy %</span>
              <input type="number" min="0" max="100" step="0.01" class="consistency-input consistency-run-accuracy" placeholder="Optional" data-idx="${idx}">
            </label>
          </div>
        </div>
      `;
      const startInput = entry.querySelector('.consistency-run-start');
      const endInput = entry.querySelector('.consistency-run-end');
      const noclipToggle = entry.querySelector('.consistency-run-noclip-toggle');
      const toolInput = entry.querySelector('.consistency-run-tool');
      const deathPercentsInput = entry.querySelector('.consistency-run-death-percents');
      const accuracyInput = entry.querySelector('.consistency-run-accuracy');
      startInput.value = run.start;
      endInput.value = run.end;
      noclipToggle.checked = run.noclip;
      toolInput.value = run.noclipTool;
      deathPercentsInput.value = run.deathPercents;
      accuracyInput.value = run.accuracy;
      entry.querySelectorAll('.consistency-run-noclip-fields input, .consistency-run-noclip-fields select')
        .forEach(input => { input.disabled = !run.noclip; });
      entry.querySelector('.consistency-run-noclip-fields').classList.toggle('disabled', !run.noclip);
      entry.querySelector('.consistency-run-death-count').textContent = formatDeathCount(run.deathPercents);
      container.appendChild(entry);
    });

    container.querySelectorAll('.consistency-run-start').forEach(el => {
      el.addEventListener('input', e => {
        const i = parseInt(e.target.dataset.idx, 10);
        state.runs[i].start = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
        calculate();
      });
    });

    container.querySelectorAll('.consistency-run-end').forEach(el => {
      el.addEventListener('input', e => {
        const i = parseInt(e.target.dataset.idx, 10);
        state.runs[i].end = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
        calculate();
      });
    });

    container.querySelectorAll('.consistency-run-noclip-toggle').forEach(el => {
      el.addEventListener('change', e => {
        const i = parseInt(e.target.dataset.idx, 10);
        state.runs[i].noclip = e.target.checked;
        const entry = e.target.closest('.consistency-run-entry');
        entry.querySelectorAll('.consistency-run-noclip-fields input, .consistency-run-noclip-fields select')
          .forEach(input => { input.disabled = !e.target.checked; });
        entry.querySelector('.consistency-run-noclip-fields').classList.toggle('disabled', !e.target.checked);
        entry.querySelector('.consistency-run-noclip-fields').classList.toggle('hidden', !e.target.checked);
        calculate();
      });
    });

    container.querySelectorAll('.consistency-run-tool').forEach(el => {
      el.addEventListener('change', e => {
        state.runs[parseInt(e.target.dataset.idx, 10)].noclipTool = e.target.value;
        calculate();
      });
    });

    container.querySelectorAll('.consistency-run-death-percents').forEach(el => {
      el.addEventListener('input', e => {
        const i = parseInt(e.target.dataset.idx, 10);
        state.runs[i].deathPercents = e.target.value;
        e.target.closest('.consistency-run-field').querySelector('.consistency-run-death-count').textContent =
          formatDeathCount(e.target.value);
        calculate();
      });
    });

    container.querySelectorAll('.consistency-run-accuracy').forEach(el => {
      el.addEventListener('input', e => {
        const accuracy = parseFloat(e.target.value);
        state.runs[parseInt(e.target.dataset.idx, 10)].accuracy =
          e.target.value.trim() === '' || !Number.isFinite(accuracy) ? '' : Math.max(0, Math.min(100, accuracy));
        calculate();
      });
    });

    container.querySelectorAll('.consistency-remove-btn').forEach(el => {
      el.addEventListener('click', e => {
        const i = parseInt(e.target.dataset.idx, 10);
        state.runs.splice(i, 1);
        renderRuns();
        calculate();
      });
    });
  }

  function renderListSegments() {
    const container = getInput('lpContainer');
    if (!container) return;

    container.innerHTML = '';

    state.listSegments.forEach((segment, idx) => {
      const row = document.createElement('div');
      row.className = 'consistency-segment-row';
      row.innerHTML = `
        <label class="consistency-segment-field">
          <span class="consistency-segment-label">Level %</span>
          <input type="number" value="${segment.coverage}" min="0" max="100" step="1" data-idx="${idx}" class="consistency-input consistency-segment-cov">
        </label>
        <label class="consistency-segment-field">
          <span class="consistency-segment-label">Difficulty %</span>
          <input type="number" value="${segment.difficulty ?? ''}" min="0" step="1" placeholder="No modifier" data-idx="${idx}" class="consistency-input consistency-segment-diff">
        </label>
        <label class="consistency-segment-field">
          <span class="consistency-segment-label">Precision σ/s</span>
          <input type="number" value="${segment.precision ?? ''}" min="0.001" step="any" placeholder="Use level" data-idx="${idx}" class="consistency-input consistency-segment-precision">
        </label>
        <button class="consistency-remove-btn" data-idx="${idx}" type="button">×</button>
      `;
      container.appendChild(row);
    });

    container.querySelectorAll('.consistency-segment-cov').forEach(el => {
      el.addEventListener('input', e => {
        const i = parseInt(e.target.dataset.idx, 10);
        state.listSegments[i].coverage = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
        calculate();
      });
    });

    container.querySelectorAll('.consistency-segment-diff').forEach(el => {
      el.addEventListener('input', e => {
        const i = parseInt(e.target.dataset.idx, 10);
        const difficulty = parseFloat(e.target.value);
        state.listSegments[i].difficulty = e.target.value.trim() === '' || !Number.isFinite(difficulty) ?
          null :
          Math.max(0, difficulty);
        calculate();
      });
    });

    container.querySelectorAll('.consistency-segment-precision').forEach(el => {
      el.addEventListener('input', e => {
        const i = parseInt(e.target.dataset.idx, 10);
        const precision = parseFloat(e.target.value);
        state.listSegments[i].precision = e.target.value.trim() === '' || !Number.isFinite(precision) ?
          null :
          Math.max(0.001, precision);
        calculate();
      });
    });

    container.querySelectorAll('.consistency-remove-btn').forEach(el => {
      el.addEventListener('click', e => {
        const i = parseInt(e.target.dataset.idx, 10);
        state.listSegments.splice(i, 1);
        renderListSegments();
        calculate();
      });
    });
  }

  function calculate() {
    const baseline = parseFloat(getInput('baseline').value) || 0;
    const margin = parseFloat(getInput('margin').value) || 0;
    const wholePrecision = Math.max(0.001, parseFloat(getInput('levelPrecision').value) || 100);
    const referencePrecision = Math.max(0.001, parseFloat(getInput('referencePrecision').value) || 320);
    const levelHours = Math.max(0, parseInt(getInput('levelHours').value, 10) || 0);
    const levelMinutes = Math.min(59, Math.max(0, parseInt(getInput('levelMinutes').value, 10) || 0));
    const levelSeconds = Math.min(59, Math.max(0, parseInt(getInput('levelSeconds').value, 10) || 0));
    const levelDurationSeconds = levelHours * 3600 + levelMinutes * 60 + levelSeconds;
    const nerveEnabled = getInput('nerveEnabled').checked;
    const nerveRate = Math.max(0, parseFloat(getInput('nerveRate').value) || 0);
    const noclipPenaltyRate = Math.max(0, Math.min(0.5, parseFloat(getInput('noclipPenaltyRate').value) || 0));
    const postPeakQualificationNerve = Math.max(0, Math.min(2, parseFloat(getInput('postPeakQualificationNerve').value) || 0));
    const fillerMax = parseFloat(getInput('fillerMax')?.value) || 0;
    const currentScore = parseFloat(getInput('currentScore').value) || 0;
    const weight = parseFloat(getInput('weight').value) || 0;
    const decay = Math.min(1, Math.max(0, parseFloat(getInput('decay').value)));
    const preWeight = parseFloat(getInput('preWeight').value) || 0;
    const postWeight = parseFloat(getInput('postWeight').value) || 0;
    const coverageEnabled = (parseFloat(getInput('coverageEnabled').value) || 0) >= 1;
    const k = Math.max(0.5, Math.min(5, parseFloat(getInput('exp').value) || 1));
    const fillerThreshold = Math.max(0, Math.min(100, parseFloat(getInput('fillerThreshold')?.value) || 0));
    const fillerLimitPercent = Math.max(0, Math.min(100, parseFloat(getInput('fillerLimitPercent')?.value) || 0));
    const fillerDecay = Math.min(1, Math.max(0, parseFloat(getInput('fillerDecay')?.value ?? 1)));

    let combinedLevelFactor = 1;
    let precisionFactor = wholePrecision / referencePrecision;
    state.listSegments.forEach(segment => {
      const cov = segment.coverage / 100;
      if (cov > 0) {
        if (segment.difficulty !== null) {
          combinedLevelFactor *= Math.pow(segment.difficulty / 100, cov);
        }
        if (segment.precision !== null) {
          precisionFactor *= Math.pow(segment.precision / wholePrecision, cov);
        }
      }
    });
    const equivalentPrecision = precisionFactor * referencePrecision;

    const withOrder = state.runs.map((run, origIndex) => {
      const noclipSeverity = getNoclipSeverity(run);
      return {
        start: run.start,
        end: Math.min(100, run.end),
        origIndex,
        noclip: run.noclip,
        deathPercents: run.deathPercents,
        accuracy: run.accuracy,
        noclipTool: run.noclipTool,
        noclipSeverity,
        noclipFactor: Math.exp(-noclipPenaltyRate * noclipSeverity),
        nerveFactor: nerveEnabled ?
          Math.exp(-nerveRate * levelDurationSeconds * Math.min(100, run.end) / 100) :
          1,
        coverage: coverageEnabled ?
          (run.end > 0 ? Math.max(0, Math.min(1, (run.end - run.start) / run.end)) : 0) :
          1
      };
    });
    const sorted = withOrder.slice().sort((a, b) => b.end - a.end);
    const M = sorted.length ? sorted[0].end : 0;
    const peakOrigIndex = sorted.length ? sorted[0].origIndex : -1;

    const fillerFloor = M * (fillerThreshold / 100);

    const breakdown = sorted.map((run, idx) => {
      const rank = idx + 1;
      const isPeak = rank === 1;
      const order = isPeak ? 'peak' : (run.origIndex < peakOrigIndex ? 'pre' : 'post');
      const reachedSeconds = levelDurationSeconds * run.end / 100;
      const postPeakQualificationFactor = nerveEnabled && order === 'post' ?
        Math.exp(-nerveRate * reachedSeconds * postPeakQualificationNerve) :
        1;
      const qualificationNerveFactor = run.nerveFactor * postPeakQualificationFactor;
      const nerveAdjustedEnd = Math.min(100, run.end / qualificationNerveFactor * run.noclipFactor);
      const fillerGap = Math.max(0, M - run.end);
      const fillerOk = fillerGap <= fillerMax;
      const countsForScore = run.end > 0;
      const countsAsQualifying = nerveAdjustedEnd >= fillerFloor || isPeak;
      const isLowValueFiller = !isPeak && M > 0 && nerveAdjustedEnd < fillerFloor;
      return {
        rank,
        start: run.start,
        end: run.end,
        noclip: run.noclip,
        deathPercents: run.deathPercents,
        accuracy: run.accuracy,
        noclipTool: run.noclipTool,
        noclipSeverity: run.noclipSeverity,
        noclipFactor: run.noclipFactor,
        nerveAdjustedEnd,
        nerveFactor: run.nerveFactor,
        qualificationNerveFactor,
        coverage: run.coverage,
        origIndex: run.origIndex,
        countsForScore,
        countsAsQualifying,
        isPeak,
        order,
        fillerGap,
        fillerOk,
        isLowValueFiller
      };
    });

    const n = breakdown.filter(run => run.countsAsQualifying).length;
    const qualifyingIndexes = breakdown
      .filter(run => run.countsAsQualifying)
      .map(run => run.origIndex);
    const firstQualifyingIndex = Math.min(...qualifyingIndexes);
    const lastQualifyingIndex = Math.max(...qualifyingIndexes);
    const trimmedRunIndexes = new Set(breakdown
      .filter(run => n >= 2 && !run.countsAsQualifying &&
        (run.origIndex < firstQualifyingIndex || run.origIndex > lastQualifyingIndex))
      .map(run => run.origIndex));
    const scoredRuns = breakdown
      .filter(run => !trimmedRunIndexes.has(run.origIndex))
      .map((run, idx) => ({ ...run, scoringRank: idx + 1 }));

    const scoredContributions = scoredRuns.map(run => {
      const nerveFactor = run.nerveFactor;
      const runFactor = nerveFactor * run.noclipFactor;
      if (run.isPeak) {
        const peakContribution = (coverageEnabled ? M * run.coverage : M) * runFactor;
        return { ...run, w: peakContribution, contribution: peakContribution, nerveFactor, noclipFactor: run.noclipFactor };
      }
      if (!run.countsForScore) return { ...run, w: 0, contribution: 0, nerveFactor, noclipFactor: run.noclipFactor };
      const orderFactor = run.order === 'pre' ? preWeight : postWeight;
      const difficultyFactor = Math.pow(run.end / M, k);
      const baseContribution = weight * difficultyFactor * Math.pow(decay, Math.max(0, run.scoringRank - 2)) * orderFactor * run.coverage * runFactor;
      const runRatio = M > 0 ? run.end / M : 0;
      let contribution;
      if (runRatio <= 0.10) {
        contribution = 0;
      } else if (runRatio <= 0.59) {
        contribution = 0;
      } else if (runRatio < 0.69) {
        contribution = baseContribution * 0.3;
      } else {
        contribution = baseContribution;
      }
      const qualifyingRatio = M > 0 ? run.nerveAdjustedEnd / M : 0;
      return { ...run, w: contribution, contribution, nerveFactor, noclipFactor: run.noclipFactor, isAutoFailFiller: qualifyingRatio > 0.10 && qualifyingRatio <= 0.59 };
    });
    const contributions = breakdown.map(run =>
      scoredContributions.find(scored => scored.origIndex === run.origIndex) ||
      { ...run, w: 0, contribution: 0, trimmedAsEdge: true }
    );

    const peakContribution = contributions.find(run => run.isPeak)?.contribution || 0;
    const rawScore = peakContribution + contributions.filter(run => !run.isPeak).reduce((sum, run) => sum + run.contribution, 0);
    const hasAutoFailFiller = contributions.some(run => run.isAutoFailFiller);

    const trimmedRunCount = trimmedRunIndexes.size;
    const fillerCount = scoredRuns.filter(run => run.isLowValueFiller).length;
    const allowedFillerCount = Math.max(0, Math.ceil(scoredRuns.length * (fillerLimitPercent / 100)));
    const excessFiller = Math.max(0, fillerCount - allowedFillerCount);
    const fillerMultiplier = Math.pow(fillerDecay, excessFiller);
    const postPeakNerveExposureSeconds = scoredRuns
      .filter(run => run.order === 'post' && run.end > 0)
      .reduce((sum, run) => sum + levelDurationSeconds * run.end / 100, 0);
    const postPeakNerveMultiplier = nerveEnabled ?
      Math.exp(-nerveRate * postPeakNerveExposureSeconds) :
      1;
    const score = rawScore * fillerMultiplier * postPeakNerveMultiplier;

    const marginFactor = Math.pow(1 + margin / 100, k);
    const required = baseline * marginFactor * combinedLevelFactor * precisionFactor;
    const gateA = score >= required && required > 0;
    const gateB = currentScore <= 0 || score > currentScore;
    const consistencyGate = n >= 2;
    const passed = consistencyGate && !hasAutoFailFiller && gateA && gateB;

    const resultBox = getInput('resultBox');
    const verdictText = getInput('verdictText');
    const verdictSub = getInput('verdictSub');

    if (resultBox) resultBox.className = 'consistency-result ' + (passed ? 'pass' : 'fail');
    if (verdictText) {
      verdictText.className = 'consistency-verdict ' + (passed ? 'pass' : 'fail');
      verdictText.textContent = passed ? 'ACCEPTED' : 'REJECTED';
    }
    if (verdictSub) {
      const fillerNote = excessFiller > 0 ?
        ` ${fillerCount} filler runs (${excessFiller.toFixed(1)} over the ${allowedFillerCount.toFixed(1)} allowed) cut the score by ${((1 - fillerMultiplier) * 100).toFixed(1)}%.` :
        '';
      const trimmedRunNote = trimmedRunCount > 0 ?
        ` ${trimmedRunCount} non-qualifying edge ${trimmedRunCount === 1 ? 'run was' : 'runs were'} trimmed; scoring uses the runs between the first and last qualifying attempts.` :
        '';
      const postPeakNerveNote = nerveEnabled && postPeakNerveExposureSeconds > 0 ?
        ` Post-peak nerves apply an additional ×${postPeakNerveMultiplier.toFixed(3)} score factor.` :
        '';
      verdictSub.textContent = (n < 2 ?
        `Only ${n} run qualifies — treated as a single personal best, not a consistency claim.` :
        `${n} runs qualify. Score ${score.toFixed(1)}%.`) + trimmedRunNote + fillerNote + postPeakNerveNote;
    }

    const gateAStatus = getInput('gateAStatus');
    if (gateAStatus) {
      gateAStatus.textContent = gateA ? 'PASS' : 'FAIL';
      gateAStatus.className = 'consistency-gate-status ' + (gateA ? 'pass' : 'fail');
    }
    const gateADetail = getInput('gateADetail');
    if (gateADetail) {
      gateADetail.textContent = `${score.toFixed(1)}% vs required ${required.toFixed(1)}% (equivalent precision ${equivalentPrecision.toFixed(1)} / ${referencePrecision.toFixed(1)} = ×${precisionFactor.toFixed(2)})`;
    }

    const gateBStatus = getInput('gateBStatus');
    if (gateBStatus) {
      gateBStatus.textContent = gateB ? 'PASS' : 'FAIL';
      gateBStatus.className = 'consistency-gate-status ' + (gateB ? 'pass' : 'fail');
    }
    const gateBDetail = getInput('gateBDetail');
    if (gateBDetail) {
      gateBDetail.textContent = currentScore <= 0 ?
        'No existing achievement on this level' :
        `${score.toFixed(1)}% vs current ${currentScore.toFixed(1)}%`;
    }

    const consistencyStatus = getInput('consistencyStatus');
    if (consistencyStatus) {
      consistencyStatus.textContent = consistencyGate ? 'PASS' : 'FAIL';
      consistencyStatus.className = 'consistency-gate-status ' + (consistencyGate ? 'pass' : 'fail');
    }
    const consistencyDetail = getInput('consistencyDetail');
    if (consistencyDetail) {
      consistencyDetail.textContent = `${n} qualifying ${n === 1 ? 'run' : 'runs'}; ${trimmedRunCount} edge ${trimmedRunCount === 1 ? 'run' : 'runs'} trimmed`;
    }

    const fillerStatus = getInput('fillerStatus');
    if (fillerStatus) {
      fillerStatus.textContent = excessFiller > 0 ? 'PENALTY' : 'OK';
      fillerStatus.textContent = excessFiller > 0 ? 'PENALTY' : trimmedRunCount > 0 ? 'TRIMMED' : 'OK';
      fillerStatus.className = 'consistency-gate-status ' + (excessFiller > 0 ? 'fail' : trimmedRunCount > 0 ? 'neutral' : 'pass');
    }
    const fillerDetail = getInput('fillerDetail');
    if (fillerDetail) {
      const trimmedNote = trimmedRunCount > 0 ?
        `${trimmedRunCount} edge ${trimmedRunCount === 1 ? 'run' : 'runs'} trimmed; ` :
        '';
      fillerDetail.textContent = `${trimmedNote}${fillerCount}/${scoredRuns.length} scored runs under ${fillerThreshold.toFixed(1)}% of peak (allowed: ${allowedFillerCount.toFixed(1)}), ×${fillerMultiplier.toFixed(3)} applied`;
    }

    const body = getInput('breakdownBody');
    if (body) {
      body.innerHTML = '';
      contributions.forEach(row => {
        const tr = document.createElement('tr');
        if (row.trimmedAsEdge) tr.className = 'discarded';
        const orderLabel = row.isPeak ? 'peak' : row.order;
        let runLabel = row.start > 0 ?
          `${row.start.toFixed(0)}–${row.end.toFixed(0)}` :
          `${row.end.toFixed(0)}%`;
        if (!row.isPeak && row.fillerOk && row.fillerGap > 0) {
          runLabel += ` (filler ${row.fillerGap.toFixed(1)}%)`;
        }
        if (!row.isPeak && row.nerveAdjustedEnd > row.end && !row.noclip) {
          runLabel += ` (nerve-adjusted ${row.nerveAdjustedEnd.toFixed(1)}%)`;
        }
        if (row.noclip && row.noclipFactor < 1) {
          runLabel += ` (noclip-adjusted effective progress ${row.nerveAdjustedEnd.toFixed(1)}%; severity ${row.noclipSeverity.toFixed(2)})`;
        }
        if (row.isLowValueFiller) {
          runLabel += ' (low-value filler)';
        }
        if (row.trimmedAsEdge) {
          runLabel += ' (trimmed: outside qualifying span)';
        }
        if (row.noclip) {
          const deathCountLabel = formatDeathCount(row.deathPercents);
          const deathLocations = row.deathPercents.trim() ?
            `; died at ${row.deathPercents.split(',')
              .map(position => position.trim().replace(/%$/, ''))
              .filter(Boolean)
              .map(position => `${escapeHtml(position)}%`)
              .join(', ')}` :
            '';
          const accuracy = row.accuracy !== '' ? `; ${Number(row.accuracy).toFixed(2)}% accuracy` : '';
          runLabel += `<br><span class="consistency-run-noclip-summary">Noclip (${escapeHtml(row.noclipTool)}): ${deathCountLabel}${deathLocations}${accuracy}</span>`;
        }
        tr.innerHTML = `
          <td>#${row.rank}</td>
          <td>${orderLabel}</td>
          <td>${runLabel}</td>
          <td class="num">${(row.coverage * 100).toFixed(0)}%</td>
          <td class="num">${row.nerveFactor.toFixed(3)}×</td>
          <td class="num">${row.noclipFactor.toFixed(3)}×</td>
          <td class="num">${row.countsForScore ? row.w.toFixed(2) : '0.00'}</td>
          <td class="num">${row.countsForScore ? row.contribution.toFixed(1) + '%' : '0.0%'}</td>
        `;
        body.appendChild(tr);
      });
    }

    const totalCell = getInput('totalCell');
    if (totalCell) {
      totalCell.textContent = score.toFixed(1) + '%';
    }
    saveState();
  }

  document.getElementById('addRun')?.addEventListener('click', () => {
    state.runs.push({
      start: 0,
      end: 100,
      noclip: false,
      deathPercents: '',
      accuracy: '',
      noclipTool: 'Mega Hack'
    });
    renderRuns();
    calculate();
  });

  document.getElementById('addLp')?.addEventListener('click', () => {
    state.listSegments.push({ coverage: 75, difficulty: 75, precision: null });
    renderListSegments();
    calculate();
  });

  getInput('consistencyProfileSelect')?.addEventListener('change', e => {
    getInput('consistencyProfileName').value = e.target.value;
    const hasSelection = e.target.value !== '';
    getInput('loadConsistencyProfile').disabled = !hasSelection;
    getInput('deleteConsistencyProfile').disabled = !hasSelection;
  });

  getInput('saveConsistencyProfile')?.addEventListener('click', () => {
    const name = getInput('consistencyProfileName').value.trim();
    if (!name) {
      setProfileStatus('Enter a profile name before saving.');
      getInput('consistencyProfileName').focus();
      return;
    }

    try {
      const profiles = readProfiles();
      const existingIndex = profiles.findIndex(profile => profile.name === name);
      const profile = { name, snapshot: captureConsistencyProfile() };
      if (existingIndex === -1) profiles.push(profile);
      else profiles[existingIndex] = profile;
      localStorage.setItem(profilesStorageKey, JSON.stringify(profiles));
      refreshProfileOptions(name);
      setProfileStatus(`Saved "${name}".`);
    } catch (error) {
      console.error('Unable to save consistency profile.', error);
      setProfileStatus('Could not save profile. Check browser storage availability.');
    }
  });

  getInput('loadConsistencyProfile')?.addEventListener('click', () => {
    const name = getInput('consistencyProfileSelect').value;
    if (!name) return;
    try {
      const profile = readProfiles().find(savedProfile => savedProfile.name === name);
      if (!profile) {
        setProfileStatus('That profile could not be found.');
        refreshProfileOptions();
        return;
      }
      loadConsistencyProfile(profile.snapshot);
      getInput('consistencyProfileName').value = name;
      setProfileStatus(`Loaded "${name}". Advanced options were left unchanged.`);
    } catch (error) {
      console.error('Unable to load consistency profile.', error);
      setProfileStatus('Could not load that profile because its saved data is invalid.');
    }
  });

  getInput('deleteConsistencyProfile')?.addEventListener('click', () => {
    const name = getInput('consistencyProfileSelect').value;
    if (!name || !window.confirm(`Delete the saved consistency profile "${name}"?`)) return;
    try {
      const profiles = readProfiles().filter(profile => profile.name !== name);
      localStorage.setItem(profilesStorageKey, JSON.stringify(profiles));
      getInput('consistencyProfileName').value = '';
      refreshProfileOptions();
      setProfileStatus(`Deleted "${name}".`);
    } catch (error) {
      console.error('Unable to delete consistency profile.', error);
      setProfileStatus('Could not delete profile. Check browser storage availability.');
    }
  });

  [
    'baseline', 'margin', 'fillerMax', 'currentScore', 'weight', 'decay', 'preWeight', 'postWeight',
    'coverageEnabled', 'exp', 'fillerThreshold', 'fillerLimitPercent', 'fillerDecay',
    'levelHours', 'levelMinutes', 'levelSeconds', 'nerveRate', 'postPeakQualificationNerve', 'noclipPenaltyRate',
    'levelPrecision', 'referencePrecision'
  ].forEach(id => {
    getInput(id)?.addEventListener('input', calculate);
  });
  getInput('nerveEnabled')?.addEventListener('change', calculate);
  getInput('noclipPenaltyRate')?.addEventListener('change', e => {
    const rate = Number(e.target.value);
    e.target.value = Number.isFinite(rate) ? String(Math.max(0, Math.min(0.5, rate))) : '0.1';
    calculate();
  });
  document.querySelector('.consistency-advanced')?.addEventListener('toggle', saveState);

  loadSavedState();
  try {
    refreshProfileOptions();
  } catch (error) {
    console.error('Unable to read saved consistency profiles.', error);
    setProfileStatus('Saved profiles could not be read from browser storage.');
  }
  renderRuns();
  renderListSegments();
  calculate();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initConsistencyEvaluator);
} else {
  initConsistencyEvaluator();
}
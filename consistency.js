function initConsistencyEvaluator() {
  if (window.__consistencyEvaluatorInitialized) return;
  window.__consistencyEvaluatorInitialized = true;

  const state = {
    runs: [{ start: 0, end: 75 }, { start: 0, end: 100 }],
    listSegments: [{ coverage: 75, difficulty: 75 }]
  };

  function getInput(id) {
    return document.getElementById(id);
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
      const row = document.createElement('div');
      row.className = 'consistency-run-row';
      row.innerHTML = `
        <div class="consistency-run-rank">#${idx + 1}</div>
        <input type="number" value="${run.start}" min="0" max="100" step="1" data-idx="${idx}" class="consistency-input consistency-run-start">
        <input type="number" value="${run.end}" min="0" max="100" step="1" data-idx="${idx}" class="consistency-input consistency-run-end">
        <button class="consistency-remove-btn" data-idx="${idx}" type="button">×</button>
      `;
      container.appendChild(row);
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
        <span class="consistency-segment-label">Level %</span>
        <input type="number" value="${segment.coverage}" min="0" max="100" step="1" data-idx="${idx}" class="consistency-input consistency-segment-cov">
        <span class="consistency-segment-label">Difficulty %</span>
        <input type="number" value="${segment.difficulty}" min="0" step="1" data-idx="${idx}" class="consistency-input consistency-segment-diff">
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
        state.listSegments[i].difficulty = Math.max(0, parseFloat(e.target.value) || 0);
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
    const tolerancePercent = parseFloat(getInput('tolerance').value) || 0;
    const currentScore = parseFloat(getInput('currentScore').value) || 0;
    const weight = parseFloat(getInput('weight').value) || 0;
    const decay = Math.min(1, Math.max(0, parseFloat(getInput('decay').value)));
    const preWeight = parseFloat(getInput('preWeight').value) || 0;
    const postWeight = parseFloat(getInput('postWeight').value) || 0;
    const coverageEnabled = (parseFloat(getInput('coverageEnabled').value) || 0) >= 1;
    const k = Math.max(0.5, Math.min(5, parseFloat(getInput('exp').value) || 1));

    let combinedLevelFactor = 1;
    state.listSegments.forEach(segment => {
      const cov = segment.coverage / 100;
      const diff = segment.difficulty / 100;
      if (cov > 0) {
        combinedLevelFactor *= Math.pow(diff, cov);
      }
    });

    const withOrder = state.runs.map((run, origIndex) => ({
      start: run.start,
      end: Math.min(100, run.end),
      origIndex,
      coverage: coverageEnabled ?
        (run.end > 0 ? Math.max(0, Math.min(1, (run.end - run.start) / run.end)) : 0) :
        1
    }));

    const sorted = withOrder.slice().sort((a, b) => b.end - a.end);
    const M = sorted.length ? sorted[0].end : 0;
    const peakOrigIndex = sorted.length ? sorted[0].origIndex : -1;

    const threshold = M * (1 - tolerancePercent / 100);

    const breakdown = sorted.map((run, idx) => {
      const rank = idx + 1;
      const qualifies = run.end >= threshold;
      const isPeak = rank === 1;
      const order = isPeak ? 'peak' : (run.origIndex < peakOrigIndex ? 'pre' : 'post');
      return {
        rank,
        start: run.start,
        end: run.end,
        coverage: run.coverage,
        origIndex: run.origIndex,
        qualifies,
        isPeak,
        order
      };
    });

    const n = breakdown.filter(run => run.qualifies).length;

    const contributions = breakdown.map(run => {
      if (run.isPeak) {
        const peakContribution = coverageEnabled ? M * run.coverage : M;
        return { ...run, w: 1, contribution: peakContribution };
      }
      if (!run.qualifies || n < 2) return { ...run, w: 0, contribution: 0 };
      const orderFactor = run.order === 'pre' ? preWeight : postWeight;
      const difficultyFactor = Math.pow(run.end / M, k);
      const w = weight * difficultyFactor * Math.pow(decay, Math.max(0, run.rank - 2)) * orderFactor * run.coverage;
      return { ...run, w, contribution: w };
    });

    const peakContribution = contributions.find(run => run.isPeak)?.contribution || 0;
    const score = n < 2 ?
      peakContribution :
      peakContribution + contributions.filter(run => !run.isPeak).reduce((sum, run) => sum + run.contribution, 0);

    const marginFactor = Math.pow(1 + margin / 100, k);
    const required = baseline * marginFactor * combinedLevelFactor;
    const gateA = score >= required && required > 0;
    const gateB = currentScore <= 0 || score > currentScore;
    const passed = gateA && gateB;

    const resultBox = getInput('resultBox');
    const verdictText = getInput('verdictText');
    const verdictSub = getInput('verdictSub');

    if (resultBox) resultBox.className = 'consistency-result ' + (passed ? 'pass' : 'fail');
    if (verdictText) {
      verdictText.className = 'consistency-verdict ' + (passed ? 'pass' : 'fail');
      verdictText.textContent = passed ? 'ACCEPTED' : 'REJECTED';
    }
    if (verdictSub) {
      verdictSub.textContent = n < 2 ?
        `Only ${n} run within tolerance of the peak (${M.toFixed(1)}%) — treated as a single personal best, not a consistency claim.` :
        `${n} runs within tolerance of the peak (${M.toFixed(1)}%). Score ${score.toFixed(1)}%.`;
    }

    const gateAStatus = getInput('gateAStatus');
    if (gateAStatus) {
      gateAStatus.textContent = gateA ? 'PASS' : 'FAIL';
      gateAStatus.className = 'consistency-gate-status ' + (gateA ? 'pass' : 'fail');
    }
    const gateADetail = getInput('gateADetail');
    if (gateADetail) {
      gateADetail.textContent = `${score.toFixed(1)}% vs required ${required.toFixed(1)}%`;
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

    const body = getInput('breakdownBody');
    if (body) {
      body.innerHTML = '';
      contributions.forEach(row => {
        const tr = document.createElement('tr');
        if (!row.qualifies) tr.classList.add('discarded');
        const orderLabel = row.isPeak ? 'peak' : row.order;
        const runLabel = row.start > 0 ?
          `${row.start.toFixed(0)}–${row.end.toFixed(0)}` :
          `${row.end.toFixed(0)}%`;
        tr.innerHTML = `
          <td>#${row.rank}</td>
          <td>${orderLabel}</td>
          <td>${runLabel}</td>
          <td class="num">${(row.coverage * 100).toFixed(0)}%</td>
          <td class="num">${row.qualifies ? row.w.toFixed(2) : '—'}</td>
          <td class="num">${row.qualifies ? row.contribution.toFixed(1) + '%' : 'discarded'}</td>
        `;
        body.appendChild(tr);
      });
    }

    const totalCell = getInput('totalCell');
    if (totalCell) {
      totalCell.textContent = score.toFixed(1) + '%';
    }
  }

  document.getElementById('addRun')?.addEventListener('click', () => {
    state.runs.push({ start: 0, end: 100 });
    renderRuns();
    calculate();
  });

  document.getElementById('addLp')?.addEventListener('click', () => {
    state.listSegments.push({ coverage: 75, difficulty: 75 });
    renderListSegments();
    calculate();
  });

  ['baseline', 'margin', 'tolerance', 'currentScore', 'weight', 'decay', 'preWeight', 'postWeight', 'coverageEnabled', 'exp']
    .forEach(id => {
      getInput(id)?.addEventListener('input', calculate);
    });

  renderRuns();
  renderListSegments();
  calculate();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initConsistencyEvaluator);
} else {
  initConsistencyEvaluator();
}

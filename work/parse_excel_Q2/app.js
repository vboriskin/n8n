(function () {
  'use strict';

  const WORK_TYPES = ['разработка', 'тестирование', 'аналитика', 'внедрение'];
  const DEFAULT_FILE_NAME = 'plan.xlsx';
  const PROJECT_SHEET_MARKER = 'общепроект';

  const state = {
    tasks: [],
    diagnostics: {
      sheets: [],
      rowsPerSheet: {},
      columnFindings: {},
      warnings: [],
      totalTasks: 0,
      sourceName: ''
    },
    filters: {
      team: 'ALL',
      scope: 'ALL',
      release: 'ALL',
      workType: 'ALL'
    },
    unassignedFilters: {
      scope: 'ALL',
      team: 'ALL',
      category: 'ALL'
    }
  };

  const elements = {
    fileInput: document.getElementById('file-input'),
    loadDefaultBtn: document.getElementById('load-default-btn'),
    messages: document.getElementById('messages'),
    summaryCards: document.getElementById('summary-cards'),
    filterTeam: document.getElementById('filter-team'),
    filterScope: document.getElementById('filter-scope'),
    filterRelease: document.getElementById('filter-release'),
    filterWorkType: document.getElementById('filter-worktype'),
    resetFiltersBtn: document.getElementById('reset-filters-btn'),
    exportAllBtn: document.getElementById('export-all-btn'),
    release120Total: document.getElementById('release-120-total'),
    release121Total: document.getElementById('release-121-total'),
    release120Worktypes: document.getElementById('release-120-worktypes'),
    release121Worktypes: document.getElementById('release-121-worktypes'),
    release120Teams: document.getElementById('release-120-teams'),
    release121Teams: document.getElementById('release-121-teams'),
    unassignedScopeFilter: document.getElementById('unassigned-scope-filter'),
    unassignedTeamFilter: document.getElementById('unassigned-team-filter'),
    unassignedCategoryFilter: document.getElementById('unassigned-category-filter'),
    unassignedTableBody: document.getElementById('unassigned-table-body'),
    exportUnassignedBtn: document.getElementById('export-unassigned-btn'),
    questionableTableBody: document.getElementById('questionable-table-body'),
    exportQuestionableBtn: document.getElementById('export-questionable-btn'),
    teamsTableBody: document.getElementById('teams-table-body'),
    diagnosticsContent: document.getElementById('diagnostics-content')
  };

  function init() {
    bindEvents();
    bootstrapFilters();
    renderAll();
  }

  function bindEvents() {
    elements.fileInput.addEventListener('change', async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) {
        return;
      }
      await loadWorkbookFromFile(file);
      event.target.value = '';
    });

    elements.loadDefaultBtn.addEventListener('click', async () => {
      await tryLoadDefaultFile();
    });

    elements.filterTeam.addEventListener('change', () => {
      state.filters.team = elements.filterTeam.value;
      renderAll();
    });

    elements.filterScope.addEventListener('change', () => {
      state.filters.scope = elements.filterScope.value;
      renderAll();
    });

    elements.filterRelease.addEventListener('change', () => {
      state.filters.release = elements.filterRelease.value;
      renderAll();
    });

    elements.filterWorkType.addEventListener('change', () => {
      state.filters.workType = elements.filterWorkType.value;
      renderAll();
    });

    elements.unassignedScopeFilter.addEventListener('change', () => {
      state.unassignedFilters.scope = elements.unassignedScopeFilter.value;
      renderUnassignedTable();
    });

    elements.unassignedTeamFilter.addEventListener('change', () => {
      state.unassignedFilters.team = elements.unassignedTeamFilter.value;
      renderUnassignedTable();
    });

    elements.unassignedCategoryFilter.addEventListener('change', () => {
      state.unassignedFilters.category = elements.unassignedCategoryFilter.value;
      renderUnassignedTable();
    });

    elements.resetFiltersBtn.addEventListener('click', () => {
      state.filters = {
        team: 'ALL',
        scope: 'ALL',
        release: 'ALL',
        workType: 'ALL'
      };
      syncGlobalFilterControls();
      renderAll();
    });

    elements.exportAllBtn.addEventListener('click', () => {
      const rows = getGloballyFilteredTasks();
      exportTasksToCsv(rows, 'all_tasks_filtered.csv');
    });

    elements.exportUnassignedBtn.addEventListener('click', () => {
      const rows = getFilteredUnassignedTasks();
      exportTasksToCsv(rows, 'unassigned_tasks.csv');
    });

    elements.exportQuestionableBtn.addEventListener('click', () => {
      const rows = getGloballyFilteredTasks().filter((task) => task.scopeStatus === '?');
      exportTasksToCsv(rows, 'scope_question_tasks.csv');
    });
  }

  function bootstrapFilters() {
    populateSelect(elements.filterTeam, [{ value: 'ALL', label: 'Все команды' }]);
    populateSelect(elements.filterScope, [
      { value: 'ALL', label: 'Все' },
      { value: 'ДА', label: 'ДА' },
      { value: 'НЕТ', label: 'НЕТ' },
      { value: '?', label: '?' },
      { value: 'EMPTY', label: 'Пусто' }
    ]);
    populateSelect(elements.filterRelease, [
      { value: 'ALL', label: 'Все' },
      { value: 'RELEASED', label: 'Есть релиз (1.20 или 1.21)' },
      { value: 'UNASSIGNED', label: 'Без релиза' },
      { value: 'R120', label: 'Только релиз 1.20' },
      { value: 'R121', label: 'Только релиз 1.21' },
      { value: 'BOTH', label: 'Есть и 1.20 и 1.21' }
    ]);
    populateSelect(elements.filterWorkType, [
      { value: 'ALL', label: 'Все типы работ' },
      ...WORK_TYPES.map((item) => ({ value: item, label: item }))
    ]);

    populateSelect(elements.unassignedScopeFilter, [
      { value: 'ALL', label: 'Все scope' },
      { value: 'ДА', label: 'ДА' },
      { value: 'НЕТ', label: 'НЕТ' },
      { value: '?', label: '?' },
      { value: 'EMPTY', label: 'Пусто' }
    ]);

    populateSelect(elements.unassignedTeamFilter, [{ value: 'ALL', label: 'Все команды' }]);
    populateSelect(elements.unassignedCategoryFilter, [{ value: 'ALL', label: 'Все категории' }]);
  }

  async function tryLoadDefaultFile() {
    clearMessages();
    if (!window.fetch) {
      addMessage('error', 'Браузер не поддерживает fetch. Используйте загрузку файла через кнопку upload.');
      return;
    }

    try {
      const response = await fetch(DEFAULT_FILE_NAME, { cache: 'no-store' });
      if (!response.ok) {
        addMessage('warn', 'Файл plan.xlsx рядом со страницей не найден. Загрузите файл вручную.');
        return;
      }
      const arrayBuffer = await response.arrayBuffer();
      const fakeFile = { name: DEFAULT_FILE_NAME };
      parseWorkbookArrayBuffer(arrayBuffer, fakeFile);
      addMessage('info', 'Успешно загружен файл plan.xlsx из текущей директории.');
    } catch (error) {
      addMessage(
        'warn',
        'Автозагрузка plan.xlsx недоступна в текущем режиме браузера. Это нормально, используйте upload .xlsx.'
      );
      console.warn('Не удалось загрузить файл по умолчанию:', error);
    }
  }

  async function loadWorkbookFromFile(file) {
    clearMessages();

    if (!window.XLSX) {
      addMessage(
        'error',
        'Не найдена библиотека SheetJS. Положите файл vendor/xlsx.full.min.js рядом с приложением и перезагрузите страницу.'
      );
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      parseWorkbookArrayBuffer(arrayBuffer, file);
      addMessage('info', `Файл ${file.name} успешно обработан.`);
    } catch (error) {
      console.error(error);
      addMessage('error', `Ошибка чтения файла ${file.name}: ${error.message}`);
    }
  }

  function parseWorkbookArrayBuffer(arrayBuffer, sourceFile) {
    if (!window.XLSX) {
      throw new Error('Библиотека XLSX не загружена.');
    }

    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const tasks = [];
    const rowsPerSheet = {};
    const columnFindings = {};
    const warnings = [];

    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        defval: ''
      });

      rowsPerSheet[sheetName] = rows.length;
      if (!rows.length) {
        warnings.push(`Лист "${sheetName}" пуст.`);
        columnFindings[sheetName] = { found: {}, missing: ['все ключевые колонки'] };
        return;
      }

      const headerInfo = detectHeaderRow(rows);
      if (!headerInfo) {
        warnings.push(`На листе "${sheetName}" не удалось найти строку заголовков.`);
        columnFindings[sheetName] = { found: {}, missing: ['все ключевые колонки'] };
        return;
      }

      const { headerRowIndex, headerRow } = headerInfo;
      const columns = mapColumns(headerRow);
      columnFindings[sheetName] = columns;

      for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
        const row = rows[i] || [];
        const task = parseRowToTask(row, columns, sheetName, i + 1);
        if (task) {
          tasks.push(task);
        }
      }
    });

    state.tasks = tasks;
    state.diagnostics = {
      sheets: workbook.SheetNames.slice(),
      rowsPerSheet,
      columnFindings,
      warnings,
      totalTasks: tasks.length,
      sourceName: sourceFile && sourceFile.name ? sourceFile.name : 'Неизвестный источник'
    };

    resetUnassignedFilters();
    refreshDynamicFilterOptions();
    renderAll();
  }

  function detectHeaderRow(rows) {
    const maxRowsToScan = Math.min(rows.length, 15);
    for (let i = 0; i < maxRowsToScan; i += 1) {
      const row = rows[i] || [];
      const normalized = row.map((cell) => normalizeHeader(cell));
      const hasCategory = normalized.some((item) => item.includes('категория'));
      const hasTask = normalized.some((item) => item.includes('задач'));
      const hasRelease = normalized.some((item) => item.includes('релиз 1.20') || item.includes('релиз 1.21'));
      const hasScope = normalized.some((item) => item.includes('входит в скоуп'));

      if (hasCategory || hasTask || hasRelease || hasScope) {
        return {
          headerRowIndex: i,
          headerRow: row
        };
      }
    }
    return null;
  }

  function mapColumns(headerRow) {
    const found = {
      category: -1,
      stage: -1,
      description: -1,
      comments: -1,
      scope: -1,
      release120: -1,
      release121: -1
    };

    const normalizedHeaders = headerRow.map((item) => normalizeHeader(item));

    normalizedHeaders.forEach((header, index) => {
      if (found.category === -1 && header.includes('категория')) {
        found.category = index;
      }
      if (found.stage === -1 && header.includes('этап')) {
        found.stage = index;
      }
      if (found.description === -1 && header.includes('задач')) {
        found.description = index;
      }
      if (found.comments === -1 && header.includes('комментар')) {
        found.comments = index;
      }
      if (found.scope === -1 && header.includes('входит в скоуп')) {
        found.scope = index;
      }
      if (found.release120 === -1 && header.includes('релиз 1.20')) {
        found.release120 = index;
      }
      if (found.release121 === -1 && header.includes('релиз 1.21')) {
        found.release121 = index;
      }
    });

    const missing = [];
    Object.keys(found).forEach((key) => {
      if (found[key] === -1) {
        missing.push(key);
      }
    });

    return { found, missing };
  }

  function parseRowToTask(row, columns, sheetName, rowNumber) {
    const pick = (idx) => (idx >= 0 ? toCleanString(row[idx]) : '');

    const category = pick(columns.found.category);
    const stage = pick(columns.found.stage);
    const description = pick(columns.found.description);
    const comments = pick(columns.found.comments);
    const scopeRaw = pick(columns.found.scope);
    const release120Raw = pick(columns.found.release120);
    const release121Raw = pick(columns.found.release121);

    if (isTechnicallyEmptyRow(row)) {
      return null;
    }

    const release120Types = parseWorkTypes(release120Raw, '1.20', sheetName, rowNumber);
    const release121Types = parseWorkTypes(release121Raw, '1.21', sheetName, rowNumber);
    const hasRelease120 = hasRelease(release120Raw);
    const hasRelease121 = hasRelease(release121Raw);
    const scopeStatus = normalizeScope(scopeRaw);

    const hasUsefulData = Boolean(
      category || description || scopeStatus || hasRelease120 || hasRelease121 || stage || comments
    );

    if (!hasUsefulData) {
      return null;
    }

    const isProjectSheet = normalizeHeader(sheetName).includes(PROJECT_SHEET_MARKER);

    return {
      sheetName,
      team: isProjectSheet ? 'Общепроектные' : sheetName,
      category,
      stage,
      description,
      scopeStatus,
      release120Raw,
      release121Raw,
      release120Types,
      release121Types,
      hasRelease120,
      hasRelease121,
      isUnassigned: !hasRelease120 && !hasRelease121,
      comments
    };
  }

  function normalizeHeader(value) {
    return toCleanString(value).toLowerCase().replace(/\s+/g, ' ');
  }

  function toCleanString(value) {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value).replace(/\u00a0/g, ' ').trim();
  }

  function isTechnicallyEmptyRow(row) {
    return row.every((cell) => !toCleanString(cell));
  }

  function normalizeScope(value) {
    const normalized = toCleanString(value).toLowerCase().replace(/\s+/g, '');
    if (!normalized) {
      return '';
    }
    if (normalized === 'да') {
      return 'ДА';
    }
    if (normalized === 'нет') {
      return 'НЕТ';
    }
    if (normalized.includes('?')) {
      return '?';
    }
    return '';
  }

  function parseWorkTypes(value, releaseLabel, sheetName, rowNumber) {
    const raw = toCleanString(value).toLowerCase();
    if (!raw) {
      return [];
    }

    const tokens = raw
      .split('/')
      .map((item) => item.trim())
      .filter(Boolean);

    const unique = new Set();

    tokens.forEach((token) => {
      const resolved = normalizeWorkTypeToken(token);
      if (resolved) {
        unique.add(resolved);
      } else {
        console.warn(
          `Неизвестный тип работ: "${token}". Лист: ${sheetName}, строка: ${rowNumber}, релиз: ${releaseLabel}.`
        );
      }
    });

    return Array.from(unique);
  }

  function normalizeWorkTypeToken(token) {
    const normalized = token.toLowerCase().replace(/\s+/g, ' ').trim();
    const aliases = {
      'разработка': 'разработка',
      'разраб': 'разработка',
      'dev': 'разработка',
      'тестирование': 'тестирование',
      'тест': 'тестирование',
      'qa': 'тестирование',
      'аналитика': 'аналитика',
      'анализ': 'аналитика',
      'внедрение': 'внедрение',
      'внедр': 'внедрение'
    };
    return aliases[normalized] || '';
  }

  function hasRelease(value) {
    const raw = toCleanString(value);
    return Boolean(raw);
  }

  function getGloballyFilteredTasks() {
    return state.tasks.filter((task) => {
      if (state.filters.team !== 'ALL' && task.team !== state.filters.team) {
        return false;
      }

      if (state.filters.scope !== 'ALL') {
        if (state.filters.scope === 'EMPTY') {
          if (task.scopeStatus) {
            return false;
          }
        } else if (task.scopeStatus !== state.filters.scope) {
          return false;
        }
      }

      if (state.filters.release !== 'ALL') {
        const hasAny = task.hasRelease120 || task.hasRelease121;
        const isOnly120 = task.hasRelease120 && !task.hasRelease121;
        const isOnly121 = !task.hasRelease120 && task.hasRelease121;
        const isBoth = task.hasRelease120 && task.hasRelease121;

        if (state.filters.release === 'RELEASED' && !hasAny) {
          return false;
        }
        if (state.filters.release === 'UNASSIGNED' && !task.isUnassigned) {
          return false;
        }
        if (state.filters.release === 'R120' && !isOnly120) {
          return false;
        }
        if (state.filters.release === 'R121' && !isOnly121) {
          return false;
        }
        if (state.filters.release === 'BOTH' && !isBoth) {
          return false;
        }
      }

      if (state.filters.workType !== 'ALL') {
        const allTypes = new Set([...task.release120Types, ...task.release121Types]);
        if (!allTypes.has(state.filters.workType)) {
          return false;
        }
      }

      return true;
    });
  }

  function renderAll() {
    const filtered = getGloballyFilteredTasks();
    renderSummary(filtered);
    renderReleases(filtered);
    renderQuestionableTable(filtered);
    renderTeams(filtered);
    renderUnassignedFilterOptions(filtered);
    renderUnassignedTable();
    renderDiagnostics();
  }

  function renderSummary(tasks) {
    const cards = [
      { label: 'Всего задач', value: tasks.length },
      { label: 'В scope (ДА)', value: tasks.filter((t) => t.scopeStatus === 'ДА').length },
      { label: 'Вне scope (НЕТ)', value: tasks.filter((t) => t.scopeStatus === 'НЕТ').length },
      { label: 'Под вопросом (?)', value: tasks.filter((t) => t.scopeStatus === '?').length },
      { label: 'В релизе 1.20', value: tasks.filter((t) => t.hasRelease120).length },
      { label: 'В релизе 1.21', value: tasks.filter((t) => t.hasRelease121).length },
      { label: 'Без релиза', value: tasks.filter((t) => t.isUnassigned).length }
    ];

    elements.summaryCards.innerHTML = cards
      .map(
        (card) => `
        <div class="card">
          <div class="card-label">${escapeHtml(card.label)}</div>
          <div class="card-value">${card.value}</div>
        </div>
      `
      )
      .join('');
  }

  function renderReleases(tasks) {
    const r120 = tasks.filter((task) => task.hasRelease120);
    const r121 = tasks.filter((task) => task.hasRelease121);

    elements.release120Total.textContent = `${r120.length} задач`;
    elements.release121Total.textContent = `${r121.length} задач`;

    renderBarList(elements.release120Worktypes, aggregateByWorkTypes(r120, '1.20'));
    renderBarList(elements.release121Worktypes, aggregateByWorkTypes(r121, '1.21'));
    renderBarList(elements.release120Teams, aggregateByTeam(r120));
    renderBarList(elements.release121Teams, aggregateByTeam(r121));
  }

  function aggregateByWorkTypes(tasks, release) {
    const counts = {
      'разработка': 0,
      'тестирование': 0,
      'аналитика': 0,
      'внедрение': 0
    };

    tasks.forEach((task) => {
      const list = release === '1.20' ? task.release120Types : task.release121Types;
      list.forEach((type) => {
        if (counts[type] !== undefined) {
          counts[type] += 1;
        }
      });
    });

    return Object.keys(counts).map((key) => ({ label: key, value: counts[key] }));
  }

  function aggregateByTeam(tasks) {
    const map = new Map();
    tasks.forEach((task) => {
      map.set(task.team, (map.get(task.team) || 0) + 1);
    });

    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }

  function renderBarList(container, items) {
    if (!items.length) {
      container.innerHTML = '<div class="empty">Нет данных</div>';
      return;
    }

    const max = Math.max(...items.map((i) => i.value), 1);
    container.innerHTML = `<div class="bar-list">${items
      .map((item) => {
        const width = Math.round((item.value / max) * 100);
        return `
          <div class="bar-row">
            <div>${escapeHtml(item.label)}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
            <div class="bar-count">${item.value}</div>
          </div>
        `;
      })
      .join('')}</div>`;
  }

  function renderUnassignedFilterOptions(filteredGlobalTasks) {
    const unassigned = filteredGlobalTasks.filter((task) => task.isUnassigned);

    const teams = uniqueSorted(unassigned.map((task) => task.team));
    const categories = uniqueSorted(unassigned.map((task) => task.category).filter(Boolean));

    populateSelect(elements.unassignedTeamFilter, [
      { value: 'ALL', label: 'Все команды' },
      ...teams.map((team) => ({ value: team, label: team }))
    ]);

    populateSelect(elements.unassignedCategoryFilter, [
      { value: 'ALL', label: 'Все категории' },
      ...categories.map((category) => ({ value: category, label: category }))
    ]);

    if (!teams.includes(state.unassignedFilters.team) && state.unassignedFilters.team !== 'ALL') {
      state.unassignedFilters.team = 'ALL';
    }

    if (!categories.includes(state.unassignedFilters.category) && state.unassignedFilters.category !== 'ALL') {
      state.unassignedFilters.category = 'ALL';
    }

    elements.unassignedScopeFilter.value = state.unassignedFilters.scope;
    elements.unassignedTeamFilter.value = state.unassignedFilters.team;
    elements.unassignedCategoryFilter.value = state.unassignedFilters.category;
  }

  function getFilteredUnassignedTasks() {
    const base = getGloballyFilteredTasks().filter((task) => task.isUnassigned);

    return base.filter((task) => {
      if (state.unassignedFilters.scope !== 'ALL') {
        if (state.unassignedFilters.scope === 'EMPTY') {
          if (task.scopeStatus) {
            return false;
          }
        } else if (task.scopeStatus !== state.unassignedFilters.scope) {
          return false;
        }
      }

      if (state.unassignedFilters.team !== 'ALL' && task.team !== state.unassignedFilters.team) {
        return false;
      }

      if (state.unassignedFilters.category !== 'ALL' && task.category !== state.unassignedFilters.category) {
        return false;
      }

      return true;
    });
  }

  function renderUnassignedTable() {
    const rows = getFilteredUnassignedTasks();

    if (!rows.length) {
      elements.unassignedTableBody.innerHTML =
        '<tr><td colspan="7" class="empty">Нет задач без релиза по выбранным фильтрам.</td></tr>';
      return;
    }

    elements.unassignedTableBody.innerHTML = rows
      .map((task) => {
        const highlightClass =
          task.scopeStatus === 'ДА' ? 'highlight-scope-yes' : task.scopeStatus === '?' ? 'highlight-scope-question' : '';

        return `
          <tr class="${highlightClass}">
            <td>${escapeHtml(task.team)}</td>
            <td>${escapeHtml(task.category || '-')}</td>
            <td>${escapeHtml(task.description || '-')}</td>
            <td>${renderScopeBadge(task.scopeStatus)}</td>
            <td>${escapeHtml(task.release120Raw || '-')}</td>
            <td>${escapeHtml(task.release121Raw || '-')}</td>
            <td>${escapeHtml(task.comments || '-')}</td>
          </tr>
        `;
      })
      .join('');
  }

  function renderQuestionableTable(tasks) {
    const rows = tasks.filter((task) => task.scopeStatus === '?');

    if (!rows.length) {
      elements.questionableTableBody.innerHTML =
        '<tr><td colspan="7" class="empty">Нет задач со scope = ? в текущей выборке.</td></tr>';
      return;
    }

    elements.questionableTableBody.innerHTML = rows
      .map((task) => {
        const types = uniqueSorted([...task.release120Types, ...task.release121Types]).join(', ');

        return `
          <tr>
            <td>${escapeHtml(task.team)}</td>
            <td>${escapeHtml(task.category || '-')}</td>
            <td>${escapeHtml(task.description || '-')}</td>
            <td>${escapeHtml(task.release120Raw || '-')}</td>
            <td>${escapeHtml(task.release121Raw || '-')}</td>
            <td>${escapeHtml(types || '-')}</td>
            <td>${escapeHtml(task.comments || '-')}</td>
          </tr>
        `;
      })
      .join('');
  }

  function renderTeams(tasks) {
    const teams = uniqueSorted(tasks.map((task) => task.team));

    if (!teams.length) {
      elements.teamsTableBody.innerHTML = '<tr><td colspan="12" class="empty">Нет данных.</td></tr>';
      return;
    }

    const rows = teams.map((team) => {
      const group = tasks.filter((task) => task.team === team);
      const workCounts = {
        'разработка': 0,
        'тестирование': 0,
        'аналитика': 0,
        'внедрение': 0
      };

      group.forEach((task) => {
        const set = new Set([...task.release120Types, ...task.release121Types]);
        set.forEach((type) => {
          if (workCounts[type] !== undefined) {
            workCounts[type] += 1;
          }
        });
      });

      return {
        team,
        total: group.length,
        yes: group.filter((task) => task.scopeStatus === 'ДА').length,
        no: group.filter((task) => task.scopeStatus === 'НЕТ').length,
        question: group.filter((task) => task.scopeStatus === '?').length,
        r120: group.filter((task) => task.hasRelease120).length,
        r121: group.filter((task) => task.hasRelease121).length,
        unassigned: group.filter((task) => task.isUnassigned).length,
        dev: workCounts['разработка'],
        qa: workCounts['тестирование'],
        ba: workCounts['аналитика'],
        impl: workCounts['внедрение']
      };
    });

    elements.teamsTableBody.innerHTML = rows
      .map(
        (row) => `
      <tr>
        <td>${escapeHtml(row.team)}</td>
        <td>${row.total}</td>
        <td>${row.yes}</td>
        <td>${row.no}</td>
        <td>${row.question}</td>
        <td>${row.r120}</td>
        <td>${row.r121}</td>
        <td>${row.unassigned}</td>
        <td>${row.dev}</td>
        <td>${row.qa}</td>
        <td>${row.ba}</td>
        <td>${row.impl}</td>
      </tr>
    `
      )
      .join('');
  }

  function renderDiagnostics() {
    const d = state.diagnostics;

    if (!d.sheets.length) {
      elements.diagnosticsContent.innerHTML = '<div class="empty">Файл пока не загружен.</div>';
      return;
    }

    const sheetItems = d.sheets
      .map((name) => `<li>${escapeHtml(name)}: ${d.rowsPerSheet[name] || 0} строк</li>`)
      .join('');

    const columnsInfo = d.sheets
      .map((sheetName) => {
        const item = d.columnFindings[sheetName];
        if (!item) {
          return `<li>${escapeHtml(sheetName)}: нет данных по колонкам</li>`;
        }

        const foundList = Object.entries(item.found)
          .map(([key, idx]) => `${key}=${idx >= 0 ? idx + 1 : 'не найдено'}`)
          .join(', ');

        const missing = item.missing.length ? item.missing.join(', ') : 'нет';

        return `<li>${escapeHtml(sheetName)}: найдено [${escapeHtml(foundList)}], отсутствует [${escapeHtml(missing)}]</li>`;
      })
      .join('');

    const warnings = d.warnings.length
      ? `<ul class="diag-list">${d.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`
      : '<div class="empty">Предупреждений нет.</div>';

    elements.diagnosticsContent.innerHTML = `
      <div class="diag-box"><strong>Источник:</strong> ${escapeHtml(d.sourceName)}</div>
      <div class="diag-box">
        <strong>Вкладки и строки:</strong>
        <ul class="diag-list">${sheetItems}</ul>
      </div>
      <div class="diag-box">
        <strong>Найденные колонки:</strong>
        <ul class="diag-list">${columnsInfo}</ul>
      </div>
      <div class="diag-box"><strong>Задач в реестре:</strong> ${d.totalTasks}</div>
      <div class="diag-box"><strong>Предупреждения:</strong>${warnings}</div>
    `;
  }

  function refreshDynamicFilterOptions() {
    const teams = uniqueSorted(state.tasks.map((task) => task.team));

    populateSelect(elements.filterTeam, [
      { value: 'ALL', label: 'Все команды' },
      ...teams.map((team) => ({ value: team, label: team }))
    ]);

    if (!teams.includes(state.filters.team) && state.filters.team !== 'ALL') {
      state.filters.team = 'ALL';
    }

    syncGlobalFilterControls();
  }

  function syncGlobalFilterControls() {
    elements.filterTeam.value = state.filters.team;
    elements.filterScope.value = state.filters.scope;
    elements.filterRelease.value = state.filters.release;
    elements.filterWorkType.value = state.filters.workType;
  }

  function resetUnassignedFilters() {
    state.unassignedFilters = {
      scope: 'ALL',
      team: 'ALL',
      category: 'ALL'
    };
  }

  function populateSelect(select, options) {
    const current = select.value;
    select.innerHTML = options
      .map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
      .join('');

    const values = options.map((item) => item.value);
    if (values.includes(current)) {
      select.value = current;
    }
  }

  function uniqueSorted(items) {
    return Array.from(new Set(items)).sort((a, b) => a.localeCompare(b, 'ru'));
  }

  function renderScopeBadge(scopeStatus) {
    if (scopeStatus === 'ДА') {
      return '<span class="badge scope-yes">ДА</span>';
    }
    if (scopeStatus === 'НЕТ') {
      return '<span class="badge scope-no">НЕТ</span>';
    }
    if (scopeStatus === '?') {
      return '<span class="badge scope-question">?</span>';
    }
    return '-';
  }

  function addMessage(type, text) {
    const div = document.createElement('div');
    div.className = `message ${type}`;
    div.textContent = text;
    elements.messages.appendChild(div);
  }

  function clearMessages() {
    elements.messages.innerHTML = '';
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function exportTasksToCsv(tasks, fileName) {
    if (!tasks.length) {
      addMessage('warn', 'Нет данных для экспорта по текущему фильтру.');
      return;
    }

    const headers = [
      'sheetName',
      'team',
      'category',
      'stage',
      'description',
      'scopeStatus',
      'release120Raw',
      'release121Raw',
      'release120Types',
      'release121Types',
      'hasRelease120',
      'hasRelease121',
      'isUnassigned',
      'comments'
    ];

    const lines = [headers.join(',')];

    tasks.forEach((task) => {
      const row = headers.map((key) => {
        const value = task[key];
        if (Array.isArray(value)) {
          return csvEscape(value.join('/'));
        }
        if (typeof value === 'boolean') {
          return value ? 'true' : 'false';
        }
        return csvEscape(value || '');
      });
      lines.push(row.join(','));
    });

    const content = `\ufeff${lines.join('\n')}`;
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function csvEscape(value) {
    const text = String(value);
    if (/[",\n;]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  init();
})();

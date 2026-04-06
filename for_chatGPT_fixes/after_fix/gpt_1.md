Да. Собираю тебе финальный набор нод без `IF / Is Matrix Bundle?`.

Почему именно так:

* твой вход приходит **отдельными blocks/items**: `employees + employee_issues`, `matrices`, `learning_assets`
* в матрицах для QA есть роль `manual_qa_engineer`, а у сотрудника роль `qa_engineer`, значит нужен fallback/mapping
* `learning_assets` приходят отдельным блоком и там связи лежат в `matched_competencies`

Ниже готовый pipeline.

## Схема

```text
Merge
-> Code / Normalize Matrix Bundle
-> Code / Pick Employee
-> Code / Resolve Role Matrix
-> Code / Build Unified Competency Catalog
-> Code / Build Learning Assets Index
-> Code / Build Synthetic Evidence From Matrix
-> Code / Build Unified Root Contract
```

Все Code node ставь в режим **Run Once for All Items**, кроме тех, где явно удобно оставить обычный, но тут проще все сделать одинаково.

---

## 1) Code / Normalize Matrix Bundle

```javascript
const items = $input.all();
const blocks = items.map(item => item.json || {});

const employeesBlock = blocks.find(x => Array.isArray(x.employees)) || {};
const matricesBlock = blocks.find(x => Array.isArray(x.matrices)) || {};
const learningBlock = blocks.find(x => Array.isArray(x.learning_assets)) || {};

const merged = {
  employees: employeesBlock.employees || [],
  employee_issues: employeesBlock.employee_issues || [],
  matrices: matricesBlock.matrices || [],
  learning_assets: learningBlock.learning_assets || []
};

if (!merged.employees.length) {
  throw new Error('Normalize Matrix Bundle: employees is empty');
}

if (!merged.matrices.length) {
  throw new Error('Normalize Matrix Bundle: matrices is empty');
}

if (!Array.isArray(merged.learning_assets)) {
  throw new Error('Normalize Matrix Bundle: learning_assets is not an array');
}

return [{ json: merged }];
```

---

## 2) Code / Pick Employee

Если потом будешь прокидывать `target_employee_id` или `target_login`, просто добавишь их в input до этой ноды.

```javascript
const input = $input.first().json;

const employees = input.employees || [];
const targetEmployeeId = input.target_employee_id || null;
const targetLogin = input.target_login || null;

let selectedEmployee = null;

if (targetEmployeeId) {
  selectedEmployee = employees.find(
    e => String(e.employee_id) === String(targetEmployeeId)
  ) || null;
}

if (!selectedEmployee && targetLogin) {
  selectedEmployee = employees.find(
    e => String(e.login) === String(targetLogin)
  ) || null;
}

if (!selectedEmployee) {
  selectedEmployee = employees[0] || null;
}

if (!selectedEmployee) {
  throw new Error('Pick Employee: employee not found');
}

return [
  {
    json: {
      ...input,
      selected_employee: selectedEmployee
    }
  }
];
```

---

## 3) Code / Resolve Role Matrix

Тут главный фикс под твой input.

```javascript
const input = $input.first().json;

const employee = input.selected_employee;
const matrices = input.matrices || [];

if (!employee) {
  throw new Error('Resolve Role Matrix: selected_employee is missing');
}

const employeeRole = String(employee.role || '').trim().toLowerCase();
const employeePosition = String(employee.position || '').trim().toLowerCase();

if (!employeeRole) {
  throw new Error('Resolve Role Matrix: employee.role is empty');
}

const normalizeRole = (value) => String(value || '').trim().toLowerCase();

const ROLE_MAP = {
  qa_engineer: [
    'qa_engineer',
    'qa_manual',
    'manual_qa_engineer',
    'automation_qa_engineer'
  ],
  qa_manual: [
    'qa_manual',
    'manual_qa_engineer',
    'qa_engineer'
  ],
  system_analyst: [
    'system_analyst',
    'analyst',
    'business_analyst'
  ],
  analyst: [
    'analyst',
    'system_analyst',
    'business_analyst'
  ],
  developer: [
    'developer',
    'backend_developer',
    'frontend_developer',
    'fullstack_developer'
  ]
};

let selectedMatrix = matrices.find(
  m => normalizeRole(m.role) === employeeRole
) || null;

let matrixResolution = 'exact';

if (!selectedMatrix) {
  const aliases = ROLE_MAP[employeeRole] || [employeeRole];
  selectedMatrix = matrices.find(
    m => aliases.includes(normalizeRole(m.role))
  ) || null;

  if (selectedMatrix) {
    matrixResolution = 'alias';
  }
}

if (!selectedMatrix && ['qa_engineer', 'qa_manual'].includes(employeeRole)) {
  if (
    employeePosition.includes('автомат') ||
    employeePosition.includes('automation')
  ) {
    selectedMatrix = matrices.find(
      m => normalizeRole(m.role) === 'automation_qa_engineer'
    ) || null;
  } else {
    selectedMatrix = matrices.find(
      m => normalizeRole(m.role) === 'manual_qa_engineer'
    ) || null;
  }

  if (selectedMatrix) {
    matrixResolution = 'position_fallback';
  }
}

if (!selectedMatrix) {
  throw new Error(`Resolve Role Matrix: matrix not found for role "${employeeRole}"`);
}

return [
  {
    json: {
      ...input,
      selected_matrix: selectedMatrix,
      matrix_resolution: matrixResolution
    }
  }
];
```

---

## 4) Code / Build Unified Competency Catalog

Тут я сразу учел:

* в матрицах поле написано как `compentecy_groups`
* уровни у тебя бывают строковые (`нет опыта`, `начальный`, …), поэтому их **не надо насильно переводить в Number**
* `skill_categories` иногда имеют `categories`, а иногда в других форматах встречаются `skills`

```javascript
const input = $input.first().json;
const matrix = input.selected_matrix;

if (!matrix) {
  throw new Error('Build Unified Competency Catalog: selected_matrix is missing');
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[ё]/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '');
}

function detectCompetencyType(groupName, competencyName) {
  const text = `${groupName || ''} ${competencyName || ''}`.toLowerCase();

  const softHints = [
    'коммуникац',
    'лидер',
    'команд',
    'настав',
    'обратн',
    'soft',
    'личн',
    'переговор',
    'влияни',
    'заинтересован'
  ];

  return softHints.some(h => text.includes(h)) ? 'soft' : 'hard';
}

const roleId = matrix.role || null;
const groups = matrix.compentecy_groups || [];
const skillCategories = matrix.skill_categories || [];

const normalizedSkillCategories = skillCategories.map(cat => {
  const rawSkills = Array.isArray(cat.categories)
    ? cat.categories
    : Array.isArray(cat.skills)
    ? cat.skills
    : [];

  return {
    category: cat.category || null,
    role: cat.role || null,
    skills: rawSkills.map(skill => ({
      skill: skill.skill || skill.name || null,
      description: skill.description || ''
    }))
  };
});

const competencies = [];

for (const group of groups) {
  const groupName = group.group_name || 'unknown_group';

  for (const comp of (group.competencies || [])) {
    const competencyName = comp.competency_name || 'unknown_competency';

    competencies.push({
      competency_id: slugify(competencyName),
      competency_name: competencyName,
      group_name: groupName,
      role_id: roleId,
      type: detectCompetencyType(groupName, competencyName),
      levels: (comp.levels || []).map((levelObj, index) => ({
        level_rank: index,
        level: levelObj.level ?? null,
        description: levelObj.description || ''
      })),
      signals: {
        jira: [],
        behavioral: [],
        skill_categories: normalizedSkillCategories
      }
    });
  }
}

return [
  {
    json: {
      ...input,
      unified_competency_catalog: {
        role_id: roleId,
        competencies,
        skill_categories: normalizedSkillCategories
      }
    }
  }
];
```

---

## 5) Code / Build Learning Assets Index

Эта версия работает и с твоим отдельным `input_example_learning_assets`, и с уже нормализованным merged-форматом.

```javascript
const input = $input.first().json;

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[ё]/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '');
}

const assets = input.learning_assets || [];

const learningCatalog = assets.map(asset => {
  const matched = Array.isArray(asset.matched_competencies)
    ? asset.matched_competencies
    : Array.isArray(asset.competencies)
    ? asset.competencies.map(name => ({ name, score: null, reason: null }))
    : [];

  return {
    id: asset.id || null,
    title: asset.title || slugify(asset.name || asset.original_title || ''),
    original_title: asset.original_title || asset.name || null,
    competencies: matched.map(mc => ({
      competency_id: slugify(mc.name || mc),
      competency_name: mc.name || mc,
      score: mc.score ?? null,
      reason: mc.reason ?? null
    })),
    matched_competencies_count: matched.length
  };
});

const byCompetency = {};

for (const asset of learningCatalog) {
  for (const comp of asset.competencies) {
    const key = comp.competency_id;
    if (!byCompetency[key]) {
      byCompetency[key] = [];
    }

    byCompetency[key].push({
      id: asset.id,
      title: asset.title,
      original_title: asset.original_title,
      score: comp.score,
      reason: comp.reason
    });
  }
}

for (const key of Object.keys(byCompetency)) {
  byCompetency[key].sort((a, b) => {
    const aScore = a.score ?? -1;
    const bScore = b.score ?? -1;
    return bScore - aScore;
  });
}

return [
  {
    json: {
      ...input,
      learning_catalog: learningCatalog,
      learning_assets_by_competency: byCompetency
    }
  }
];
```

---

## 6) Code / Build Synthetic Evidence From Matrix

```javascript
const input = $input.first().json;

const employeeIssues = input.employee_issues || [];
const competencies =
  input.unified_competency_catalog?.competencies || [];

const assessmentMode =
  employeeIssues.length > 0 ? 'matrix_plus_issues' : 'matrix_only';

const syntheticEvidence = competencies.map(comp => ({
  competency_id: comp.competency_id,
  evidence_type: 'matrix_definition',
  source: 'matrix_bundle_v1',
  factual_performance_evidence: false,
  matrix_levels_available: (comp.levels || []).map(l => l.level)
}));

return [
  {
    json: {
      ...input,
      assessment_mode: assessmentMode,
      performance_inference_allowed: employeeIssues.length > 0,
      development_inference_allowed: true,
      synthetic_evidence: syntheticEvidence
    }
  }
];
```

---

## 7) Code / Build Unified Root Contract

Это уже финальный объект, который дальше можно отдавать в твой существующий pipeline.

```javascript
const input = $input.first().json;
const e = input.selected_employee;

if (!e) {
  throw new Error('Build Unified Root Contract: selected_employee is missing');
}

return [
  {
    json: {
      employee: {
        employee_id: e.employee_id || null,
        full_name: e.full_name || null,
        email: e.email || null,
        login: e.login || null,
        role_id: e.role || null,
        grade_id: e.grade || null,
        position: e.position || null,
        team: e.team || null
      },

      workflow_config: {
        lookback_days: 180,
        include_competencies_without_self_assessment: true,
        include_competencies_without_evidence: true,
        assessment_mode: input.assessment_mode || 'matrix_only',
        performance_inference_allowed: !!input.performance_inference_allowed,
        development_inference_allowed: !!input.development_inference_allowed,
        features: {
          development: true,
          one2one: true,
          promotion: true,
          learning_recommendations: true
        }
      },

      competency_catalog: input.unified_competency_catalog || {
        role_id: null,
        competencies: [],
        skill_categories: []
      },

      learning_catalog: {
        assets: input.learning_catalog || [],
        by_competency: input.learning_assets_by_competency || {}
      },

      assessment_input: {
        self_assessments: []
      },

      scoring_input: {
        source: 'matrix_bundle_v1',
        matrix_resolution: input.matrix_resolution || null
      },

      employee_issues: input.employee_issues || [],

      normalized: {
        issues: [],
        evidence_trace: [],
        synthetic_evidence: input.synthetic_evidence || []
      },

      meta: {
        adapter_version: 'matrix_adapter_v3'
      }
    }
  }
];
```

---

## Что удалить

Удаляй полностью:

* `IF / Is Matrix Bundle?`
* `Code / Detect Input Format`

Они больше не нужны.

---

## Что важно проверить в n8n

У `Code / Normalize Matrix Bundle` обязательно:

* **Mode = Run Once for All Items**

Иначе опять возьмется только первый item.

---

## Что получится на выходе

На выходе последней ноды у тебя будет единый объект вида:

```json
{
  "employee": {...},
  "workflow_config": {...},
  "competency_catalog": {...},
  "learning_catalog": {...},
  "assessment_input": {
    "self_assessments": []
  },
  "scoring_input": {...},
  "employee_issues": [],
  "normalized": {...},
  "meta": {...}
}
```

---

## Где еще может стрельнуть

Есть один тонкий момент: в твоих данных часть learning assets уже бывает в **преднормализованном** виде с полями `title`, `original_title`, `competencies`, а часть — в исходном виде с `name`, `matched_competencies`. Это я уже закрыл в `Build Learning Assets Index`.

---

Если хочешь, следующим сообщением я соберу тебе уже **цельный n8n workflow JSON** с этими нодами и связями, чтобы ты просто вставил его в импорт.

Да. Ниже — как я бы расписал эти 4 ноды в твоем текущем пайплайне для `matrix_only` / `matrix_plus_issues`.

Логика тут такая:

* `Build Competency Payloads v2` собирает payload **по каждой компетенции** из root contract: matrix levels, self-assessment, synthetic evidence, learning assets
* потом LLM анализирует каждую компетенцию
* `Build IDP Payload v2` собирает агрегированный payload для LLM по IDP из результатов competency analysis 
* `Build One2One Employee Payload v2` и `Build One2One Manager Payload v2` уже берут summary + idp + top competency/focus areas и готовят отдельные payloads для двух разных one-to-one промптов 

---

# 1) `Code / Build Competency Payloads v2`

### Зачем нужна

Эта нода должна взять:

* `employee`
* `competency_catalog.competencies`
* `assessment_input.self_assessments`
* `normalized.synthetic_evidence`
* `learning_catalog.by_competency`
* флаги `assessment_mode`, `performance_inference_allowed`, `development_inference_allowed`

И выдать **по одному item на компетенцию**.

Это как раз соответствует идее из старого описания: для каждой компетенции payload должен включать matrix levels, self-assessment, evidence и internal learning assets .

### Вход

Из `Code / Build Unified Root Contract`

### Режим

`Run Once for All Items`

### Код

```javascript
function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

const root = $input.first().json;

const competencies = safeArray(root.competency_catalog?.competencies);
const selfAssessments = safeArray(root.assessment_input?.self_assessments);
const syntheticEvidence = safeArray(root.normalized?.synthetic_evidence);
const learningByCompetency = root.learning_catalog?.by_competency || {};

const selfByCompetency = {};
for (const item of selfAssessments) {
  if (item?.competency_id) {
    selfByCompetency[item.competency_id] = item;
  }
}

const syntheticByCompetency = {};
for (const item of syntheticEvidence) {
  if (!item?.competency_id) continue;
  if (!syntheticByCompetency[item.competency_id]) {
    syntheticByCompetency[item.competency_id] = [];
  }
  syntheticByCompetency[item.competency_id].push(item);
}

return competencies.map(comp => {
  const competencyId = comp.competency_id;
  const self = selfByCompetency[competencyId] || null;

  return {
    json: {
      employee: root.employee,

      assessment_mode: root.workflow_config?.assessment_mode || 'matrix_only',
      performance_inference_allowed: !!root.workflow_config?.performance_inference_allowed,
      development_inference_allowed: !!root.workflow_config?.development_inference_allowed,

      competency_id: competencyId,
      competency_name: comp.competency_name || competencyId,
      group_name: comp.group_name || null,
      type: comp.type || 'unknown',

      levels: safeArray(comp.levels),
      signals: comp.signals || {
        jira: [],
        behavioral: [],
        skill_categories: []
      },

      self_assessment: self ? {
        self_level: self.self_level ?? null,
        self_comment: self.self_comment || '',
        manager_level: self.manager_level ?? null,
        manager_comment: self.manager_comment || '',
        assessment_date: self.assessment_date || null,
        source: self.source || 'uploaded_self_assessment'
      } : null,

      evidence: [],
      synthetic_evidence: safeArray(syntheticByCompetency[competencyId]),
      internal_learning_assets: safeArray(learningByCompetency[competencyId]).slice(0, 5),

      meta: {
        source: 'build_competency_payloads_v2'
      }
    }
  };
});
```

---

## Что дальше после этой ноды

После нее у тебя идет:

* `LLM / Analyze One Competency`
* `Code / Normalize Competency Result`

То есть один item = одна компетенция.

---

# 2) `LLM / Analyze One Competency`

Это не code node, но без него следующая нода бессмысленна, поэтому сразу дам, как я бы зафиксировал prompt.

### System

```text
Ты анализируешь одну компетенцию сотрудника для карьерного и развивающего отчета.

Правила:
- Используй только переданные данные
- Если assessment_mode = matrix_only:
  - не делай уверенный вывод о фактическом уровне сотрудника
  - не делай performance verdict
  - используй matrix как baseline role expectation
  - если factual evidence отсутствует, confidence должен быть low
  - фокусируйся на development guidance, readiness gaps и learning recommendations
- Если есть self_assessment, используй его как сигнал самооценки, а не как доказанный факт
- Не путай отсутствие evidence с отсутствием компетенции

Верни строго JSON без markdown.
```

### User

```text
Верни JSON:
{
  "competency_id": "string",
  "self_level": "string|null",
  "estimated_level": "string|null",
  "confidence": "low|medium|high",
  "priority": "low|medium|high",
  "assessment": "string",
  "development_focus": "string",
  "evidence_missing": ["string"],
  "risk_flags": ["string"]
}

Данные:
{{ JSON.stringify($json) }}
```

---

# 3) `Code / Normalize Competency Result`

Она не у тебя в списке, но это обязательная промежуточная нода между competency analysis и IDP.

Нужна для того, чтобы:

* привести LLM output к стабильной схеме
* не падать, если модель вернула кривой JSON
* сделать `priority`, `confidence`, `risk_flags`, `evidence_missing` предсказуемыми

### Режим

`Run Once for Each Item`

### Код

```javascript
function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

const x = $json || {};

return [{
  json: {
    competency_id: x.competency_id || null,
    self_level: x.self_level ?? null,
    estimated_level: x.estimated_level ?? null,
    confidence: ['low', 'medium', 'high'].includes(x.confidence) ? x.confidence : 'low',
    priority: ['low', 'medium', 'high'].includes(x.priority) ? x.priority : 'medium',
    assessment: x.assessment || '',
    development_focus: x.development_focus || '',
    evidence_missing: safeArray(x.evidence_missing),
    risk_flags: safeArray(x.risk_flags)
  }
}];
```

---

# 4) `Code / Build IDP Payload v2`

Вот это уже почти один в один из старого описания: нода работает **после `Code / Normalize Competency Result`**, берет competency results, matrix levels, learning assets, employee context и assessment mode, а затем собирает `idp_input` .

### Зачем нужна

Она агрегирует все результаты competency analysis в один payload для `LLM / Build IDP`.

### Вход

* items из `Code / Normalize Competency Result`
* root из `Code / Build Unified Root Contract`

### Режим

`Run Once for All Items`

### Код

```javascript
function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

const competencyResults = $input.all().map(i => i.json);
const root = $item(0).$node["Code / Build Unified Root Contract"].json;

const competencies = safeArray(root.competency_catalog?.competencies);
const competencyById = {};

for (const c of competencies) {
  competencyById[c.competency_id] = c;
}

const learningByCompetency = root.learning_catalog?.by_competency || {};
const assessmentMode = root.workflow_config?.assessment_mode || 'matrix_only';

const idpInput = competencyResults.map(r => {
  const comp = competencyById[r.competency_id] || {};
  const selfLevel = r.self_level ?? null;
  const estimatedLevel = r.estimated_level ?? null;

  let gap = null;
  if (
    selfLevel !== null &&
    selfLevel !== undefined &&
    estimatedLevel !== null &&
    estimatedLevel !== undefined &&
    typeof selfLevel === 'number' &&
    typeof estimatedLevel === 'number'
  ) {
    gap = estimatedLevel - selfLevel;
  }

  return {
    competency_id: r.competency_id,
    competency_name: comp.competency_name || r.competency_id,
    group_name: comp.group_name || null,
    type: comp.type || 'unknown',

    self_level: selfLevel,
    estimated_level: estimatedLevel,
    confidence: r.confidence || 'low',
    priority: r.priority || 'medium',
    assessment: r.assessment || '',
    development_focus: r.development_focus || '',
    evidence_missing: safeArray(r.evidence_missing),
    risk_flags: safeArray(r.risk_flags),

    matrix_levels: safeArray(comp.levels),
    internal_learning_assets: safeArray(learningByCompetency[r.competency_id]).slice(0, 5),

    inferred_gap: gap
  };
});

return [{
  json: {
    employee: root.employee,
    assessment_mode: assessmentMode,
    performance_inference_allowed: !!root.workflow_config?.performance_inference_allowed,
    development_inference_allowed: !!root.workflow_config?.development_inference_allowed,
    idp_input: idpInput
  }
}];
```

### Что должен получать `LLM / Build IDP`

Именно такой prompt у тебя и должен быть: не делать выводы о плохом performance в `matrix_only`, использовать matrix как role expectation baseline, рекомендовать mix из project work / learning / mentoring / reading, а internal learning assets приоритизировать .

### System

```text
Ты создаешь индивидуальный план развития сотрудника.

Правила:
- Используй только переданные данные
- Если assessment_mode = matrix_only, не делай выводы о слабом performance
- В matrix_only режиме ориентируйся на role expectations из matrix и development opportunities
- Действия должны быть конкретными, выполнимыми и проверяемыми
- Используй mix: project work, learning, mentoring, reading, review practice
- Если есть internal learning assets, приоритизируй их
- Не ограничивайся только обучением: включай рабочие действия

Верни строго JSON без markdown.
```

### User

```text
Верни JSON:
{
  "idp": [
    {
      "competency_id": "string",
      "goal": "string",
      "priority": "low|medium|high",
      "actions": [
        {
          "type": "task|learning|mentoring|project|reading",
          "description": "string",
          "effort": "low|medium|high"
        }
      ],
      "success_criteria": ["string"],
      "timeframe": "string"
    }
  ]
}

Данные:
{{ JSON.stringify($json) }}
```

---

# 5) `Code / Build One2One Employee Payload v2`

Это уже прямо из предыдущего описания: нода берет competency results, employee summary, idp и root, потом выделяет top competencies и собирает payload для one-to-one со стороны сотрудника .

### Зачем нужна

Подготовить сотрудника к 1:1:

* на что опереться
* что подсветить
* какие growth topics обсудить
* какие вопросы задать менеджеру

### Режим

`Run Once for All Items`

### Код

```javascript
function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

const competencyResults = $items("Code / Normalize Competency Result", 0, 0).map(i => i.json);
const employeeSummary = $items("LLM / Build Employee Summary", 0, 0)[0]?.json || {};
const idp = $items("LLM / Build IDP", 0, 0)[0]?.json || {};
const root = $item(0).$node["Code / Build Unified Root Contract"].json;

const topCompetencies = competencyResults
  .filter(x => ['high', 'medium'].includes(x.priority))
  .slice(0, 5)
  .map(x => ({
    competency_id: x.competency_id,
    development_focus: x.development_focus || '',
    assessment: x.assessment || '',
    evidence_missing: safeArray(x.evidence_missing)
  }));

return [{
  json: {
    employee: root.employee,
    assessment_mode: root.workflow_config?.assessment_mode || 'matrix_only',
    performance_inference_allowed: !!root.workflow_config?.performance_inference_allowed,
    development_inference_allowed: !!root.workflow_config?.development_inference_allowed,

    summary: employeeSummary,
    top_competencies: topCompetencies,
    idp: idp.idp || [],

    guidance: {
      audience: 'employee',
      tone: 'reflective_and_actionable'
    }
  }
}];
```

### Prompt для `LLM / One2One Employee`

Старое описание тут тоже правильное: в `matrix_only` не формулировать выводы как performance verdict, фокус на рефлексии, карьерном развитии и выборе возможностей роста .

#### System

```text
Ты готовишь сотрудника к one-to-one.

Правила:
- Используй только переданные данные
- Если assessment_mode = matrix_only, не формулируй выводы как performance verdict
- В matrix_only режиме фокусируйся на рефлексии, карьерном развитии, выборе возможностей роста
- Вопросы должны быть конкретными и полезными
- Избегай обвинительного тона

Верни строго JSON без markdown.
```

#### User

```text
Верни JSON:
{
  "reflection_questions": ["string"],
  "achievements_to_highlight": ["string"],
  "growth_topics": ["string"],
  "questions_to_manager": ["string"]
}

Данные:
{{ JSON.stringify($json) }}
```

---

# 6) `Code / Build One2One Manager Payload v2`

Эта нода делает такую же подготовку, но уже для руководителя: key topics, risk areas, support actions, questions to employee. В старой версии она строится на `focus_areas` из top priority competency results и summary + IDP .

### Режим

`Run Once for All Items`

### Код

```javascript
function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

const competencyResults = $items("Code / Normalize Competency Result", 0, 0).map(i => i.json);
const employeeSummary = $items("LLM / Build Employee Summary", 0, 0)[0]?.json || {};
const idp = $items("LLM / Build IDP", 0, 0)[0]?.json || {};
const root = $item(0).$node["Code / Build Unified Root Contract"].json;

const focusAreas = competencyResults
  .filter(x => ['high', 'medium'].includes(x.priority))
  .slice(0, 5)
  .map(x => ({
    competency_id: x.competency_id,
    confidence: x.confidence || 'low',
    risk_flags: safeArray(x.risk_flags),
    evidence_missing: safeArray(x.evidence_missing),
    development_focus: x.development_focus || ''
  }));

return [{
  json: {
    employee: root.employee,
    assessment_mode: root.workflow_config?.assessment_mode || 'matrix_only',
    performance_inference_allowed: !!root.workflow_config?.performance_inference_allowed,
    development_inference_allowed: !!root.workflow_config?.development_inference_allowed,

    summary: employeeSummary,
    focus_areas: focusAreas,
    idp: idp.idp || [],

    guidance: {
      audience: 'manager',
      tone: 'supportive_and_specific'
    }
  }
}];
```

### Prompt для `LLM / One2One Manager`

#### System

```text
Ты готовишь руководителя к one-to-one с сотрудником.

Правила:
- Используй только переданные данные
- Если assessment_mode = matrix_only, не оценивай performance по отсутствующим Jira/activity данным
- В matrix_only режиме фокусируйся на поддержке развития, калибровке ожиданий, выборе next-step opportunities
- Не делай обвинительных или карательных выводов
- Предлагай конкретные темы разговора и действия поддержки

Верни строго JSON без markdown.
```

#### User

```text
Верни JSON:
{
  "key_topics": ["string"],
  "risk_areas": ["string"],
  "questions_to_employee": ["string"],
  "feedback_points": ["string"],
  "support_actions": ["string"]
}

Данные:
{{ JSON.stringify($json) }}
```

---

# 7) Как их соединить в workflow

Вот практическая цепочка:

```text
Code / Build Unified Root Contract
-> Code / Build Competency Payloads v2
-> LLM / Analyze One Competency
-> Code / Normalize Competency Result
-> Code / Build Matrix-Only Summary Payload
-> LLM / Build Employee Summary
-> Code / Build IDP Payload v2
-> LLM / Build IDP
-> Code / Build One2One Employee Payload v2
-> LLM / One2One Employee
-> Code / Build One2One Manager Payload v2
-> LLM / One2One Manager
```

Это соответствует flow для `matrix_only`, который раньше и обсуждался: после adapter layer строить synthetic evidence, competency analysis, затем summary, IDP и one2one без сильных performance verdicts .

---

# 8) Где обычно ломается

Самые частые проблемы тут такие:

### 1. Нода запускается не в том mode

Для:

* `Build Competency Payloads v2`
* `Build IDP Payload v2`
* `Build One2One Employee Payload v2`
* `Build One2One Manager Payload v2`

ставь `Run Once for All Items`, кроме случая, когда ты специально работаешь item-by-item.

### 2. Несовпадение имен нод

В коде есть жесткие ссылки:

* `"Code / Build Unified Root Contract"`
* `"Code / Normalize Competency Result"`
* `"LLM / Build Employee Summary"`
* `"LLM / Build IDP"`

Если у тебя в workflow названия другие, нужно заменить строки. Это уже отдельно отмечалось и для финальной snapshot-ноды .

### 3. `estimated_level` может быть строкой

У тебя в matrix примерах level бывает и числовой строкой (`"0"`, `"1"`), и текстом (`"начальный"`, `"средний"`, `"экспертный"`) .
Поэтому в `Build IDP Payload v2` я специально считаю `inferred_gap` только если оба значения реально numeric.

### 4. Пустой self-assessment — это нормально

Для `matrix_only` это нормальный кейс. Отсутствие self-assessment не должно ломать payload.

---

# 9) Что я бы еще добавил рядом

Сразу после `Code / Build Unified Root Contract` я бы держал еще одну служебную ноду:

## `Code / Build Final Output Flags`

Она уже раньше предлагалась: возвращает `assessment_mode`, `data_completeness`, `performance_inference_allowed`, `development_inference_allowed`, чтобы UI и финальная snapshot-сборка не угадывали эти значения .

```javascript
const root = $item(0).$node["Code / Build Unified Root Contract"].json;

return [{
  json: {
    assessment_mode: root.workflow_config?.assessment_mode || 'matrix_only',
    data_completeness:
      (root.employee_issues || []).length > 0 ? 'medium' : 'low',
    performance_inference_allowed: !!root.workflow_config?.performance_inference_allowed,
    development_inference_allowed: !!root.workflow_config?.development_inference_allowed
  }
}];
```

---

# 10) Мой практический порядок внедрения

Я бы делал так:

1. `Build Competency Payloads v2`
2. `LLM / Analyze One Competency`
3. `Normalize Competency Result`
4. `Build IDP Payload v2`
5. `LLM / Build IDP`
6. `Build One2One Employee Payload v2`
7. `Build One2One Manager Payload v2`

Потому что если сначала не стабилизировать competency results, то IDP и оба one2one будут просто каскадно собирать мусор.

Если хочешь, следующим сообщением я распишу еще две недостающие ноды из этой цепочки:

* `Code / Build Matrix-Only Summary Payload`
* `LLM / Build Employee Summary` prompt + `Code / Build Final Snapshot` как финальную сборку.

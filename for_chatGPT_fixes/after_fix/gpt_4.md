Да. Ниже — две недостающие части:

1. `Code / Build Matrix-Only Summary Payload`
2. `LLM / Build Employee Summary`
3. `Code / Build Final Snapshot`

Это как раз продолжает flow для `matrix_only`, который у тебя и нужен: без Jira-summary как основного источника, с явными флагами `assessment_mode`, `data_completeness`, `performance_inference_allowed`, `development_inference_allowed` .
И общий рекомендованный flow там такой: adapter → competency analysis → summary → IDP → one2one → final snapshot .

---

## 1) `Code / Build Matrix-Only Summary Payload`

Эта нода нужна, чтобы **не пускать обычный Jira summary** в `matrix_only`. Это прямо соответствует твоей логике: в matrix-only summary должен описывать зоны развития, ориентир на role expectations и нехватку данных, а не делать performance judgment .

### Режим

`Run Once for All Items`

### Что берет

* все results из `Code / Normalize Competency Result`
* root contract из `Code / Build Unified Root Contract`

### Код

```javascript
function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

const competencyResults = $input.all().map(i => i.json);
const root = $item(0).$node["Code / Build Unified Root Contract"].json;

const assessmentMode = root.workflow_config?.assessment_mode || 'matrix_only';

const strengths = competencyResults
  .filter(x => ['medium', 'high'].includes(x.confidence) && x.priority !== 'high')
  .slice(0, 5);

const growthAreas = competencyResults
  .filter(x => x.priority === 'high' || (safeArray(x.evidence_missing).length > 0))
  .slice(0, 7);

return [{
  json: {
    employee: root.employee,
    assessment_mode: assessmentMode,
    performance_inference_allowed: !!root.workflow_config?.performance_inference_allowed,
    development_inference_allowed: !!root.workflow_config?.development_inference_allowed,

    competencies: competencyResults,

    summary_hints: {
      strengths: strengths.map(x => ({
        competency_id: x.competency_id,
        assessment: x.assessment || '',
        development_focus: x.development_focus || ''
      })),
      growth_areas: growthAreas.map(x => ({
        competency_id: x.competency_id,
        assessment: x.assessment || '',
        development_focus: x.development_focus || '',
        evidence_missing: safeArray(x.evidence_missing)
      }))
    },

    meta: {
      source: 'build_matrix_only_summary_payload'
    }
  }
}];
```

---

## 2) `LLM / Build Employee Summary`

Это отдельный LLM step, который работает **после** `Build Matrix-Only Summary Payload`.
Правило для него уже хорошо зафиксировано: в `matrix_only` не оценивать performance по Jira/activity, а summary должен описывать зоны развития, role expectations как ориентир и нехватку данных .

### Node name

`LLM / Build Employee Summary`

### System prompt

```text
Ты строишь summary по компетенциям сотрудника.

Правила:
- Используй только переданные данные
- Если assessment_mode = matrix_only, не оценивай performance по Jira/activity
- В matrix_only режиме summary должен описывать:
  - зону развития
  - соответствие role expectations как ориентир
  - где не хватает данных
- Не путай отсутствие данных с отсутствием компетенции
- Если confidence низкий, прямо отмечай ограниченность данных
- Не делай категоричных выводов о фактической эффективности сотрудника

Верни строго JSON без markdown.
```

### User prompt

```text
Верни JSON:
{
  "overall_summary": "string",
  "strengths": ["string"],
  "growth_areas": ["string"],
  "alignment": {
    "overestimated": ["string"],
    "underestimated": ["string"],
    "aligned": ["string"]
  },
  "top_priorities_next_6m": ["string"],
  "confidence": "low|medium|high"
}

Данные:
{{ JSON.stringify($json) }}
```

### Что ожидается на выходе

Примерно так:

```json
{
  "overall_summary": "По матрице и доступным сигналам сотрудник выглядит как ...",
  "strengths": [
    "..."
  ],
  "growth_areas": [
    "..."
  ],
  "alignment": {
    "overestimated": [],
    "underestimated": [],
    "aligned": []
  },
  "top_priorities_next_6m": [
    "..."
  ],
  "confidence": "low"
}
```

---

## 3) `Code / Build Final Output Flags`

Эту ноду очень советую вставить перед финальной snapshot-сборкой. Она была отдельно рекомендована, чтобы UI и downstream-логика не угадывали режим анализа .

### Режим

`Run Once for All Items`

### Код

```javascript
const root = $item(0).$node["Code / Build Unified Root Contract"].json;

return [{
  json: {
    assessment_mode: root.workflow_config?.assessment_mode || 'matrix_only',
    data_completeness:
      (Array.isArray(root.employee_issues) && root.employee_issues.length > 0)
        ? 'medium'
        : 'low',
    performance_inference_allowed: !!root.workflow_config?.performance_inference_allowed,
    development_inference_allowed: !!root.workflow_config?.development_inference_allowed
  }
}];
```

---

## 4) `Code / Build Final Snapshot`

Это финальная сборочная нода. Ее идея уже была сформулирована: она должна собирать единый output contract для `legacy/full`, `matrix_only` и `matrix_plus_issues`, а дальше этот JSON можно хранить в Postgres, отдавать в API и использовать в UI .

### Куда ставить

В самом конце, после:

* `Code / Normalize Competency Result`
* `LLM / Build Employee Summary`
* `LLM / Build IDP`
* `LLM / One2One Employee`
* `LLM / One2One Manager`
* опционально `Code / Build Final Output Flags`

Это тоже совпадает с ранее описанной схемой финальной ноды .

### Режим

`Run Once for All Items`

### Код

```javascript
function getNodeJson(nodeName, fallback = null) {
  try {
    const nodeItems = $items(nodeName, 0, 0);
    if (nodeItems && nodeItems.length > 0) {
      return nodeItems[0].json;
    }
  } catch (e) {}
  return fallback;
}

function getNodeItems(nodeName) {
  try {
    return $items(nodeName, 0, 0).map(i => i.json);
  } catch (e) {
    return [];
  }
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function nowIso() {
  return new Date().toISOString();
}

function buildOverviewProjection(snapshot) {
  return {
    employee_id: snapshot.employee.employee_id,
    generated_at: snapshot.meta.generated_at,
    full_name: snapshot.employee.full_name,
    role_id: snapshot.employee.role_id,
    grade_id: snapshot.employee.grade_id,
    overall_summary: snapshot.summary?.employee_summary?.overall_summary || '',
    strengths: safeArray(snapshot.summary?.employee_summary?.strengths),
    growth_areas: safeArray(snapshot.summary?.employee_summary?.growth_areas),
    confidence:
      snapshot.summary?.employee_summary?.confidence ||
      snapshot.analysis?.confidence?.overall ||
      'low',
    manual_review_required: !!snapshot.analysis?.guardrails?.manual_review_required,
    career_readiness: snapshot.career?.promotion_readiness || null
  };
}

function buildCompetenciesProjection(snapshot) {
  return {
    employee_id: snapshot.employee.employee_id,
    generated_at: snapshot.meta.generated_at,
    items: safeArray(snapshot.competencies?.results)
  };
}

function buildIdpProjection(snapshot) {
  return {
    employee_id: snapshot.employee.employee_id,
    generated_at: snapshot.meta.generated_at,
    strategy: snapshot.development?.strategy || {
      focus_mode: 'stabilizing',
      primary_levers: [],
      rationale: ''
    },
    idp: safeArray(snapshot.development?.idp),
    learning_internal: safeArray(snapshot.development?.learning?.internal),
    learning_external: safeArray(snapshot.development?.learning?.external)
  };
}

function buildOne2OneProjection(snapshot) {
  return {
    employee_id: snapshot.employee.employee_id,
    generated_at: snapshot.meta.generated_at,
    employee_one2one: snapshot.one2one?.employee || {},
    manager_one2one: snapshot.one2one?.manager || {}
  };
}

const root =
  getNodeJson("Code / Build Unified Root Contract") ||
  getNodeJson("Code / Build Full Jira Input") ||
  {};

const competencyResults =
  getNodeItems("Code / Normalize Competency Result");

const employeeSummary =
  getNodeJson("LLM / Build Employee Summary", {});

const jiraSummary =
  getNodeJson("LLM / Jira Summary", null);

const idp =
  getNodeJson("LLM / Build IDP", { idp: [] });

const one2oneEmployee =
  getNodeJson("LLM / One2One Employee", {});

const one2oneManager =
  getNodeJson("LLM / One2One Manager", {});

const developmentStrategy =
  getNodeJson("LLM / Development Strategy", null);

const mentorshipSuggestions =
  getNodeJson("LLM / Mentorship Suggestions", { mentorship_suggestions: [] });

const externalLearningSuggestions =
  getNodeJson("LLM / External Learning Suggestions", { learning_suggestions: [] });

const outputFlags =
  getNodeJson("Code / Build Final Output Flags", {});

const guardrails =
  root.analysis?.guardrails ||
  getNodeJson("Code / Build Guardrail Flags", { guardrails: {} })?.guardrails ||
  {
    manual_review_required: false,
    reasons: []
  };

const coverageMap =
  root.analysis?.coverage_map ||
  getNodeJson("Code / Build Coverage Map", { coverage_map: [] })?.coverage_map ||
  [];

const confidenceSignals =
  root.analysis?.confidence?.signals ||
  getNodeJson("Code / Compute Confidence Signals", { confidence_signals: {} })?.confidence_signals ||
  {};

const outliers =
  root.analysis?.outliers ||
  getNodeJson("Code / Detect Outliers", { outliers: [] })?.outliers ||
  [];

const gradeGap =
  root.career?.grade_gap ||
  getNodeJson("Code / Compute Grade Gap", { grade_gap: [] })?.grade_gap ||
  [];

const promotionReadiness =
  root.career?.promotion_readiness ||
  getNodeJson("Code / Compute Promotion Heuristics", { promotion_readiness: {} })?.promotion_readiness ||
  {
    current_grade_fit: "partial",
    next_grade: "",
    readiness: "not_ready",
    blockers: []
  };

const assessmentMode =
  outputFlags.assessment_mode ||
  root.workflow_config?.assessment_mode ||
  "full";

const performanceInferenceAllowed =
  outputFlags.performance_inference_allowed !== undefined
    ? outputFlags.performance_inference_allowed
    : !!root.workflow_config?.performance_inference_allowed;

const developmentInferenceAllowed =
  outputFlags.development_inference_allowed !== undefined
    ? outputFlags.development_inference_allowed
    : !!root.workflow_config?.development_inference_allowed;

const dataCompleteness =
  outputFlags.data_completeness ||
  ((safeArray(root.employee_issues).length > 0 || safeArray(root.issues).length > 0)
    ? "medium"
    : "low");

const employee = root.employee || {
  employee_id: null,
  full_name: null,
  email: null,
  role_id: null,
  grade_id: null
};

const metaGeneratedAt = nowIso();

const assessmentId =
  root.meta?.assessment_id ||
  root.assessment_id ||
  metaGeneratedAt.replace(/[-:.TZ]/g, '').slice(0, 14) +
    "_" +
    (employee.employee_id || "unknown");

const internalLearning =
  safeArray(root.learning_catalog?.assets).length > 0
    ? safeArray(root.learning_catalog.assets)
    : safeArray(getNodeJson("Code / Match Internal Trainings", { learning_recommendations: [] })?.learning_recommendations);

const snapshot = {
  meta: {
    version: "v2",
    assessment_id: assessmentId,
    generated_at: metaGeneratedAt,
    status: "completed",
    source: root.scoring_input?.source || "workflow",
    lookback_days: root.workflow_config?.lookback_days || 180,
    snapshot_hash: root.meta?.snapshot_hash || "",
    source_max_updated_at: root.meta?.source_max_updated_at || null
  },

  employee: {
    employee_id: employee.employee_id || null,
    full_name: employee.full_name || null,
    email: employee.email || null,
    role_id: employee.role_id || null,
    grade_id: employee.grade_id || null,
    team_id: employee.team || employee.team_id || null,
    manager_id: employee.manager_id || null,
    login: employee.login || null,
    position: employee.position || null
  },

  analysis: {
    assessment_mode: assessmentMode,
    data_completeness: dataCompleteness,
    performance_inference_allowed: performanceInferenceAllowed,
    development_inference_allowed: developmentInferenceAllowed,

    coverage_map: coverageMap,
    confidence: {
      overall: employeeSummary.confidence || "low",
      signals: confidenceSignals
    },
    guardrails: guardrails,
    outliers: outliers
  },

  competencies: {
    results: competencyResults
  },

  summary: {
    employee_summary: employeeSummary,
    jira_summary: jiraSummary || {
      overall_summary:
        assessmentMode === "matrix_only"
          ? "Jira-based activity summary is not available in matrix-only mode."
          : "",
      activity_level: "low",
      delivery_assessment: "",
      engineering_signal: "",
      risks: assessmentMode === "matrix_only"
        ? ["No Jira/activity evidence available for delivery summary"]
        : [],
      confidence: "low"
    }
  },

  development: {
    strategy: developmentStrategy?.strategy || {
      focus_mode: "stabilizing",
      primary_levers: [],
      rationale: ""
    },
    idp: safeArray(idp.idp),
    learning: {
      internal: internalLearning,
      external: safeArray(externalLearningSuggestions.learning_suggestions),
      mentorship: safeArray(mentorshipSuggestions.mentorship_suggestions)
    }
  },

  one2one: {
    employee: one2oneEmployee || {},
    manager: one2oneManager || {}
  },

  career: {
    grade_gap: safeArray(gradeGap),
    promotion_readiness: promotionReadiness
  }
};

const overview = buildOverviewProjection(snapshot);
const competenciesProjection = buildCompetenciesProjection(snapshot);
const idpProjection = buildIdpProjection(snapshot);
const one2oneProjection = buildOne2OneProjection(snapshot);

return [{
  json: {
    snapshot,
    projections: {
      overview,
      competencies: competenciesProjection,
      idp: idpProjection,
      one2one: one2oneProjection
    }
  }
}];
```

---

## 5) Что эта нода делает

Эта логика совпадает с тем, что ты хотел на выходе:

* берет root contract
* подтягивает normalized competency results
* summary
* IDP
* one2one
* собирает единый snapshot
* сразу строит projections `overview`, `competencies`, `idp`, `one2one` 

Это уже почти готово под:

* `assessment_snapshots.payload`
* `latest_assessment_views.overview`
* `latest_assessment_views.competencies`
* `latest_assessment_views.idp`
* `latest_assessment_views.one2one` 

---

## 6) Важные замечания по именам нод

В финальной ноде есть жесткие ссылки на имена. Это тоже уже было отдельно отмечено: если у тебя реальные названия отличаются, их нужно заменить строками в коде .

Минимум проверь эти:

* `Code / Build Unified Root Contract`
* `Code / Normalize Competency Result`
* `LLM / Build Employee Summary`
* `LLM / Build IDP`
* `LLM / One2One Employee`
* `LLM / One2One Manager`
* `Code / Build Final Output Flags`

---

## 7) Как выглядит итоговый flow

Для `matrix_only` я бы сейчас закрепил такой порядок:

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
-> Code / Build Final Output Flags
-> Code / Build Final Snapshot
```

Это соответствует рекомендациям для matrix-only режима: synthetic evidence, competency analysis, IDP, one2one, learning recommendations и без сильного performance summary .

---

## 8) Что я бы еще поправил у тебя сразу

У тебя в матрицах `level` бывает не numeric, а текстовый: `нет опыта`, `начальный`, `средний`, `экспертный` .
Значит:

* в `Normalize Competency Result`
* в `Build IDP Payload v2`
* и в промптах

не надо предполагать, что level всегда число.
Если хочешь считать gap, лучше делать отдельный `level_rank`, а не вычитать строки.

---

## 9) Что бы я сделал следующим шагом

Я бы после этого проверил 3 вещи на одном реальном прогоне:

* в `snapshot.analysis` действительно стоят
  `assessment_mode = matrix_only`,
  `data_completeness = low`,
  `performance_inference_allowed = false`,
  `development_inference_allowed = true` 
* `summary.jira_summary` в matrix-only уходит в safe fallback, а не в fake performance summary, как и задумано 
* `projections.overview / competencies / idp / one2one` заполняются стабильно

Если хочешь, следующим сообщением я могу уже **собрать тебе один цельный блок n8n JSON** именно для хвоста workflow:
`Build Matrix-Only Summary Payload` + `Build Final Output Flags` + `Build Final Snapshot`.

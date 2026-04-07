Да. Ниже даю готовый патч: что именно заменить и что переподключить в workflow. Основа проблемы — старая и новая ветки используют разные контракты данных, а в нескольких Code nodes нарушен формат n8n output/input 

---

# 1) `Code in JavaScript12` — заменить код целиком

Сейчас нода, скорее всего, читает `item.employees` / `item.self_assessments`, а должна читать `item.json`.
Замени весь код на этот:

```javascript
const items = $input.all();

const employeeMap = new Map();
let modifiedCount = 0;

// 1. Собираем employee_id -> full_name
for (const item of items) {
  const data = item.json || {};

  if (Array.isArray(data.employees)) {
    for (const emp of data.employees) {
      if (!emp?.employee_id) continue;
      employeeMap.set(String(emp.employee_id), emp.full_name || '');
    }
  }
}

// 2. Обогащаем self_assessments
for (const item of items) {
  const data = item.json || {};

  if (Array.isArray(data.self_assessments)) {
    for (const assessment of data.self_assessments) {
      const employeeId = assessment?.employee_id;
      if (!employeeId) continue;

      const fullName = employeeMap.get(String(employeeId));
      if (fullName) {
        assessment.full_name = fullName;
        modifiedCount++;
      }
    }
  }
}

console.log(`Employees found: ${employeeMap.size}`);
console.log(`Self assessments enriched: ${modifiedCount}`);

return items;
```

---

# 2) `Build Employee Context1` — исправить `return`

У тебя новая нормализующая нода должна отдавать **массив items**, а не голый объект.

## Что заменить

### Было

```javascript
return {
  employees: employeeResults,
  data_unstructured: mergedUnstructured
};
```

### Должно быть

```javascript
return [
  {
    json: {
      employees: employeeResults,
      data_unstructured: mergedUnstructured
    }
  }
];
```

---

## И отдельно исправь early return при пустом employees

### Было

```javascript
if (employees.length === 0) {
  return {
    employees: [],
    data_unstructured: mergedUnstructured,
    error: {
      severity: 'error',
      entity_type: 'employee',
      issue_code: 'no_employees_found',
      message: 'Не найдены сотрудники в исходных данных'
    }
  };
}
```

### Должно быть

```javascript
if (employees.length === 0) {
  return [
    {
      json: {
        employees: [],
        data_unstructured: mergedUnstructured,
        error: {
          severity: 'error',
          entity_type: 'employee',
          issue_code: 'no_employees_found',
          message: 'Не найдены сотрудники в исходных данных'
        }
      }
    }
  ];
}
```

---

# 3) `Build Competency Payloads` — брать последнюю self-assessment, а не первую

Найди строку:

```javascript
const selfAssessmentRaw = employeeContext.self_assessment?.assessments?.[0]?.items || [];
```

И замени на:

```javascript
const assessments = employeeContext.self_assessment?.assessments || [];
const latestAssessment = assessments.length ? assessments[assessments.length - 1] : null;
const selfAssessmentRaw = latestAssessment?.items || [];
```

---

# 4) `Build Employee Summary Payload1` — заменить код целиком

Сейчас summary у тебя рискует потерять часть контекста сотрудника.
Замени код этой ноды целиком на:

```javascript
const items = $input.all();

const competencyResults = items.map(i => i.json || {});
const first = competencyResults[0] || {};

function topPriorityCompetencies(results, topN = 6) {
  const scored = results.map(r => {
    let score = 0;

    if (r.priority === 'high') score += 3;
    else if (r.priority === 'medium') score += 2;
    else score += 1;

    if (r.confidence === 'high') score += 2;
    else if (r.confidence === 'medium') score += 1;

    if (Array.isArray(r.risk_flags) && r.risk_flags.length > 0) {
      score += 2;
    }

    const selfLevel = Number(r.self_level ?? 0);
    const estimatedLevel = Number(r.estimated_level ?? 0);
    const gap = Math.abs(estimatedLevel - selfLevel);

    score += gap;

    return {
      competency_id: r.competency_id,
      score
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN).map(x => x.competency_id);
}

return [
  {
    json: {
      employee_summary_payload: {
        employee: first.employee || null,
        jira_summary: first.jira_summary || {
          available: false,
          summary: '',
          confidence: 'low',
          evidence_items: []
        },
        competency_results: competencyResults,
        top_priority_candidates: topPriorityCompetencies(competencyResults, 6),
        employee_data_quality_issues: first.employee_data_quality_issues || []
      }
    }
  }
];
```

---

# 5) `Normalize LLM competency result` — лучше заменить код целиком

Чтобы downstream получал не только `competency_result`, а сразу нормальную плоскую структуру с исходным контекстом.

Замени код на:

```javascript
const source = $input.first().json || {};

function safeParse(content) {
  if (typeof content === 'object' && content !== null) return content;
  if (typeof content === 'string') {
    try {
      return JSON.parse(content);
    } catch (e) {
      return null;
    }
  }
  return null;
}

function normalizeEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

let raw = null;

if (source.choices?.[0]?.message?.content) {
  raw = source.choices[0].message.content;
} else if (source.text) {
  raw = source.text;
} else if (source.message?.content) {
  raw = source.message.content;
} else if (source.content) {
  raw = source.content;
} else if (source.competency_id || source.estimated_level !== undefined) {
  raw = source;
}

const parsed = safeParse(raw);

const originalPayload =
  $items("Analyze One Competency", 0, 0)?.[0]?.json?.payload ||
  $items("Build Competency Payloads", 0, 0)?.[0]?.json ||
  {};

if (!parsed) {
  return [
    {
      json: {
        employee: originalPayload.employee || null,
        competency: originalPayload.competency || null,
        target_level: originalPayload.target_level ?? null,
        self_assessment_item: originalPayload.self_assessment_item || null,
        jira_evidence: originalPayload.jira_evidence || [],
        candidate_score: originalPayload.candidate_score ?? null,
        employee_data_quality_issues: originalPayload.employee_data_quality_issues || [],
        competency_id: originalPayload.competency?.competency_id || '',
        self_level: originalPayload.self_assessment_item?.selected_level ?? null,
        estimated_level: originalPayload.self_assessment_item?.selected_level ?? 0,
        confidence: 'low',
        assessment: 'Не удалось распарсить ответ LLM. Использован fallback.',
        evidence_for: [],
        evidence_missing: ['invalid_json_from_llm'],
        risk_flags: ['fallback_used', 'invalid_json_from_llm'],
        priority: 'medium',
        development_focus: 'Требуется ручная проверка',
        valid: false,
        error: 'invalid_json_from_llm'
      }
    }
  ];
}

const result = {
  employee: originalPayload.employee || null,
  competency: originalPayload.competency || null,
  target_level: originalPayload.target_level ?? null,
  self_assessment_item: originalPayload.self_assessment_item || null,
  jira_evidence: originalPayload.jira_evidence || [],
  candidate_score: originalPayload.candidate_score ?? null,
  employee_data_quality_issues: originalPayload.employee_data_quality_issues || [],
  competency_id: parsed.competency_id || originalPayload.competency?.competency_id || '',
  self_level: Number.isFinite(Number(parsed.self_level))
    ? Number(parsed.self_level)
    : (originalPayload.self_assessment_item?.selected_level ?? null),
  estimated_level: Number.isFinite(Number(parsed.estimated_level))
    ? Number(parsed.estimated_level)
    : null,
  confidence: normalizeEnum(parsed.confidence, ['low', 'medium', 'high'], 'low'),
  assessment: String(parsed.assessment || ''),
  evidence_for: Array.isArray(parsed.evidence_for) ? parsed.evidence_for : [],
  evidence_missing: Array.isArray(parsed.evidence_missing) ? parsed.evidence_missing : [],
  risk_flags: Array.isArray(parsed.risk_flags) ? parsed.risk_flags : [],
  priority: normalizeEnum(parsed.priority, ['low', 'medium', 'high'], 'medium'),
  development_focus: String(parsed.development_focus || ''),
  valid: true,
  error: null
};

if (!result.competency_id || result.estimated_level === null) {
  result.valid = false;
  result.error = 'missing_required_fields';
  result.risk_flags = [...new Set([...(result.risk_flags || []), 'fallback_used'])];
  result.estimated_level = result.self_level ?? 0;
  result.confidence = 'low';
}

return [{ json: result }];
```

---

# 6) Переподключение нод

Сейчас у тебя в JSON реально присутствует старая ветка `Build Employee Context -> Score Competencies -> Shortlist Competencies -> Code in JavaScript3` 

## Что отключить

Удали связь:

* `Build Employee Context1 -> Build Employee Context`

И больше не используй в основной ветке:

* `Build Employee Context`
* `Score Competencies`
* `Shortlist Competencies`
* `Code in JavaScript3`
* `Edit Fields3`
* `Edit Fields4`
* `Loop Over Items`

## Оставить рабочую цепочку

Должно быть так:

```text
When clicking ‘Execute workflow’
→ Edit Fields5
→ Code in JavaScript12
→ Build Employee Context1
→ Code in JavaScript16
→ Loop Over Items3
→ Build Competency Payloads
→ Pick Top Competencies
→ Analyze One Competency
→ Normalize LLM competency result
→ Collect Results1
→ Loop Over Items3 (обратная петля)
→ Aggregate6
→ Build Employee Summary Payload1
→ Build Employee Summary
```

---

# 7) Что проверить после правок

## В `Build Employee Context1`

На выходе должен быть **1 item** вида:

```json
{
  "employees": [ ... ],
  "data_unstructured": ...
}
```

## В `Code in JavaScript16`

На выходе должен быть:

```json
{
  "employees_context_for_payload": [ ... ]
}
```

## В `Build Competency Payloads`

На выходе должен быть **массив items**, где каждый item — одна компетенция:

```json
{
  "payload": {
    "employee": { ... },
    "competency": { ... },
    "self_assessment_item": { ... }
  }
}
```

## В `Normalize LLM competency result`

На выходе должен быть уже плоский объект:

```json
{
  "employee": {...},
  "competency": {...},
  "competency_id": "...",
  "self_level": 2,
  "estimated_level": 3,
  "confidence": "medium",
  "priority": "high"
}
```

---

# 8) Самые частые ошибки после фикса

## Ошибка: `Cannot read properties of undefined`

Причина: где-то ожидается `payload`, а приходит уже плоский объект.
Лечится тем, что после `Build Competency Payloads` ты везде работаешь либо с `$json.payload`, либо после normalize уже с плоским `$json`, но не смешиваешь оба формата.

## Ошибка: пустой `competency_results`

Причина: `Build Competency Payloads` не собрал данные из `latestAssessment`.
Проверь, что `self_assessment.assessments` вообще массив.

## Ошибка: summary без employee

Причина: агрегатор собирает только LLM-результаты без исходного employee context.
Я выше это закрыл патчем в `Normalize LLM competency result` и `Build Employee Summary Payload1`.

---

# 9) Минимальный набор, если хочешь только быстро завести

Сделай хотя бы это:

1. заменить код в `Code in JavaScript12`
2. исправить `return` в `Build Employee Context1`
3. заменить строку в `Build Competency Payloads` на `latestAssessment`
4. отключить связь `Build Employee Context1 -> Build Employee Context`

Это уже должно убрать основную поломку.

Если хочешь, следующим сообщением я дам тебе еще более жесткий вариант: **короткий чеклист “кликни сюда → вставь код → удали эту связь” по шагам прямо для интерфейса n8n**.

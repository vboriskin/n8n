Да — я посмотрел твой workflow в файле [workflow_n8n.json](sandbox:/mnt/data/workflow_n8n.json) 

Проблема у тебя не в одной ноде, а в том, что в начале смешаны **две разные ветки логики**:

* **старая ветка**: `Build Employee Context -> Score Competencies -> Shortlist Competencies -> Code in JavaScript3`
* **новая ветка**: `Build Employee Context1 -> Code in JavaScript16 -> Loop Over Items3 -> Build Competency Payloads ...`

Из-за этого после “сырых данных” часть нод ожидает **одну структуру**, а получает **другую**.

---

## Что конкретно ломает workflow

### 1) `Code in JavaScript12` читает вход не из `item.json`

Сейчас там логика такого вида:

```js
if (item.employees && Array.isArray(item.employees)) { ... }
if (item.self_assessments && Array.isArray(item.self_assessments)) { ... }
```

Но в n8n Code node входные данные лежат в `item.json`.
Из-за этого `employeeMap` часто пустой, и обогащение `self_assessments.full_name` не срабатывает. Это видно прямо в коде ноды `Code in JavaScript12` 

### 2) `Build Employee Context1` возвращает не n8n-item

Сейчас в конце у тебя:

```js
return {
  employees: employeeResults,
  data_unstructured: mergedUnstructured
};
```

Для Code node надо возвращать **массив items**, то есть:

```js
return [{ json: { ... } }];
```

Иначе следующие ноды могут получить невалидный формат.

### 3) `Build Employee Context1` параллельно отправляет данные в старую ноду `Build Employee Context`

Это критично.
`Build Employee Context` ожидает сырые поля вида:

```js
$json.employees
$json.matrices
$json.learning_assets
$json.self_assessments
$json.employee_id
```

А `Build Employee Context1` уже отдает **нормализованную структуру** вида:

```js
{
  employees: [
    {
      employee,
      self_assessment,
      role_matrix,
      learning_assets_pool,
      employee_data_quality_issues
    }
  ]
}
```

То есть старая нода получает уже **не тот контракт**, на который была написана. Это видно по ее коду: она ищет `employee_id` и plain `employees`, а не enriched employee context 

### 4) `Build Competency Payloads` берет не последнюю оценку, а первую

Сейчас там:

```js
const selfAssessmentRaw = employeeContext.self_assessment?.assessments?.[0]?.items || [];
```

Если оценок несколько, ты анализируешь **не самую свежую**, а первую.

Надо брать последнюю:

```js
const assessments = employeeContext.self_assessment?.assessments || [];
const latestAssessment = assessments.length ? assessments[assessments.length - 1] : null;
const selfAssessmentRaw = latestAssessment?.items || [];
```

### 5) В workflow есть мертвые/недоподключенные ноды

Например:

* `Edit Fields3` — без входа
* `Edit Fields4` — без входа
* `Code in JavaScript3` — дальше не участвует в новой рабочей ветке

Это не всегда “ломает”, но сильно путает схему и мешает отладке.

---

# Как я бы починил workflow

## Вариант, который рекомендую

Оставить **только новую ветку**, а старую отключить.

### Рабочая цепочка должна быть такой:

1. `When clicking ‘Execute workflow’`
2. `Edit Fields5`
3. `Code in JavaScript12`
4. `Build Employee Context1`
5. `Code in JavaScript16`
6. `Loop Over Items3`
7. `Build Competency Payloads`
8. `Pick Top Competencies`
9. `Analyze One Competency`
10. `Normalize LLM competency result`
11. `Collect Results1`
12. обратно в `Loop Over Items3`
13. `Aggregate6`
14. `Build Employee Summary Payload1`
15. `Build Employee Summary`

### Что отключить

Убери соединение:

* `Build Employee Context1 -> Build Employee Context`

И фактически выведи из использования старую ветку:

* `Build Employee Context`
* `Score Competencies`
* `Shortlist Competencies`
* `Code in JavaScript3`
* `Edit Fields3`
* `Loop Over Items`
* всё, что висит на этой старой линии

---

# Конкретные правки по нодам

## 1) Починить `Code in JavaScript12`

### Что делает

Обогащает `self_assessments` полем `full_name`.

### Замени код целиком на это:

```js
const items = $input.all();

// Собираем карту employee_id -> full_name
const employeeMap = new Map();

for (const item of items) {
  const data = item.json || {};

  if (Array.isArray(data.employees)) {
    for (const emp of data.employees) {
      if (emp?.employee_id) {
        employeeMap.set(String(emp.employee_id), emp.full_name || '');
      }
    }
  }
}

// Добавляем full_name в self_assessments
let modifiedCount = 0;

for (const item of items) {
  const data = item.json || {};

  if (Array.isArray(data.self_assessments)) {
    for (const assessment of data.self_assessments) {
      const empId = assessment?.employee_id;
      if (empId && employeeMap.has(String(empId))) {
        assessment.full_name = employeeMap.get(String(empId));
        modifiedCount++;
      }
    }
  }
}

console.log(`Found ${employeeMap.size} employees, added full_name to ${modifiedCount} self-assessment entries`);

return items;
```

### Почему

Потому что в Code node вход надо читать из `item.json`, а не из `item`.

---

## 2) Починить `Build Employee Context1`

### Что делает

Нормализует сырые массивы `employees / matrices / learning_assets / self_assessments` в единую структуру для downstream.

### Что надо исправить

Только одно обязательно: **вернуть корректный n8n item**.

### Было:

```js
return {
  employees: employeeResults,
  data_unstructured: mergedUnstructured
};
```

### Должно стать:

```js
return [
  {
    json: {
      employees: employeeResults,
      data_unstructured: mergedUnstructured
    }
  }
];
```

### И вот этот кусок:

```js
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

### заменить на:

```js
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

## 3) Убрать конфликт старой и новой ветки

### Сейчас

`Build Employee Context1` идет сразу в:

* `Code in JavaScript16`
* `Build Employee Context`

### Нужно

Оставить только:

* `Build Employee Context1 -> Code in JavaScript16`

### Почему

`Build Employee Context` написан под **другой входной контракт** и не подходит после нормализованного `Build Employee Context1`.

---

## 4) Починить `Build Competency Payloads`

### Проблема

Берется первая assessment, а не последняя.

### Замени этот фрагмент:

```js
const selfAssessmentRaw = employeeContext.self_assessment?.assessments?.[0]?.items || [];
```

### На этот:

```js
const assessments = employeeContext.self_assessment?.assessments || [];
const latestAssessment = assessments.length ? assessments[assessments.length - 1] : null;
const selfAssessmentRaw = latestAssessment?.items || [];
```

### Рекомендую еще добавить fallback по typo в матрице

У тебя местами используется `compentecy_groups`, местами `competency_groups`.
В новой ноде это уже учтено, и это правильно:

```js
const groups = asArray(matrix.compentecy_groups || matrix.competency_groups);
```

Оставь именно так.

---

## 5) `Code in JavaScript16` лучше не использовать как основной источник для downstream

Эта нода строит `employees_context_for_payload`, но дальше у тебя реально рабочая ветка идет через:

* `Loop Over Items3`
* `Build Competency Payloads`

То есть она частично дублирует подготовку данных.

### Что с ней делать

Есть два варианта:

#### Вариант A — оставить

Если она нужна для промежуточной отладки, можно оставить.

#### Вариант B — убрать из продовой ветки

Тогда цепочка будет проще:

`Build Employee Context1 -> Loop Over Items3`

Но сейчас `Loop Over Items3` получает именно `employees_context_for_payload` из `Code in JavaScript16`, поэтому если убираешь, надо немного адаптировать `Build Competency Payloads`.

---

# Минимальный набор изменений, чтобы “завелось”

Если тебе нужен именно **самый короткий путь к рабочему состоянию**, сделай только это:

### Обязательно

1. Исправь `Code in JavaScript12`
2. Исправь `Build Employee Context1` на `return [{ json: ... }]`
3. Отключи связь `Build Employee Context1 -> Build Employee Context`
4. Исправь `Build Competency Payloads`, чтобы брал последнюю assessment

После этого новая ветка должна начать работать заметно стабильнее.

---

# Возможные ошибки после фикса

## Ошибка: `Cannot read properties of undefined`

### Где вероятно

В LLM/summary ветке, если у сотрудника нет:

* `role_matrix`
* `self_assessment`
* `assessments`
* `items`

### Как избежать

Во всех Code nodes держи безопасные fallback'и:

```js
const assessments = employeeContext.self_assessment?.assessments || [];
const latestAssessment = assessments.length ? assessments[assessments.length - 1] : null;
const selfAssessmentRaw = latestAssessment?.items || [];
```

---

## Ошибка: пустой `competency_results`

### Причина

`Pick Top Competencies` берет top 5 из общего списка, а если upstream дал пустой список — дальше LLM не получит данных.

### Защита

В `Build Competency Payloads` в конце добавь лог:

```js
console.log(`Built ${allResults.length} competency items`);
```

А в `Pick Top Competencies`:

```js
if (!items.length) {
  return [];
}
```

---

## Ошибка: summary без данных сотрудника

Сейчас `Build Employee Summary Payload1` собирает только:

```js
{
  employee_summary_payload: {
    competency_results,
    top_priority_candidates
  }
}
```

Там нет `employee`, `role`, `grade`, `jira_summary`.

### Лучше сделать так:

```js
const competencyResults = items.map(i => i.json);
const first = competencyResults[0] || {};

function topPriorityCompetencies(results, topN = 5) {
  const scored = results.map(r => {
    let s = 0;
    if (r.priority === "high") s += 3;
    else if (r.priority === "medium") s += 2;
    else s += 1;

    if (r.confidence === "high") s += 2;
    else if (r.confidence === "medium") s += 1;

    if (Array.isArray(r.risk_flags) && r.risk_flags.length) s += 2;

    const selfLevel = Number(r.self_level ?? 0);
    const estimatedLevel = Number(r.estimated_level ?? 0);
    const gap = Math.abs(estimatedLevel - selfLevel);

    s += gap;

    return {
      competency_id: r.competency_id,
      score: s,
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
        competency_results: competencyResults,
        top_priority_candidates: topPriorityCompetencies(competencyResults, 6),
      }
    }
  }
];
```

---

# Что я бы сделал как финальную архитектуру

## Упростил бы до такой схемы

### Блок 1. Нормализация входа

* `Edit Fields5`
* `Code in JavaScript12`
* `Build Employee Context1`

### Блок 2. Подготовка competency items

* `Build Competency Payloads`
* `Pick Top Competencies`

### Блок 3. LLM-анализ по компетенциям

* `Loop Over Items3`
* `Analyze One Competency`
* `Normalize LLM competency result`
* `Collect Results1`
* `Aggregate6`

### Блок 4. Summary

* `Build Employee Summary Payload1`
* `Build Employee Summary`

---

# Итог

## Главная причина поломки

У тебя после сырых данных workflow раздваивается на **старую и новую несовместимые схемы данных**.

## Что надо сделать прямо сейчас

* исправить `Code in JavaScript12`
* исправить `Build Employee Context1` на правильный `return [{ json: ... }]`
* отключить старую ветку от `Build Employee Context1`
* в `Build Competency Payloads` брать последнюю assessment

## Самая важная правка

Вот она:

```js
return [
  {
    json: {
      employees: employeeResults,
      data_unstructured: mergedUnstructured
    }
  }
];
```

Потому что без этого downstream вообще может получать невалидный output.

Если хочешь, следующим сообщением я могу дать тебе **готовый патч по нодам в формате “замени этот код на этот” для 4 конкретных нод**, без лишних объяснений.

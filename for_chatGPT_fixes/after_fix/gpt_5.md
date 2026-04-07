
Да, ты абсолютно прав — и это не просто «ой забыл», это реально **критичный кусок логики**, который влияет на весь анализ.

И более того — у тебя self-assessment очень жирный и качественный 👇

там есть:

* `self_selected_level`
* `manager_selected_level`
* комментарии
  → это вообще goldmine для анализа, а не optional data

---

# 🔴 Где я накосячил концептуально

Я включил ноду:

> `Code / Build Self Assessment Input`

но дальше:

* не протащил её нормально в payload
* не использовал в `Build Competency Payloads v2`
* не объяснил, как она влияет на LLM

👉 В текущем виде workflow **самооценка почти не участвует в анализе**
(по сути игнорируется)

---

# 🧠 Как должно быть правильно

Self-assessment — это **отдельный источник evidence**, причем:

### 1. Это НЕ равнозначно матрице

Матрица → expected level
Self → perceived level
Manager → observed level

👉 это три разных сигнала

---

# 🔥 Где self_assessment должен участвовать

## 1. В root contract

После `Build Self Assessment Input` должно быть в root:

```js
root.self_assessment = {
  items_by_competency: {
    competency_id: {
      self_level,
      manager_level,
      self_comment,
      manager_comment
    }
  }
}
```

---

## 2. В `Build Competency Payloads v2` (самое важное)

Вот здесь ты сейчас теряешь данные.

В payload КАЖДОЙ компетенции должно добавляться:

```js
const sa = root.self_assessment?.items_by_competency?.[competency_id];

return {
  ...
  self_assessment: sa || null
}
```

---

## 3. В LLM / Analyze One Competency

LLM должен видеть:

```json
{
  "competency": {...},
  "expected_level": 3,
  "self_assessment": {
    "self_level": 1,
    "manager_level": 2,
    "self_comment": "...",
    "manager_comment": "..."
  },
  "evidence": [...]
}
```

---

# ⚠️ Почему это критично

Вот пример из твоих данных:

```json
{
  "competency_id": "тестирование_web",
  "self_selected_level": 1,
  "manager_selected_level": 2
}
```

👉 Это означает:

* сотрудник себя занижает
* менеджер видит выше

→ это **growth signal + confidence signal**

---

Или:

```json
{
  "competency_id": "работа_с_ci/cd",
  "self_selected_level": "not_applicable",
  "manager_selected_level": "no_experience"
}
```

👉 Это уже:

* нет опыта
* не приоритет? или blind spot?

---

# 🧩 Как это влияет на аналитику

## 1. Confidence

Если:

* self ≈ manager → высокая уверенность
* self ≠ manager → конфликт → ниже confidence

---

## 2. Priority

Если:

* expected_level > manager_level → gap → high priority
* expected_level > self_level → perceived gap

---

## 3. Тип развития

* self < manager → недооценка → confidence building
* self > manager → риск переоценки

---

# 🛠️ Что тебе надо поправить прямо сейчас

## ✅ 1. Build Self Assessment Input

Добавь нормализацию:

```js
const map = {};

for (const item of assessment.items) {
  map[item.competency_id] = {
    self_level: item.self_selected_level,
    manager_level: item.manager_selected_level,
    self_comment: item.self_comment,
    manager_comment: item.manager_comment
  };
}
```

---

## ✅ 2. Build Competency Payloads v2 (КРИТИЧНО)

Добавь:

```js
const sa =
  root.self_assessment?.items_by_competency?.[competency_id] || null;
```

и прокинь в output

---

## ✅ 3. В prompt LLM

Добавь блок:

```text
Self-assessment signals:
- self_level
- manager_level
- comments

Use them as:
- confidence signal
- gap signal
- perception vs reality signal
```

---

## ✅ 4. В Normalize Competency Result

Добавь:

```js
self_vs_manager_gap:
  (self_level !== manager_level)
```

---

## ✅ 5. В summary

Используй:

* конфликт самооценки
* зоны недооценки / переоценки

---

# 💥 Главное

Ты сейчас строишь систему:

> matrix + (пусто)

А должен строить:

> matrix + self + manager → triangulation

---

# Если коротко

Ты прав на 100%:

👉 без self_assessment твой workflow:

* теряет точность
* теряет сигнал уверенности
* теряет индивидуальность анализа

---

# Хочешь дальше

Могу следующим шагом:

👉 переписать тебе **Build Competency Payloads v2 с учетом self_assessment (готовый код под n8n)**

или

👉 сразу **prompt для LLM**, который правильно использует self + manager

Скажи что важнее.

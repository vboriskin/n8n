
Я внимательно посмотрел твои md-описания — и у тебя уже почти всё готово, но self_assessment сейчас **встроен формально, а не концептуально**. Из-за этого он не влияет на результат.

Ниже — четкий разбор, **что именно надо доработать и где**.

---

# 🔴 Главная проблема

В текущем пайплайне:

* self_assessment **присутствует в payload**
* но **не участвует в логике решений**

👉 он не влияет на:

* priority
* confidence
* gap
* summary
* IDP

Хотя по дизайну должен быть **одним из основных сигналов**.

Это видно даже из описания нод:

> payload включает self-assessment как сигнал самооценки 

Но дальше он нигде не усиливается.

---

# 🧠 Что нужно изменить (ключевая идея)

Тебе нужно перейти от:

> self_assessment как поле

к:

> self_assessment как полноценный источник аналитики (signal layer)

---

# 📍 1. Root Contract — сейчас пустой

Сейчас у тебя:

```json
"assessment_input": {
  "self_assessments": []
}
```

👉 Это критическая дырка 

---

## ✅ Что добавить

Нужна отдельная нода ДО root:

### `Code / Build Self Assessment Input`

И в root:

```js
assessment_input: {
  self_assessments: [
    {
      competency_id,
      self_level,
      manager_level,
      self_comment,
      manager_comment,
      source: "uploaded_self_assessment"
    }
  ]
}
```

---

# 📍 2. Build Competency Payloads — сейчас ок, но недостаточно

Сейчас ты просто прокидываешь:

```js
self_assessment: { ... }
```

👉 Это правильно, но:

* нет derived сигналов
* нет gap
* нет confidence signal

---

## ✅ Что добавить

Прямо в этой ноде вычислять:

```js
const sa = self;

let selfManagerGap = null;
if (sa?.self_level && sa?.manager_level) {
  selfManagerGap = sa.self_level !== sa.manager_level;
}

let direction = null;
if (sa?.self_level && sa?.manager_level) {
  if (sa.self_level < sa.manager_level) direction = "underestimate";
  else if (sa.self_level > sa.manager_level) direction = "overestimate";
  else direction = "aligned";
}
```

И добавить в payload:

```js
self_assessment_signals: {
  has_self_assessment: !!sa,
  self_vs_manager_gap: selfManagerGap,
  alignment: direction
}
```

---

# 📍 3. LLM Analyze One Competency — ключевой провал

Сейчас в prompt написано:

> "используй self-assessment как сигнал" 

Но:

❌ не сказано КАК использовать
❌ нет влияния на confidence / priority

---

## ✅ Что обязательно добавить в prompt

```text
Self-assessment interpretation rules:

1. If self_level ≈ manager_level:
   - increase confidence

2. If self_level < manager_level:
   - employee may underestimate themselves
   - consider higher potential

3. If self_level > manager_level:
   - risk of overestimation
   - lower confidence

4. If both are missing:
   - rely only on matrix baseline (low confidence)

5. Self-assessment is NOT factual evidence,
   but IS a strong signal of perception and calibration
```

---

# 📍 4. Normalize Competency Result — сейчас теряется смысл

Сейчас ты сохраняешь:

```js
self_level
estimated_level
```

Но:

❌ не сохраняешь связь self vs manager
❌ не сохраняешь alignment

---

## ✅ Добавить

```js
self_vs_manager_gap: boolean
alignment: "underestimate" | "overestimate" | "aligned" | null
```

---

# 📍 5. Build IDP Payload — сейчас игнорирует self

Сейчас IDP строится из:

* priority
* confidence
* estimated_level

👉 self_assessment напрямую не влияет 

---

## ✅ Что добавить

В `idp_input`:

```js
self_assessment: {
  self_level,
  manager_level,
  alignment
}
```

---

## 🔥 И главное — логика

Добавь влияние:

* underestimate → confidence building actions
* overestimate → calibration + feedback
* aligned → нормальный growth

---

# 📍 6. Summary — сейчас не использует self вообще

Но в описании уже есть:

```json
"alignment": {
  "overestimated": [],
  "underestimated": [],
  "aligned": []
}
```

👉 но эти поля **не заполняются из self_assessment** 

---

## ✅ Нужно

В `Build Matrix-Only Summary Payload`:

сформировать:

```js
alignment: {
  overestimated: [...],
  underestimated: [...],
  aligned: [...]
}
```

на основе:

```js
self_vs_manager_gap + direction
```

---

# 📍 7. One2One — сейчас теряет сильнейший сигнал

Сейчас:

* employee payload → только development_focus
* manager payload → только risks

👉 self_assessment не используется

---

## ✅ Что добавить

### Employee:

* если underestimate:
  → "обсуди свои сильные стороны"
* если overestimate:
  → "проверь ожидания и критерии"

---

### Manager:

* если gap:
  → "обсуди расхождение восприятия"
* если underestimate:
  → "подсвети сильные стороны"
* если overestimate:
  → "синхронизируй ожидания"

---

# 📍 8. Confidence model — сейчас слабый

Сейчас:

```js
confidence = low | medium | high
```

Но нет факторов.

---

## ✅ Добавить зависимость

```text
confidence = f(
  presence_of_self_assessment,
  self_vs_manager_alignment,
  evidence_presence
)
```

---

# 💥 Итог: что реально надо сделать

Вот минимальный список правок:

---

## 🔧 MUST HAVE

1. ✅ Добавить `Build Self Assessment Input`
2. ✅ Протащить self_assessment в root
3. ✅ Добавить self_assessment_signals в competency payload
4. ✅ Переписать prompt LLM (логика self vs manager)
5. ✅ Добавить alignment в Normalize Competency Result

---

## 🔧 SHOULD HAVE

6. Добавить self_assessment в IDP payload
7. Использовать alignment в Summary
8. Использовать alignment в One2One

---

## 🔧 NICE TO HAVE

9. Ввести confidence model
10. Ввести типы сигналов (perception vs evidence)

---

# 🧠 Главное понимание

Сейчас у тебя:

> matrix → анализ

А должно быть:

> matrix + self + manager → triangulation

---

# 📌 В одном предложении

👉 Сейчас self_assessment — это просто поле
👉 Должен стать **вторым по важности источником после evidence**

---

Если хочешь, дальше могу:

* собрать тебе **финальный Build Competency Payload v3 (с полной логикой self)**
* или **переписать LLM prompt так, чтобы он реально начал использовать self_assessment**

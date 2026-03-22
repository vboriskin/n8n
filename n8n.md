Я хочу сделать процесс оценки компетенций и составление плана развития it инженеров с помощью ai. На вход у меня есть: - база материалов для обучения (курсы, программы обучения, практические задания) в виде эксель файл - эксель файл со списком сотрудников (должность, фио, команда, роль, логин) - эксель файл с описанием матриц компетенций, технологий и софт скиллов, с описанием уровней) - эксель файл или список файлов с самооценкой сотрудника по матрице для его роли (для каждой компетенции выбирает уровень и пишет комментарии) Нужно обработать файл/ы, проанализировать их с помощью llm, с учетом файлов с описанием матриц, дать общий вывод и рекомендации плюс построить план развития на полугодие (не больше 3-4 компетенций на квартал), составить руководителю план и вопросы как провести one2one с сотрудником Дополнительно нужно сходить в jira, получить список задач, которые он выполнил или участвовал, проанализировать и дать рекомендации, плюс сметчить с анализом самооценки в качестве ноды llm мы можем использовать ноду openaiapi, под капотом у меня прокси которая маршрутизирует запрос в гигачат вместо openai. У меня есть n8n 2.8.4 и llm gigachat Max. Распиши мне пошагово как бы ты разбатывал workflow. Можно несколькими сообщениями, не спеши, детализируй. Я буду твоими руками



Да. Ниже дам это как проектирование production-like workflow в n8n: от входных файлов до итогового отчета руководителю. Сразу заложу, чтобы решение было устойчивым, расширяемым и не превращалось в один гигантский prompt.

Сразу скажу важную вещь: я бы не делал это одним LLM-запросом “прочитай всё и выдай план”. Правильнее собрать конвейер из этапов:

1. нормализация данных,
2. валидация,
3. обогащение из Jira,
4. аналитика по компетенциям,
5. генерация плана развития,
6. генерация материалов для one-to-one,
7. сохранение результата.

Иначе будет много галлюцинаций, плохая трассируемость и сложно будет объяснить руководителю, откуда взялись выводы.

---

# 1. Что именно должен делать workflow

На выходе по каждому сотруднику ты хочешь получить 4 артефакта:

## 1) Карточка оценки

Что есть сейчас:

* роль / должность / команда
* самооценка по матрице
* факты из Jira
* выявленные сильные стороны
* зоны роста
* расхождения между самооценкой и фактическими задачами

## 2) План развития на полгода

Ограничения:

* не больше 3–4 компетенций на квартал
* каждая компетенция должна иметь:

  * целевой уровень
  * почему выбрана
  * конкретные активности
  * материалы обучения
  * практику на рабочем месте
  * критерии проверки прогресса

## 3) План для руководителя

* на что обратить внимание
* где поддержать
* какие задачи давать
* какие риски есть
* как проверять прогресс

## 4) Сценарий one-to-one

* структура разговора
* вопросы сотруднику
* вопросы на калибровку самооценки
* вопросы по мотивации / барьерам
* договоренности по следующему кварталу

---

# 2. Общая архитектура workflow

Я бы разбил это минимум на 5 workflow в n8n, а не на один.

## Workflow A. Ingestion / загрузка и нормализация

Задача:

* принять Excel-файлы
* распарсить
* привести к единому JSON-формату
* сохранить в промежуточное хранилище

Вход:

* Excel с учебными материалами
* Excel со списком сотрудников
* Excel с матрицами
* Excel/Excel-файлы с самооценкой

Выход:

* normalized_employees
* normalized_matrices
* normalized_learning_assets
* normalized_self_assessments

---

## Workflow B. Enrichment from Jira

Задача:

* по логину сотрудника получить задачи из Jira
* отфильтровать по периоду
* построить краткое factual summary
* извлечь evidence по компетенциям

Выход:

* jira_task_facts
* jira_competency_evidence

---

## Workflow C. Competency analysis

Задача:

* соединить самооценку + матрицу + Jira evidence
* оценить текущий уровень confidence-based
* найти gaps
* найти overestimate / underestimate
* сформировать приоритеты

Выход:

* competency_assessment_result

---

## Workflow D. Development plan generation

Задача:

* на основе assessment + learning catalog
* подобрать подходящие курсы / задания / практики
* сформировать план на 6 месяцев
* разложить на 2 квартала

Выход:

* development_plan_6m
* manager_plan
* one2one_guide

---

## Workflow E. Reporting / export

Задача:

* собрать итоговый отчет
* выгрузить в Google Docs / Notion / Confluence / PDF / email / Jira comment / Telegram

---

# 3. Почему так, а не одним workflow

Потому что у тебя здесь три разных типа логики:

## Детерминированная логика

Ее нельзя отдавать LLM:

* распарсить Excel
* склеить сотрудника с его ролью
* найти нужную матрицу
* выбрать только релевантные материалы
* сходить в Jira
* посчитать количество задач
* сделать mapping по ключам

## LLM-логика

Ее можно отдавать модели:

* интерпретация комментариев самооценки
* сравнение self-assessment и фактов
* качественные выводы
* приоритизация зон развития
* генерация one-to-one вопросов

## Правила бизнеса

Их лучше держать отдельно:

* максимум 3–4 компетенции в квартал
* не предлагать развитие, если компетенция уже на целевом уровне
* выбирать материалы только под роль
* soft skills не должны вытеснять критичные technical skills
* если в Jira мало данных, отметить низкую уверенность вывода

---

# 4. Какая должна быть целевая модель данных

Это критично. Сначала проектируешь JSON-схемы, потом строишь workflow.

---

## 4.1. Employee

```json
{
  "employee_id": "login_or_internal_id",
  "full_name": "Иванов Иван",
  "login": "iivanov",
  "position": "Senior Backend Engineer",
  "team": "Payments",
  "role": "backend_engineer",
  "grade": "senior",
  "manager": "Петров Петр",
  "location": "RU"
}
```

---

## 4.2. Competency matrix

```json
{
  "role": "backend_engineer",
  "competencies": [
    {
      "competency_id": "backend_architecture",
      "name": "Backend Architecture",
      "type": "hard",
      "description": "Проектирование backend-сервисов...",
      "levels": [
        {
          "level": 1,
          "title": "Базовый",
          "description": "Понимает базовые паттерны..."
        },
        {
          "level": 2,
          "title": "Уверенный",
          "description": "Проектирует модули..."
        },
        {
          "level": 3,
          "title": "Продвинутый",
          "description": "Проектирует сервисы..."
        },
        {
          "level": 4,
          "title": "Эксперт",
          "description": "Формирует архитектурные стандарты..."
        }
      ],
      "priority_weight": 0.9,
      "category": "engineering"
    }
  ]
}
```

---

## 4.3. Self-assessment

```json
{
  "employee_id": "iivanov",
  "role": "backend_engineer",
  "assessment_date": "2026-03-01",
  "items": [
    {
      "competency_id": "backend_architecture",
      "selected_level": 2,
      "comment": "Проектировал API для 2 сервисов, участвовал в ревью архитектуры..."
    }
  ]
}
```

---

## 4.4. Learning asset

```json
{
  "asset_id": "course_123",
  "title": "Designing Scalable Backend Systems",
  "type": "course",
  "format": "video",
  "provider": "internal",
  "duration_hours": 8,
  "competencies": ["backend_architecture", "system_design"],
  "recommended_for_roles": ["backend_engineer"],
  "target_levels": [2, 3],
  "difficulty": "intermediate",
  "url": "https://...",
  "tags": ["architecture", "microservices"]
}
```

---

## 4.5. Jira evidence

```json
{
  "employee_id": "iivanov",
  "period_start": "2025-09-01",
  "period_end": "2026-02-28",
  "tasks": [
    {
      "key": "PAY-123",
      "summary": "Implemented idempotency for payment retries",
      "type": "Story",
      "status": "Done",
      "assignee": "iivanov",
      "participants": ["iivanov", "ppetrov"],
      "labels": ["backend", "payments"],
      "components": ["billing"],
      "story_points": 5,
      "created": "2025-12-10",
      "updated": "2025-12-20",
      "description": "...",
      "comments": ["..."],
      "code_related": true
    }
  ]
}
```

---

# 5. Какой стек внутри n8n я бы использовал

Для n8n это может выглядеть так:

## Базовые ноды

* Manual Trigger / Webhook / Schedule Trigger
* Read Binary File / file upload source
* Spreadsheet File
* Code
* Set
* Merge
* IF
* Split in Batches
* HTTP Request
* Execute Workflow
* Wait / Rate limit при необходимости
* Postgres / MySQL / Supabase / Notion / Google Sheets / Confluence — куда хочешь складывать результат

## Для LLM

* OpenAI node / OpenAI API node
* Лучше через HTTP Request, если твой прокси подменяет OpenAI API на GigaChat-compatible endpoint
* Structured output через JSON schema

Я бы почти наверняка шел через HTTP Request или OpenAI-compatible API, а не через “магическую” LLM-ноду, если нужна надежность и контроль формата.

---

# 6. Очень важный принцип: LLM должна работать на кусках, не на сырых Excel

Никогда не давай модели сырой Excel-хаос.
Сначала:

* распарсил,
* очистил,
* выделил только релевантную роль,
* оставил только нужные компетенции,
* сжал Jira до evidence summary,
* и только потом отправил в LLM.

То есть LLM получает не 3000 строк, а аккуратный JSON примерно такого вида:

```json
{
  "employee": {...},
  "role_matrix": {...},
  "self_assessment": {...},
  "jira_summary": {...},
  "learning_assets_shortlist": [...]
}
```

---

# 7. Пошагово: как бы я делал Workflow A — Ingestion

## Шаг A1. Источник файлов

Сценарии:

* вручную загружаешь файлы в n8n
* кладешь в папку
* забираешь из S3 / Google Drive / SharePoint
* получаешь через webhook

Для начала я бы сделал просто:

* Manual Trigger
* 4 входных файла руками

---

## Шаг A2. Парсинг Excel

На каждый файл:

* Spreadsheet File node
* Read from binary
* Convert each sheet to JSON

Что важно:

* не доверять названиям колонок
* сразу сделать нормализацию имен

Например:

* “ФИО”, “Сотрудник”, “Employee Name” -> `full_name`
* “Логин”, “Login”, “AD Login” -> `login`
* “Роль”, “Role” -> `role`

Лучше после каждого Spreadsheet node поставить Code node и привести к стандартной схеме.

---

## Шаг A3. Нормализация справочников

Отдельный Code node для:

* employees
* matrices
* learning assets
* self-assessments

Примеры задач:

* trim строк
* убрать пустые строки
* перевести уровни в числа
* почистить дубли
* сделать slug для competency_id
* привести role к каноническому виду

Например:

* “Backend developer”
* “BE”
* “Backend Engineer”
  все свести к `backend_engineer`

---

## Шаг A4. Валидация

После нормализации обязательно валидация.

Проверки:

* у каждого сотрудника есть login и role
* для каждой role есть матрица
* у каждой компетенции есть уровни
* самооценка сотрудника ссылается на существующую компетенцию
* материалы обучения привязаны хотя бы к одной компетенции

Если ошибка:

* не падать всем процессом
* складывать в `data_quality_issues`

Пример структуры:

```json
{
  "employee_id": "iivanov",
  "severity": "warning",
  "type": "missing_matrix_competency",
  "message": "Компетенция 'system_thinking' из самооценки отсутствует в матрице роли backend_engineer"
}
```

---

## Шаг A5. Промежуточное хранилище

Очень советую хранить нормализованные сущности в БД, а не только в памяти n8n.

Минимум:

* employees
* matrices
* learning_assets
* self_assessments
* processing_runs
* data_quality_issues

Почему:

* удобно переиспользовать
* можно пересчитать только одного сотрудника
* можно дебажить
* можно строить историю оценок

Если хочешь быстро стартануть — SQLite/Postgres/Supabase.

---

# 8. Workflow B — получение данных из Jira

Здесь я бы делал очень осторожно: не тащить в LLM все задачи сырыми.

## Шаг B1. Получение списка задач по сотруднику

Для каждого сотрудника:

* HTTP Request к Jira REST API
* ищешь по login/accountId

Важно: в Jira Cloud и Server могут отличаться поля. Заложи mapping-конфиг.

Запрос обычно строится по:

* assignee = login
* updated / resolved in last 6 months
* optionally reporter / commenter / watcher / participant if нужно “участвовал”

Я бы разделил на 2 запроса:

### Запрос 1. Выполненные как assignee

Это сильный факт для evidence.

### Запрос 2. Участвовал

Например, по comment author, worklog, mentions, linked PR, custom fields — зависит от вашей Jira.

Если у вас “участвовал” формально не фиксируется, лучше не фантазировать. Тогда:

* assignee
* reviewer/comments/worklog
* linked commits
  что реально доступно, то и используем.

---

## Шаг B2. Ограничение периода

Обычно брать:

* последние 6 месяцев для плана на полугодие
* или предыдущий review cycle

---

## Шаг B3. Сжатие Jira в factual summary

Вот здесь нужен промежуточный слой до главной аналитики.

Из сырых задач строим summary:

```json
{
  "employee_id": "iivanov",
  "period": "2025-09-01..2026-02-28",
  "stats": {
    "done_tasks": 24,
    "bugs": 6,
    "stories": 12,
    "epics": 0,
    "avg_story_points": 4.2,
    "components": ["billing", "risk", "api"],
    "tech_tags": ["java", "postgres", "kafka"]
  },
  "evidence_items": [
    {
      "competency_hint": "backend_architecture",
      "evidence": "Участвовал в проектировании retry/idempotency механизма в PAY-123"
    },
    {
      "competency_hint": "debugging",
      "evidence": "Закрыл 4 production bug fix задачи в модуле billing"
    }
  ],
  "confidence": "medium"
}
```

Сначала можно сделать это без LLM:

* регулярки по labels/components/summary
* rules-based extraction

Потом поверх можно добавить LLM, которая из топ-20 задач сделает более качественное summary.

---

## Шаг B4. Важное правило по Jira

LLM не должна “оценивать человека по наличию тикетов”.
Она должна использовать Jira как дополнительное evidence.

Например:

* если сотрудник заявляет высокий уровень архитектуры, а в Jira нет архитектурных задач — это не “уровень низкий”, а “мало подтверждающих данных”.
* если в Jira есть сильные сигналы, а self-assessment низкий — можно отметить занижение самооценки.

Это очень важно для доверия к системе.

---

# 9. Workflow C — анализ компетенций

Вот тут начинается главная ценность.

Я бы делал анализ в 3 LLM-шагa, а не в один.

---

## Шаг C1. Анализ каждой компетенции отдельно

На вход подается:

* описание компетенции
* описание уровней
* self level
* комментарий сотрудника
* релевантные Jira evidence
* роль / грейд

На выходе:

* estimated_current_level
* confidence
* gap_to_target
* evidence_for
* evidence_missing
* recommendation_priority

Пример structured output:

```json
{
  "competency_id": "backend_architecture",
  "self_level": 2,
  "estimated_level": 2,
  "confidence": "medium",
  "assessment": "Сотрудник демонстрирует уверенное владение проектированием компонентов, но данных о системных архитектурных решениях ограниченно.",
  "evidence_for": [
    "Комментарий сотрудника о проектировании API",
    "Jira задача PAY-123 с архитектурным контекстом"
  ],
  "evidence_missing": [
    "Нет подтверждений ownership системных design решений end-to-end"
  ],
  "risk_flags": [],
  "priority": "high"
}
```

### Почему по компетенции отдельно

* лучше управляемость
* меньше контекста в prompt
* меньше риск галлюцинаций
* можно кэшировать

---

## Шаг C2. Сводный анализ по сотруднику

Когда есть результаты по всем компетенциям, делаешь второй LLM-шаг:

* выделить 3–6 главных зон развития
* определить, что реально стоит брать в план на 6 месяцев
* не включать все подряд

На выходе:

```json
{
  "strengths": [...],
  "growth_areas": [...],
  "top_priorities_next_6m": [...],
  "self_assessment_alignment": {
    "overestimated": [...],
    "underestimated": [...],
    "aligned": [...]
  },
  "overall_summary": "..."
}
```

---

## Шаг C3. Построение приоритетов rule-based

Этот шаг я бы делал уже без LLM или с минимальным LLM участием.

Например формула приоритета:

* critical_for_role_weight
* gap_to_target
* business_relevance
* jira_signal_strength
* self_comment_quality
* manager_override

То есть:
`priority_score = role_weight * gap * business_relevance * confidence_modifier`

Потом отбираешь:

* Q1: 3–4 компетенции
* Q2: 3–4 компетенции

Но с учетом зависимости:

* сначала foundations
* потом advanced

Например:

* сначала “system design fundamentals”
* потом “architecture trade-offs”

---

# 10. Какой prompt я бы дал модели на анализ компетенции

Очень важно требовать не “оценить человека”, а:

* сопоставить evidence с описанием уровней,
* указать уверенность,
* не выдумывать.

Пример логики prompt:

## System

Ты HR/engineering competency analyst.
Оцени только на основе предоставленных данных.
Если evidence недостаточно, прямо укажи это.
Не завышай и не занижай уровень без оснований.
Фокус на сопоставлении self-assessment, матрицы и Jira evidence.
Верни строго JSON.

## User

```json
{
  "employee": {...},
  "competency": {...},
  "self_assessment_item": {...},
  "jira_evidence": [...]
}
```

## Expected output

```json
{
  "competency_id": "string",
  "self_level": 0,
  "estimated_level": 0,
  "confidence": "low|medium|high",
  "assessment": "string",
  "evidence_for": ["string"],
  "evidence_missing": ["string"],
  "priority": "low|medium|high",
  "development_focus": "string"
}
```

---

# 11. Workflow D — генерация плана развития

Вот здесь многие ошибаются: LLM начинает предлагать абстрактное “пройти курс, читать книги, больше общаться”.

Чтобы этого не было, сначала делаем shortlist материалов, потом генерим план.

---

## Шаг D1. Матчинг компетенций с обучающими материалами

Сначала rules-based:

* выбираешь материалы по competency_id
* фильтруешь по role
* фильтруешь по target level
* фильтруешь по сложности
* убираешь дубли
* оставляешь top-N

Если маппинг в Excel плохой, можно сделать отдельный workflow enrichment:

* один раз LLM проставляет для каждого asset:

  * какие компетенции покрывает
  * для каких уровней подходит
  * какой тип активности это: theory / practice / mentoring / reading / project

Это лучше сделать оффлайн как preprocessing, а не при каждом запуске.

---

## Шаг D2. Генерация плана на 6 месяцев

На вход:

* employee summary
* top priorities
* shortlisted learning assets
* ограничения: 3–4 компетенции на квартал

На выход:

* quarter_1
* quarter_2
* для каждой компетенции:

  * target level
  * why now
  * learning actions
  * practice actions
  * measurable indicators
  * manager support

Пример структуры:

```json
{
  "plan_period": "6_months",
  "quarter_1": [
    {
      "competency_id": "backend_architecture",
      "target_from": 2,
      "target_to": 3,
      "reason": "Критично для роли и есть частичное подтверждение базы",
      "actions": [
        {
          "type": "course",
          "title": "Designing Scalable Backend Systems"
        },
        {
          "type": "practice",
          "title": "Подготовить design proposal для нового internal service"
        }
      ],
      "success_criteria": [
        "Может аргументированно описать trade-offs",
        "Подготовил и защитил 1 архитектурное решение"
      ]
    }
  ],
  "quarter_2": [...]
}
```

---

## Шаг D3. Не давать LLM выбирать 20 направлений

Перед отправкой в модель уже должен быть shortlist:

* максимум 6–8 кандидатов-компетенций
* максимум 20–30 релевантных материалов

Иначе будет вода.

---

# 12. Workflow E — материалы для руководителя и one-to-one

Я бы генерировал три отдельных текста.

## E1. Executive summary для руководителя

Коротко:

* 3 сильные стороны
* 3 зоны роста
* 2 риска
* 3 акцента на ближайшие 6 месяцев

## E2. План действий руководителя

Не про обучение сотрудника, а про управленческое сопровождение:

* какие задачи давать
* где давать ownership
* что наблюдать
* как часто проверять
* где не давить

## E3. Сценарий one-to-one

Структура:

1. Разогрев: самоощущение сотрудника
2. Разбор самооценки
3. Разбор evidence из практики
4. Согласование 2–4 фокусов
5. Договоренность по действиям и контрольным точкам

Пример вопросов:

* Какие из оцененных компетенций ты считаешь своими самыми сильными и почему?
* Где ты сам чувствуешь ограничение в текущих задачах?
* Какие задачи за последние месяцы лучше всего показали твой текущий уровень?
* В каких местах ты бы хотел больше ownership?
* Какие барьеры мешают расти в этой области?
* Какой формат развития тебе сейчас зайдет лучше: курс, практика, менторинг, shadowing?

---

# 13. Как я бы строил workflow внутри n8n технически

Ниже почти буквальная схема.

---

## Главный orchestration workflow

### 1. Trigger

* Manual Trigger / Cron / Webhook

### 2. Load config

* Set / Code
* параметры:

  * review_period_months = 6
  * max_competencies_per_quarter = 4
  * use_jira = true
  * target_roles = all / selected

### 3. Execute Workflow: Ingestion

Получаешь normalized datasets

### 4. Split in Batches по сотрудникам

### 5. Для каждого сотрудника:

* найти employee record
* найти его role matrix
* найти self assessment
* Execute Workflow: Jira Enrichment
* Execute Workflow: Competency Analysis
* Execute Workflow: Development Plan
* Execute Workflow: Report Generation
* Save result

### 6. Aggregate results

* итоговая таблица / zip / папка / база

---

# 14. Как я бы делал Jira enrichment workflow

### Input

```json
{
  "employee": {...},
  "review_period_start": "2025-09-01",
  "review_period_end": "2026-02-28"
}
```

### Steps

1. Build JQL in Code node
2. HTTP Request to Jira Search API
3. Pagination loop if needed
4. Normalize tasks
5. Optional: second query for participation evidence
6. Code node: compute stats
7. Optional LLM summarizer for top tasks
8. Return compact jira summary

---

# 15. Как бороться с лимитами и стоимостью

Если сотрудников много, нельзя по каждому слать огромные данные.

Я бы делал так:

## Кэширование

* если employee self-assessment и Jira data не менялись, не пересчитывать анализ

## Двухуровневая аналитика

* сначала rules-based shortlist компетенций
* потом LLM только по shortlist, а не по всей матрице из 40–60 пунктов

Например:

* матрица 30 компетенций
* self-assessment есть по всем 30
* на анализ в LLM отправляешь только:

  * 10 с самым большим gap
  * 5 стратегически важных
  * 5 с сильным Jira signal

Итог: 12–15 компетенций вместо 30–50.

---

# 16. Где LLM ошибется и как подстраховаться

## Риск 1. Галлюцинации по Jira

Решение:

* давать только факты
* просить цитировать `task key`
* запрещать делать выводы без evidence

## Риск 2. Избыточные рекомендации

Решение:

* жесткий JSON schema
* ограничение max_items
* пост-валидация Code node

## Риск 3. Повторяющиеся советы

Решение:

* дедупликация после LLM
* справочник типовых action templates

## Риск 4. Неучет роли

Решение:

* в prompt передавать role criticality
* priority_weight по компетенциям

## Риск 5. Смешение “нет данных” и “низкий уровень”

Решение:

* отдельное поле `confidence`
* отдельное поле `evidence_missing`

---

# 17. Что бы я сделал сначала как MVP

Не пытайся сразу строить всю систему.

## MVP v1

Сделай без Jira:

* ingestion
* competency analysis по self-assessment + matrix
* 6-month development plan
* one-to-one questions

Это даст быстрый результат и позволит отладить:

* модель данных
* prompts
* качество выходов

## MVP v2

Добавь Jira:

* задачи по assignee
* summary
* reconciliation with self-assessment

## MVP v3

Добавь:

* кэш
* UI / экспорт
* историю изменений
* manager overrides
* human-in-the-loop approval

---

# 18. Какой формат итогового отчета я бы выбрал

Лучше не просто markdown-текст, а структурированный JSON + human-readable document.

## JSON

Для машинной обработки и повторного использования

## HTML/Markdown/PDF

Для руководителя

Структура документа:

1. Профиль сотрудника
2. Итоговый вывод
3. Сильные стороны
4. Зоны роста
5. Сопоставление self-assessment и Jira evidence
6. План Q1
7. План Q2
8. Рекомендации руководителю
9. Вопросы для one-to-one

---

# 19. Минимальная схема таблиц в БД

Если будешь хранить в Postgres, я бы сделал так:

* `employees`
* `competency_matrices`
* `matrix_competencies`
* `learning_assets`
* `self_assessments`
* `jira_tasks`
* `employee_assessment_runs`
* `employee_competency_assessments`
* `employee_development_plans`
* `data_quality_issues`

Это сильно облегчит поддержку.

---

# 20. Мой рекомендуемый порядок разработки

## Этап 1. Data contract

Сначала утвердить:

* как выглядят входные таблицы
* как они маппятся в JSON
* какие ключи у role / competency / employee

## Этап 2. Ingestion

Научиться стабильно парсить Excel

## Этап 3. Analysis without Jira

Получить хороший assessment и plan

## Этап 4. Jira enrichment

Добавить evidence

## Этап 5. Reporting

Сделать красивый выход

## Этап 6. Production hardening

* retries
* logging
* cache
* validation
* error handling
* rate limits

---

# 21. Что я бы сделал прямо следующим сообщением

Дальше я могу пойти двумя путями, и лучше делать оба по очереди:

1. расписать тебе конкретную схему n8n-нод по workflow, буквально по узлам: какие node, что в них передавать, какой JSON между ними;
2. дать готовые prompts и JSON schema для всех LLM-этапов.

Логичнее дальше пойти в узлы n8n: `Workflow A/B/C/D` с точной последовательностью нод и примерами payload.





\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\





Отлично. Тогда иду в практику: ниже дам именно схему `n8n` по узлам, с логикой, входами/выходами и тем, как я бы это собирал.

Сделаю так:

1. общая архитектура workflow;
2. подробно `Workflow A: ingestion`;
3. подробно `Workflow B: Jira enrichment`;
4. подробно `Workflow C: competency analysis`;
5. подробно `Workflow D: development plan`;
6. подробно `Workflow E: report/export`;
7. какие поля между узлами передавать;
8. как это собирать как MVP в правильной последовательности.

---

# 1. Общая схема

Я бы сделал 5 workflow:

* `WF00_Orchestrator`
* `WF10_Ingestion_Normalization`
* `WF20_Jira_Enrichment`
* `WF30_Competency_Analysis`
* `WF40_Development_Plan`
* `WF50_Report_Generation`

Главный workflow вызывает остальные через `Execute Workflow`.

Почему так лучше:

* проще отлаживать;
* можно отдельно гонять одного сотрудника;
* проще переиспользовать;
* проще менять Jira/LLM/reporting независимо.

---

# 2. Главный orchestrator — `WF00_Orchestrator`

## Назначение

Запускает весь pipeline по всем сотрудникам или по одному сотруднику.

## Узлы

### 2.1. `Manual Trigger`

Для MVP — ручной запуск.

Потом можно заменить или дополнить:

* `Cron`
* `Webhook`

---

### 2.2. `Set :: Config`

Задаешь конфиг выполнения.

Пример полей:

```json
{
  "run_id": "{{$now}}",
  "review_period_months": 6,
  "max_competencies_per_quarter": 4,
  "use_jira": true,
  "target_employee_login": "",
  "assessment_date": "{{$now}}"
}
```

Если `target_employee_login` пустой — считаем всех.
Если заполнен — только одного.

---

### 2.3. `Execute Workflow :: WF10_Ingestion_Normalization`

На вход:

```json
{
  "run_id": "...",
  "review_period_months": 6,
  "max_competencies_per_quarter": 4,
  "target_employee_login": ""
}
```

На выходе ожидаем:

```json
{
  "employees": [...],
  "matrices": [...],
  "learning_assets": [...],
  "self_assessments": [...],
  "data_quality_issues": [...]
}
```

---

### 2.4. `Code :: Filter Employees`

Логика:

* если `target_employee_login` пустой — оставить всех;
* если заполнен — отфильтровать одного сотрудника.

Выход:
массив сотрудников.

---

### 2.5. `Split In Batches :: Employees`

Обрабатываем сотрудников по одному.

Для MVP — batch size = 1.

---

### 2.6. `Code :: Build Employee Context`

Находит для текущего сотрудника:

* employee;
* его self-assessment;
* его role matrix;
* shortlist learning assets по роли.

Выход:

```json
{
  "employee": {...},
  "self_assessment": {...},
  "role_matrix": {...},
  "learning_assets_pool": [...],
  "config": {...}
}
```

Если чего-то нет:

* не валим весь pipeline;
* выставляем флаги:

```json
{
  "missing_self_assessment": true,
  "missing_matrix": false
}
```

---

### 2.7. `IF :: Has Matrix?`

Если нет матрицы — сотрудника отправляем в ветку `error_report`.

---

### 2.8. `Execute Workflow :: WF20_Jira_Enrichment`

Вызывается только если `use_jira = true`.

Вход:

```json
{
  "employee": {...},
  "config": {...}
}
```

Выход:

```json
{
  "jira_summary": {...},
  "jira_tasks_normalized": [...]
}
```

Если Jira отключена:
через `Set` формируем пустой объект:

```json
{
  "jira_summary": {
    "available": false,
    "reason": "jira_disabled"
  },
  "jira_tasks_normalized": []
}
```

---

### 2.9. `Merge :: Employee + Jira`

Склеиваем:

* employee context
* jira summary

---

### 2.10. `Execute Workflow :: WF30_Competency_Analysis`

Вход:

```json
{
  "employee": {...},
  "self_assessment": {...},
  "role_matrix": {...},
  "learning_assets_pool": [...],
  "jira_summary": {...},
  "config": {...}
}
```

Выход:

```json
{
  "competency_analysis": {...}
}
```

---

### 2.11. `Execute Workflow :: WF40_Development_Plan`

Вход:

```json
{
  "employee": {...},
  "role_matrix": {...},
  "learning_assets_pool": [...],
  "jira_summary": {...},
  "competency_analysis": {...},
  "config": {...}
}
```

Выход:

```json
{
  "development_plan": {...},
  "manager_plan": {...},
  "one2one_guide": {...}
}
```

---

### 2.12. `Execute Workflow :: WF50_Report_Generation`

Вход:
все накопленные артефакты.

Выход:
например:

```json
{
  "employee_report_markdown": "...",
  "employee_report_json": {...}
}
```

---

### 2.13. `Database / Google Sheets / Notion / File`

Сохраняем результат.

Для MVP я бы советовал:

* либо в Postgres,
* либо в Google Sheets + JSON file,
* либо просто в файл.

---

### 2.14. `Merge Results`

После прохода по всем сотрудникам можно собрать summary run-а.

---

# 3. Workflow `WF10_Ingestion_Normalization`

Это самый важный фундамент.

---

## 3.1. Что должен делать

Принять 4 источника данных:

* каталог обучения,
* сотрудники,
* матрицы,
* самооценки,

распарсить и привести к каноническому JSON.

---

## 3.2. Рекомендуемый вариант входа для MVP

Есть 2 пути.

### Вариант 1 — через file upload / binary

Если файлы загружаются на вход workflow.

### Вариант 2 — читать из папки / S3 / Google Drive

Если файлы лежат стабильно.

Для MVP я бы начал с понятного ручного варианта:

* отдельные binary inputs на 4 файла.

---

## 3.3. Узлы workflow

### 3.3.1. `Execute Workflow Trigger`

Чтобы workflow вызывался из orchestrator.

---

### 3.3.2. `Read/Receive File :: Employees`

### 3.3.3. `Spreadsheet File :: Parse Employees`

Настройка:

* operation: read from binary file
* output: JSON
* parse each sheet

---

### 3.3.4. `Code :: Normalize Employees`

Задачи:

* привести имена колонок к стандарту;
* удалить пустые записи;
* нормализовать `role`, `position`, `login`;
* сформировать `employee_id`.

Пример логики:

* `логин|login|ad_login` => `login`
* `фио|full name|name` => `full_name`
* `роль|role` => `role`
* `команда|team` => `team`
* `должность|position` => `position`

Выход:

```json
{
  "employees": [
    {
      "employee_id": "iivanov",
      "login": "iivanov",
      "full_name": "Иванов Иван",
      "role": "backend_engineer",
      "position": "Senior Backend Engineer",
      "team": "Payments"
    }
  ]
}
```

---

### 3.3.5. `Read/Receive File :: Matrices`

### 3.3.6. `Spreadsheet File :: Parse Matrices`

---

### 3.3.7. `Code :: Normalize Matrices`

Это один из самых сложных узлов, потому что Excel с матрицей почти всегда “человеческий”, а не машинный.

Нужно привести к виду:

```json
{
  "matrices": [
    {
      "role": "backend_engineer",
      "competencies": [
        {
          "competency_id": "backend_architecture",
          "name": "Backend Architecture",
          "type": "hard",
          "category": "engineering",
          "description": "...",
          "levels": [
            {"level": 1, "description": "..."},
            {"level": 2, "description": "..."},
            {"level": 3, "description": "..."},
            {"level": 4, "description": "..."}
          ],
          "priority_weight": 0.9
        }
      ]
    }
  ]
}
```

Что делает этот узел:

* определяет, какая строка = компетенция;
* где лежат описания уровней;
* нормализует `competency_id`;
* нормализует `type`: `hard|soft|technology|management`;
* присваивает `priority_weight`, если в файле нет — по дефолту.

Если в твоем Excel матрица разложена по листам “по ролям”, это даже лучше.

---

### 3.3.8. `Read/Receive File :: Learning Assets`

### 3.3.9. `Spreadsheet File :: Parse Learning`

---

### 3.3.10. `Code :: Normalize Learning Assets`

Нормализуем в:

```json
{
  "learning_assets": [
    {
      "asset_id": "course_system_design_01",
      "title": "System Design Basics",
      "type": "course",
      "format": "video",
      "duration_hours": 8,
      "competencies": ["system_design"],
      "recommended_for_roles": ["backend_engineer"],
      "target_levels": [2,3],
      "difficulty": "intermediate",
      "url": "https://..."
    }
  ]
}
```

Если в исходном файле нет `competencies`, а есть только свободный текст описания — это не страшно, но тогда позже лучше сделать отдельный enrichment workflow для классификации ассетов через LLM.

На MVP можно использовать:

* явные теги,
* ключевые слова,
* ручной mapping.

---

### 3.3.11. `Read/Receive File :: Self Assessments`

### 3.3.12. `Spreadsheet File :: Parse Self Assessments`

Если самооценки лежат:

* в одном файле — проще;
* в нескольких файлах по сотрудникам — нужен дополнительный цикл по файлам.

---

### 3.3.13. `Code :: Normalize Self Assessments`

Приводим к:

```json
{
  "self_assessments": [
    {
      "employee_id": "iivanov",
      "role": "backend_engineer",
      "assessment_date": "2026-03-01",
      "items": [
        {
          "competency_id": "backend_architecture",
          "selected_level": 2,
          "comment": "..."
        }
      ]
    }
  ]
}
```

Критично:

* сматчить сотрудника по `login` или `ФИО`;
* лучше всегда стараться выйти на `employee_id = login`.

---

### 3.3.14. `Code :: Validate Data`

Проверки:

* есть ли у каждого employee role;
* есть ли matrix для role;
* есть ли self-assessment для employee;
* есть ли компетенции из self-assessment в matrix;
* есть ли хотя бы какие-то learning assets.

Формируем:

```json
{
  "data_quality_issues": [
    {
      "severity": "warning",
      "entity_type": "employee",
      "entity_id": "iivanov",
      "issue_code": "missing_self_assessment",
      "message": "Не найдена самооценка сотрудника"
    }
  ]
}
```

---

### 3.3.15. `Return`

Возвращаем единый JSON:

```json
{
  "employees": [...],
  "matrices": [...],
  "learning_assets": [...],
  "self_assessments": [...],
  "data_quality_issues": [...]
}
```

---

# 4. Workflow `WF20_Jira_Enrichment`

---

## 4.1. Что делает

По сотруднику вытаскивает Jira-задачи за период и собирает компактный factual summary.

---

## 4.2. Узлы

### 4.2.1. `Execute Workflow Trigger`

---

### 4.2.2. `Code :: Build Date Range`

На основе `review_period_months = 6` строим:

* `period_start`
* `period_end`

Например:

```json
{
  "period_start": "2025-09-21",
  "period_end": "2026-03-21"
}
```

---

### 4.2.3. `Code :: Build JQL`

Здесь формируется JQL.

Базовый вариант:

```sql
assignee = "iivanov"
AND updated >= "2025-09-21"
ORDER BY updated DESC
```

Если хочешь только закрытые:

```sql
assignee = "iivanov"
AND statusCategory = Done
AND updated >= "2025-09-21"
ORDER BY updated DESC
```

Если нужно “участвовал”, это отдельный поток. Потому что “участвовал” в Jira часто не стандартизировано.

---

### 4.2.4. `HTTP Request :: Jira Search`

Запрос в Jira REST API.

Обычно:

* method: POST
* endpoint: `/rest/api/2/search` или `/rest/api/3/search`
* body:

```json
{
  "jql": "...",
  "startAt": 0,
  "maxResults": 50,
  "fields": [
    "summary",
    "issuetype",
    "status",
    "assignee",
    "reporter",
    "created",
    "updated",
    "resolutiondate",
    "description",
    "comment",
    "labels",
    "components",
    "priority"
  ]
}
```

---

### 4.2.5. `IF :: Has More Pages`

Если задач много — пагинация.

Можно сделать loop:

* пока `startAt + maxResults < total`.

---

### 4.2.6. `Code :: Normalize Jira Tasks`

Каждую задачу привести к виду:

```json
{
  "key": "PAY-123",
  "summary": "...",
  "issue_type": "Story",
  "status": "Done",
  "assignee": "iivanov",
  "created": "...",
  "updated": "...",
  "resolved": "...",
  "labels": ["backend"],
  "components": ["billing"],
  "priority": "High",
  "description_text": "...",
  "comment_texts": ["...", "..."]
}
```

Важно:

* description и comments превратить в текст;
* не тащить в LLM весь мусор;
* можно обрезать слишком длинные поля.

---

### 4.2.7. `Code :: Compute Jira Stats`

Считаем:

* total tasks;
* done tasks;
* issue types;
* frequency by labels/components;
* top recurring technical keywords.

Выход:

```json
{
  "stats": {
    "total_tasks": 24,
    "done_tasks": 18,
    "bugs": 5,
    "stories": 11,
    "top_components": ["billing", "api"],
    "top_labels": ["backend", "payments"]
  }
}
```

---

### 4.2.8. `Code :: Shortlist Relevant Tasks`

Отбираем top 10–20 задач для LLM summary:

* самые содержательные;
* закрытые;
* с описанием;
* с полезными комментариями;
* без дублей.

---

### 4.2.9. `HTTP Request / OpenAI-compatible :: LLM Jira Summarizer`

Тут уже можно через OpenAI API-compatible endpoint к твоему прокси.

На вход даем:

```json
{
  "employee": {...},
  "period_start": "...",
  "period_end": "...",
  "tasks": [...]
}
```

Просим:

* не оценивать сотрудника,
* только извлечь factual evidence,
* вернуть JSON.

Ожидаемый output:

```json
{
  "available": true,
  "summary": "Сотрудник в основном работал над backend-задачами в домене billing...",
  "evidence_items": [
    {
      "task_key": "PAY-123",
      "competency_hint": "backend_architecture",
      "evidence": "Участвовал в проектировании механизма retry/idempotency"
    },
    {
      "task_key": "PAY-130",
      "competency_hint": "debugging",
      "evidence": "Исправил production bug в модуле billing"
    }
  ],
  "confidence": "medium",
  "data_coverage": "medium"
}
```

---

### 4.2.10. `Set :: Fallback Jira Summary`

Если LLM упала, вернуть rule-based summary:

```json
{
  "available": true,
  "summary": "Rule-based Jira summary generated",
  "evidence_items": [],
  "confidence": "low",
  "data_coverage": "low"
}
```

---

### 4.2.11. `Return`

---

# 5. Workflow `WF30_Competency_Analysis`

Это ядро.

---

## 5.1. Общая идея

Не анализировать всю матрицу одним запросом. Делать:

1. подготовка shortlist компетенций;
2. LLM-анализ по каждой компетенции;
3. сводный LLM-анализ по сотруднику;
4. post-processing правилами.

---

## 5.2. Узлы

### 5.2.1. `Execute Workflow Trigger`

---

### 5.2.2. `Code :: Build Competency Items`

Собираем список компетенций роли и маппим self-assessment items.

На выходе:

```json
{
  "competency_items": [
    {
      "competency": {...},
      "self_assessment_item": {...},
      "jira_evidence": [...]
    }
  ]
}
```

---

### 5.2.3. `Code :: Score Candidate Priorities`

Rule-based считаем, какие компетенции стоит отправлять в LLM в первую очередь.

Пример факторов:

* есть self comment;
* есть Jira evidence;
* высокий priority_weight;
* gap до ожидаемого уровня;
* критична для роли.

Пример поля:

```json
{
  "candidate_score": 0.82
}
```

---

### 5.2.4. `Code :: Shortlist Competencies`

Оставляем:

* top 10–15 компетенций,
  или
* все, если матрица маленькая.

Для MVP можно сначала прогонять все, если их немного.

---

### 5.2.5. `Split In Batches :: Competency Loop`

---

### 5.2.6. `Set :: Build Competency Analysis Payload`

Формируем компактный payload:

```json
{
  "employee": {
    "login": "iivanov",
    "full_name": "Иванов Иван",
    "role": "backend_engineer",
    "position": "Senior Backend Engineer",
    "team": "Payments"
  },
  "competency": {
    "competency_id": "backend_architecture",
    "name": "Backend Architecture",
    "type": "hard",
    "description": "...",
    "levels": [...]
  },
  "self_assessment_item": {
    "selected_level": 2,
    "comment": "..."
  },
  "jira_evidence": [
    {
      "task_key": "PAY-123",
      "evidence": "..."
    }
  ]
}
```

---

### 5.2.7. `HTTP Request / OpenAI-compatible :: LLM Competency Analysis`

Самый важный LLM-запрос.

Ожидаемый structured output:

```json
{
  "competency_id": "backend_architecture",
  "self_level": 2,
  "estimated_level": 2,
  "confidence": "medium",
  "assessment": "Сотрудник уверенно работает на уровне проектирования отдельных компонентов...",
  "evidence_for": [
    "Комментарий сотрудника о проектировании API",
    "PAY-123: участие в design задачи"
  ],
  "evidence_missing": [
    "Нет признаков ownership архитектуры end-to-end"
  ],
  "risk_flags": [],
  "priority": "high",
  "development_focus": "Развивать навыки архитектурных trade-offs и системного проектирования"
}
```

---

### 5.2.8. `IF :: JSON valid?`

Проверка:

* есть ли обязательные поля;
* уровень — число;
* confidence в допустимом enum.

Если нет — fallback или повтор.

---

### 5.2.9. `Merge :: Collect Competency Results`

После цикла собираем массив.

---

### 5.2.10. `HTTP Request / OpenAI-compatible :: LLM Employee Summary`

Теперь второй LLM-запрос: сводка по сотруднику.

На вход:

* employee;
* результаты competency analysis;
* Jira summary;
* роль.

Выход:

```json
{
  "overall_summary": "Сотрудник демонстрирует уверенный middle+/senior- уровень...",
  "strengths": [
    "Уверенная работа с backend-задачами",
    "Хороший уровень debugging"
  ],
  "growth_areas": [
    "System design",
    "Technical communication"
  ],
  "alignment": {
    "overestimated": [],
    "underestimated": ["debugging"],
    "aligned": ["backend_architecture"]
  },
  "top_priorities_next_6m": [
    "system_design",
    "backend_architecture",
    "stakeholder_communication"
  ],
  "confidence": "medium"
}
```

---

### 5.2.11. `Code :: Apply Business Rules`

Вот здесь очень важно не оставлять всё на LLM.

Правила:

* если `confidence = low`, не делать сильных утверждений;
* если у компетенции мало evidence, помечать как `needs_validation`;
* soft skills не должны забить critical hard skills;
* если selected_level уже максимальный, не ставить это как главный фокус без серьезной причины;
* если role_weight высокий, поднимать приоритет.

На выходе:

```json
{
  "competency_analysis": {
    "competency_results": [...],
    "employee_summary": {...},
    "top_priority_competencies": [...]
  }
}
```

---

# 6. Workflow `WF40_Development_Plan`

---

## 6.1. Что делает

Строит:

* план развития на 6 месяцев;
* план для руководителя;
* сценарий one-to-one.

---

## 6.2. Узлы

### 6.2.1. `Execute Workflow Trigger`

---

### 6.2.2. `Code :: Match Learning Assets to Priorities`

Сначала без LLM выбираем релевантные материалы по топ-компетенциям.

Логика:

* `competency_id` in asset.competencies;
* роль подходит;
* уровень подходит;
* limit per competency: например 5.

Выход:

```json
{
  "learning_shortlist": [
    {
      "competency_id": "system_design",
      "assets": [...]
    }
  ]
}
```

---

### 6.2.3. `Code :: Build Planning Context`

Формируем payload:

```json
{
  "employee": {...},
  "employee_summary": {...},
  "top_priority_competencies": [...],
  "learning_shortlist": [...],
  "constraints": {
    "plan_duration_months": 6,
    "quarters": 2,
    "max_competencies_per_quarter": 4
  }
}
```

---

### 6.2.4. `HTTP Request / OpenAI-compatible :: LLM Development Plan`

Просим вернуть строго JSON.

Ожидаем:

```json
{
  "development_plan": {
    "quarter_1": [
      {
        "competency_id": "system_design",
        "reason": "Критично для следующего шага в роли",
        "target_from": 2,
        "target_to": 3,
        "actions": [
          {
            "type": "course",
            "title": "System Design Basics"
          },
          {
            "type": "practice",
            "title": "Подготовить design proposal по новому сервису"
          }
        ],
        "success_criteria": [
          "Может описать trade-offs",
          "Провел 1 design review"
        ]
      }
    ],
    "quarter_2": [...],
    "plan_summary": "..."
  }
}
```

---

### 6.2.5. `Code :: Validate Plan Constraints`

Проверяем:

* не больше 4 компетенций на квартал;
* нет дублей между кварталами без причины;
* есть success criteria;
* есть хотя бы 1 практика, не только курсы.

Если нарушено:

* либо правим rule-based,
* либо отправляем на re-prompt.

---

### 6.2.6. `HTTP Request / OpenAI-compatible :: LLM Manager Plan`

На вход:

* employee summary;
* development plan.

На выход:

```json
{
  "manager_plan": {
    "focus_areas": [...],
    "support_actions": [...],
    "assignment_recommendations": [...],
    "risks": [...],
    "checkpoints": [...]
  }
}
```

---

### 6.2.7. `HTTP Request / OpenAI-compatible :: LLM One-to-One Guide`

На вход:

* employee summary;
* plan;
* manager plan.

На выход:

```json
{
  "one2one_guide": {
    "conversation_goal": "...",
    "sections": [
      {
        "title": "Обсуждение самооценки",
        "questions": [
          "Какие компетенции ты сам считаешь своими сильными сторонами?"
        ]
      }
    ],
    "closing_questions": [...],
    "agreement_points": [...]
  }
}
```

---

### 6.2.8. `Return`

---

# 7. Workflow `WF50_Report_Generation`

---

## 7.1. Что делает

Собирает всё в человекочитаемый вид.

---

## 7.2. Узлы

### 7.2.1. `Execute Workflow Trigger`

---

### 7.2.2. `Code :: Build Final JSON`

Собираем полный итоговый JSON:

```json
{
  "employee": {...},
  "assessment_meta": {
    "run_id": "...",
    "assessment_date": "...",
    "review_period": "..."
  },
  "jira_summary": {...},
  "competency_analysis": {...},
  "development_plan": {...},
  "manager_plan": {...},
  "one2one_guide": {...},
  "data_quality_issues": [...]
}
```

---

### 7.2.3. `Code :: Render Markdown`

Генерируем markdown-отчет.

Структура:

* Профиль сотрудника
* Общий вывод
* Сильные стороны
* Зоны роста
* Сопоставление самооценки и Jira
* План развития Q1
* План развития Q2
* Рекомендации руководителю
* Вопросы для one-to-one

---

### 7.2.4. `Optional: HTML/PDF conversion`

Если хочешь красивый документ.

---

### 7.2.5. `Save to DB / Docs / Notion / Confluence`

Для MVP можно просто сохранять:

* JSON
* Markdown

---

# 8. Какие данные должны жить между workflow

Очень советую держать канонический contract. Например:

---

## 8.1. Контракт после ingestion

```json
{
  "employees": [],
  "matrices": [],
  "learning_assets": [],
  "self_assessments": [],
  "data_quality_issues": []
}
```

---

## 8.2. Контракт employee context

```json
{
  "employee": {},
  "self_assessment": {},
  "role_matrix": {},
  "learning_assets_pool": [],
  "config": {}
}
```

---

## 8.3. Контракт Jira enrichment

```json
{
  "jira_summary": {
    "available": true,
    "summary": "",
    "stats": {},
    "evidence_items": [],
    "confidence": "medium",
    "data_coverage": "medium"
  },
  "jira_tasks_normalized": []
}
```

---

## 8.4. Контракт competency analysis

```json
{
  "competency_analysis": {
    "competency_results": [],
    "employee_summary": {},
    "top_priority_competencies": []
  }
}
```

---

## 8.5. Контракт development plan

```json
{
  "development_plan": {},
  "manager_plan": {},
  "one2one_guide": {}
}
```

---

# 9. Как я бы делал LLM-вызов в n8n технически

Раз у тебя прокси маршрутизирует OpenAI API в GigaChat, я бы делал через `HTTP Request`, а не через абстрактную AI-ноду, если нужна устойчивость.

## Узел `HTTP Request`

Пример:

* Method: POST
* URL: `https://your-proxy/v1/chat/completions`
* Headers:

  * `Authorization: Bearer {{token}}`
  * `Content-Type: application/json`

Body:

```json
{
  "model": "gigachat-max",
  "temperature": 0.2,
  "messages": [
    {
      "role": "system",
      "content": "..."
    },
    {
      "role": "user",
      "content": "{{JSON.stringify($json.payload)}}"
    }
  ],
  "response_format": {
    "type": "json_object"
  }
}
```

Если твой прокси не поддерживает `response_format`, тогда:

* требуешь строгий JSON;
* после ответа прогоняешь через `Code` и `JSON.parse()`.

---

# 10. Что я бы добавил обязательно для надежности

---

## 10.1. Retry policy

На LLM и Jira — retries.

---

## 10.2. Fallback mode

Если LLM не ответила:

* не падать;
* вернуть минимальный summary.

---

## 10.3. Data quality flags

В итоговом отчете обязательно показывать:

* `low confidence`;
* `insufficient jira evidence`;
* `missing self-assessment comments`.

---

## 10.4. Logging

Минимум логировать:

* employee_id;
* шаг;
* payload size;
* статус;
* время выполнения;
* ошибка.

---

# 11. Какой MVP я бы реально собирал первым

Я бы собирал не всё сразу.

## Итерация 1

Собрать:

* `WF10_Ingestion_Normalization`
* `WF30_Competency_Analysis`
* `WF40_Development_Plan`
* `WF50_Report_Generation`

То есть пока без Jira.

Цель:

* научиться стабильно обрабатывать Excel;
* получить качественный отчет и план развития.

---

## Итерация 2

Добавить `WF20_Jira_Enrichment`.

---

## Итерация 3

Добавить:

* хранение истории в БД;
* approval step руководителя;
* переоценку по кварталам;
* delta analysis между циклами.

---

# 12. Что я советую сделать следующим сообщением

Дальше лучше идти еще глубже и уже почти в реализацию. Самый полезный следующий шаг — я распишу тебе:

* конкретный `WF10_Ingestion_Normalization` по нодам n8n;
* какие `Code node` там нужны;
* какой JavaScript в них писать;
* как нормализовать Excel в JSON на практике.

Это будет уже почти “собирай по инструкции”.





\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\



Тогда идем в `WF10_Ingestion_Normalization` максимально приземленно: какие ноды ставить, что между ними передавать, где писать JS, какие поля нормализовать, как обрабатывать кривые Excel.

Я буду описывать так, как будто ты прямо сейчас собираешь это в `n8n 2.8.4`.

---

# Цель `WF10_Ingestion_Normalization`

Этот workflow должен вернуть единый нормализованный объект:

```json
{
  "employees": [...],
  "matrices": [...],
  "learning_assets": [...],
  "self_assessments": [...],
  "data_quality_issues": [...]
}
```

Он не должен заниматься аналитикой, LLM или Jira. Только:

* прочитать Excel,
* привести к единой структуре,
* проверить целостность.

---

# 1. Как я бы организовал входные файлы

Для MVP рекомендую 4 отдельных файла:

1. `employees.xlsx`
2. `matrices.xlsx`
3. `learning_assets.xlsx`
4. `self_assessments.xlsx`

Даже если потом будет много self-assessment файлов по сотрудникам, сначала лучше научиться работать с одним consolidated файлом.

---

# 2. Схема workflow по нодам

Я бы сделал так:

1. `Execute Workflow Trigger`
2. `Set :: InputConfig`
3. `Read Employees File`
4. `Spreadsheet File :: Parse Employees`
5. `Code :: Normalize Employees`
6. `Read Matrices File`
7. `Spreadsheet File :: Parse Matrices`
8. `Code :: Normalize Matrices`
9. `Read Learning File`
10. `Spreadsheet File :: Parse Learning`
11. `Code :: Normalize Learning`
12. `Read SelfAssessments File`
13. `Spreadsheet File :: Parse SelfAssessments`
14. `Code :: Normalize SelfAssessments`
15. `Merge :: Collect Normalized Data`
16. `Code :: Validate Whole Dataset`
17. `Code :: Build Final Output`

Если файлы приходят как binary снаружи, `Read ... File` можно заменить на входные binary-данные.

---

# 3. Шаг за шагом

## 3.1. `Execute Workflow Trigger`

Это вход для вызова из `WF00_Orchestrator`.

На вход можешь передавать, например:

```json
{
  "files": {
    "employees_path": "/data/employees.xlsx",
    "matrices_path": "/data/matrices.xlsx",
    "learning_path": "/data/learning_assets.xlsx",
    "self_assessments_path": "/data/self_assessments.xlsx"
  },
  "config": {
    "default_competency_priority_weight": 0.5,
    "default_assessment_date": "2026-03-21"
  }
}
```

Если пока запускаешь вручную, можно пути захардкодить через `Set`.

---

## 3.2. `Set :: InputConfig`

Задача:

* вытащить из входа пути к файлам,
* задать дефолты.

Поля примерно такие:

```json
{
  "employees_path": "={{$json.files?.employees_path || '/data/employees.xlsx'}}",
  "matrices_path": "={{$json.files?.matrices_path || '/data/matrices.xlsx'}}",
  "learning_path": "={{$json.files?.learning_path || '/data/learning_assets.xlsx'}}",
  "self_assessments_path": "={{$json.files?.self_assessments_path || '/data/self_assessments.xlsx'}}",
  "default_competency_priority_weight": "={{$json.config?.default_competency_priority_weight || 0.5}}",
  "default_assessment_date": "={{$json.config?.default_assessment_date || $now}}"
}
```

---

# 4. Обработка employees.xlsx

---

## 4.1. `Read Binary File :: Employees`

Если читаешь файл из файловой системы.

Параметры:

* file path: `{{$json.employees_path}}`

На выходе будет binary.

Если у тебя файлы уже приходят в workflow бинарями, этот узел не нужен.

---

## 4.2. `Spreadsheet File :: Parse Employees`

Настройки:

* Operation: `Read from file`
* Input Data Field Name: binary field, например `data`
* Output Format: JSON
* Read all sheets: лучше `true` на старте

Если `employees.xlsx` всегда один лист, можно читать только первый.

---

## 4.3. `Code :: Normalize Employees`

Это первый важный JS-узел.

### Что должен делать

* взять все строки из excel;
* привести названия колонок к стандартным;
* удалить пустые строки;
* почистить пробелы;
* нормализовать `role`;
* нормализовать `login`;
* построить `employee_id`.

### Рекомендуемая каноническая структура

```json
{
  "employee_id": "iivanov",
  "login": "iivanov",
  "full_name": "Иванов Иван",
  "position": "Senior Backend Engineer",
  "team": "Payments",
  "role": "backend_engineer",
  "grade": "senior"
}
```

### Пример кода для `Code` node

```javascript
function normStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function lower(v) {
  return normStr(v).toLowerCase();
}

function slugify(v) {
  return lower(v)
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function normalizeRole(role, position = '') {
  const r = lower(role || position);

  if (r.includes('backend')) return 'backend_engineer';
  if (r.includes('front') || r.includes('frontend')) return 'frontend_engineer';
  if (r.includes('fullstack') || r.includes('full stack')) return 'fullstack_engineer';
  if (r.includes('qa') || r.includes('test')) return 'qa_engineer';
  if (r.includes('devops') || r.includes('sre')) return 'devops_engineer';
  if (r.includes('data engineer')) return 'data_engineer';
  if (r.includes('analyst')) return 'analyst';

  return slugify(role || position || 'unknown_role');
}

function normalizeGrade(position = '') {
  const p = lower(position);
  if (p.includes('junior') || p.includes('jr')) return 'junior';
  if (p.includes('middle') || p.includes('mid')) return 'middle';
  if (p.includes('senior') || p.includes('sr')) return 'senior';
  if (p.includes('lead')) return 'lead';
  return '';
}

function pickField(row, candidates) {
  const entries = Object.entries(row);
  for (const [key, value] of entries) {
    const nk = lower(key);
    if (candidates.some(c => nk === c || nk.includes(c))) {
      return value;
    }
  }
  return '';
}

const rows = items.map(i => i.json);
const issues = [];
const employees = [];
const seen = new Set();

for (const row of rows) {
  const full_name = normStr(
    pickField(row, ['фио', 'сотрудник', 'full name', 'name', 'employee'])
  );

  const loginRaw = normStr(
    pickField(row, ['логин', 'login', 'ad login', 'account', 'username'])
  );

  const position = normStr(
    pickField(row, ['должность', 'position', 'title'])
  );

  const team = normStr(
    pickField(row, ['команда', 'team', 'department', 'unit'])
  );

  const roleRaw = normStr(
    pickField(row, ['роль', 'role'])
  );

  if (!full_name && !loginRaw) {
    continue;
  }

  const login = lower(loginRaw).replace(/\s+/g, '');
  const role = normalizeRole(roleRaw, position);
  const grade = normalizeGrade(position);
  const employee_id = login || slugify(full_name);

  if (!employee_id) {
    issues.push({
      severity: 'error',
      entity_type: 'employee',
      entity_id: '',
      issue_code: 'employee_id_missing',
      message: `Не удалось определить employee_id для строки ${JSON.stringify(row)}`
    });
    continue;
  }

  if (seen.has(employee_id)) {
    issues.push({
      severity: 'warning',
      entity_type: 'employee',
      entity_id: employee_id,
      issue_code: 'duplicate_employee',
      message: `Дублирующийся сотрудник ${employee_id}`
    });
    continue;
  }
  seen.add(employee_id);

  if (!login) {
    issues.push({
      severity: 'warning',
      entity_type: 'employee',
      entity_id: employee_id,
      issue_code: 'missing_login',
      message: `У сотрудника ${full_name} отсутствует login`
    });
  }

  employees.push({
    employee_id,
    login,
    full_name,
    position,
    team,
    role,
    grade
  });
}

return [{
  json: {
    employees,
    employee_issues: issues
  }
}];
```

---

# 5. Обработка matrices.xlsx

Это самый сложный кусок, потому что матрицы редко лежат в идеальном tabular-формате.

Я бы сразу закладывал 2 возможных формата:

## Формат A — нормальный табличный

Одна строка = одна компетенция, колонки:

* role
* competency
* type
* description
* level_1
* level_2
* level_3
* level_4

## Формат B — лист на роль

В каждом листе одна роль и компетенции в строках.

Для MVP лучше сначала поддержать Формат A. Если у тебя другой — адаптируем.

---

## 5.1. `Read Binary File :: Matrices`

Файл с матрицей.

---

## 5.2. `Spreadsheet File :: Parse Matrices`

Читаем все листы в JSON.

Если нода возвращает строки без указания sheet name, потом придется вручную добавлять sheet context другим способом. Если можно — включай sheet metadata.

---

## 5.3. `Code :: Normalize Matrices`

### Канонический вид

```json
{
  "role": "backend_engineer",
  "competencies": [
    {
      "competency_id": "backend_architecture",
      "name": "Backend Architecture",
      "type": "hard",
      "category": "engineering",
      "description": "Проектирование backend-сервисов",
      "levels": [
        {"level": 1, "description": "..."},
        {"level": 2, "description": "..."},
        {"level": 3, "description": "..."},
        {"level": 4, "description": "..."}
      ],
      "priority_weight": 0.8
    }
  ]
}
```

### Пример JS

```javascript
function normStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function lower(v) {
  return normStr(v).toLowerCase();
}

function slugify(v) {
  return lower(v)
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function normalizeRole(role) {
  const r = lower(role);
  if (r.includes('backend')) return 'backend_engineer';
  if (r.includes('front')) return 'frontend_engineer';
  if (r.includes('fullstack')) return 'fullstack_engineer';
  if (r.includes('qa')) return 'qa_engineer';
  if (r.includes('devops') || r.includes('sre')) return 'devops_engineer';
  return slugify(role || 'unknown_role');
}

function normalizeType(type) {
  const t = lower(type);
  if (t.includes('soft')) return 'soft';
  if (t.includes('tech') || t.includes('stack') || t.includes('technology')) return 'technology';
  if (t.includes('management')) return 'management';
  return 'hard';
}

function pickField(row, candidates) {
  const entries = Object.entries(row);
  for (const [key, value] of entries) {
    const nk = lower(key);
    if (candidates.some(c => nk === c || nk.includes(c))) {
      return value;
    }
  }
  return '';
}

const rows = items.map(i => i.json);
const roleMap = new Map();
const issues = [];

for (const row of rows) {
  const roleRaw = normStr(pickField(row, ['role', 'роль']));
  const competencyName = normStr(pickField(row, ['competency', 'компетенция', 'skill', 'навык']));
  const typeRaw = normStr(pickField(row, ['type', 'тип']));
  const category = normStr(pickField(row, ['category', 'категория'])) || 'general';
  const description = normStr(pickField(row, ['description', 'описание']));
  const priorityWeightRaw = pickField(row, ['priority_weight', 'priority', 'вес', 'weight']);

  const level1 = normStr(pickField(row, ['level_1', 'l1', '1', 'уровень 1']));
  const level2 = normStr(pickField(row, ['level_2', 'l2', '2', 'уровень 2']));
  const level3 = normStr(pickField(row, ['level_3', 'l3', '3', 'уровень 3']));
  const level4 = normStr(pickField(row, ['level_4', 'l4', '4', 'уровень 4']));
  const level5 = normStr(pickField(row, ['level_5', 'l5', '5', 'уровень 5']));

  if (!roleRaw && !competencyName) continue;
  if (!roleRaw || !competencyName) {
    issues.push({
      severity: 'warning',
      entity_type: 'matrix',
      entity_id: competencyName || roleRaw || '',
      issue_code: 'incomplete_matrix_row',
      message: `Неполная строка матрицы: ${JSON.stringify(row)}`
    });
    continue;
  }

  const role = normalizeRole(roleRaw);
  const competency_id = slugify(competencyName);
  const type = normalizeType(typeRaw);
  const priority_weight = Number(priorityWeightRaw) || 0.5;

  const levels = [
    { level: 1, description: level1 },
    { level: 2, description: level2 },
    { level: 3, description: level3 },
    { level: 4, description: level4 },
  ];

  if (level5) {
    levels.push({ level: 5, description: level5 });
  }

  const cleanedLevels = levels.filter(l => l.description);

  if (!roleMap.has(role)) {
    roleMap.set(role, {
      role,
      competencies: []
    });
  }

  roleMap.get(role).competencies.push({
    competency_id,
    name: competencyName,
    type,
    category,
    description,
    levels: cleanedLevels,
    priority_weight
  });
}

const matrices = Array.from(roleMap.values());

return [{
  json: {
    matrices,
    matrix_issues: issues
  }
}];
```

---

# 6. Обработка learning_assets.xlsx

---

## 6.1. `Read Binary File :: Learning`

---

## 6.2. `Spreadsheet File :: Parse Learning`

---

## 6.3. `Code :: Normalize Learning`

### Канонический вид

```json
{
  "asset_id": "course_system_design_basics",
  "title": "System Design Basics",
  "type": "course",
  "format": "video",
  "provider": "internal",
  "duration_hours": 8,
  "competencies": ["system_design"],
  "recommended_for_roles": ["backend_engineer"],
  "target_levels": [2, 3],
  "difficulty": "intermediate",
  "url": "https://..."
}
```

### Пример кода

```javascript
function normStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function lower(v) {
  return normStr(v).toLowerCase();
}

function slugify(v) {
  return lower(v)
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function normalizeRole(role) {
  const r = lower(role);
  if (!r) return '';
  if (r.includes('backend')) return 'backend_engineer';
  if (r.includes('front')) return 'frontend_engineer';
  if (r.includes('fullstack')) return 'fullstack_engineer';
  if (r.includes('qa')) return 'qa_engineer';
  if (r.includes('devops') || r.includes('sre')) return 'devops_engineer';
  return slugify(role);
}

function normalizeAssetType(type) {
  const t = lower(type);
  if (t.includes('course') || t.includes('курс')) return 'course';
  if (t.includes('program') || t.includes('программа')) return 'program';
  if (t.includes('task') || t.includes('задание') || t.includes('practice')) return 'practice';
  if (t.includes('book') || t.includes('reading')) return 'reading';
  return 'other';
}

function parseList(value) {
  const s = normStr(value);
  if (!s) return [];
  return s
    .split(/[;,|]/)
    .map(x => x.trim())
    .filter(Boolean);
}

function parseLevels(value) {
  return parseList(value)
    .map(x => Number(x))
    .filter(x => Number.isFinite(x));
}

function pickField(row, candidates) {
  const entries = Object.entries(row);
  for (const [key, value] of entries) {
    const nk = lower(key);
    if (candidates.some(c => nk === c || nk.includes(c))) {
      return value;
    }
  }
  return '';
}

const rows = items.map(i => i.json);
const learning_assets = [];
const issues = [];

for (const row of rows) {
  const title = normStr(pickField(row, ['title', 'название', 'course', 'asset']));
  const typeRaw = normStr(pickField(row, ['type', 'тип']));
  const format = normStr(pickField(row, ['format', 'формат']));
  const provider = normStr(pickField(row, ['provider', 'провайдер', 'source']));
  const duration_hours = Number(pickField(row, ['duration_hours', 'duration', 'hours', 'часы'])) || 0;
  const competenciesRaw = pickField(row, ['competencies', 'компетенции', 'skills']);
  const rolesRaw = pickField(row, ['recommended_for_roles', 'roles', 'для ролей', 'role']);
  const levelsRaw = pickField(row, ['target_levels', 'levels', 'уровни']);
  const difficulty = normStr(pickField(row, ['difficulty', 'сложность']));
  const url = normStr(pickField(row, ['url', 'link', 'ссылка']));
  const description = normStr(pickField(row, ['description', 'описание']));

  if (!title) continue;

  const competencies = parseList(competenciesRaw).map(slugify);
  const recommended_for_roles = parseList(rolesRaw).map(normalizeRole).filter(Boolean);
  const target_levels = parseLevels(levelsRaw);
  const asset_id = slugify(title);

  learning_assets.push({
    asset_id,
    title,
    type: normalizeAssetType(typeRaw),
    format,
    provider,
    duration_hours,
    competencies,
    recommended_for_roles,
    target_levels,
    difficulty,
    url,
    description
  });

  if (!competencies.length) {
    issues.push({
      severity: 'warning',
      entity_type: 'learning_asset',
      entity_id: asset_id,
      issue_code: 'missing_competency_mapping',
      message: `У learning asset "${title}" не указаны competencies`
    });
  }
}

return [{
  json: {
    learning_assets,
    learning_issues: issues
  }
}];
```

---

# 7. Обработка self_assessments.xlsx

Тут обычно бывает больше всего грязи.

---

## 7.1. Какой формат рекомендую на вход

Идеально, если есть плоская таблица:

* employee_login
* full_name
* role
* competency
* selected_level
* comment
* assessment_date

Каждая строка = оценка по одной компетенции.

Это лучший формат для автоматики.

---

## 7.2. `Read Binary File :: Self Assessments`

---

## 7.3. `Spreadsheet File :: Parse Self Assessments`

---

## 7.4. `Code :: Normalize Self Assessments`

### Канонический вид

```json
{
  "employee_id": "iivanov",
  "role": "backend_engineer",
  "assessment_date": "2026-03-01",
  "items": [
    {
      "competency_id": "backend_architecture",
      "selected_level": 2,
      "comment": "..."
    }
  ]
}
```

### Код

```javascript
function normStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function lower(v) {
  return normStr(v).toLowerCase();
}

function slugify(v) {
  return lower(v)
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function normalizeRole(role) {
  const r = lower(role);
  if (r.includes('backend')) return 'backend_engineer';
  if (r.includes('front')) return 'frontend_engineer';
  if (r.includes('fullstack')) return 'fullstack_engineer';
  if (r.includes('qa')) return 'qa_engineer';
  if (r.includes('devops') || r.includes('sre')) return 'devops_engineer';
  return slugify(role || 'unknown_role');
}

function pickField(row, candidates) {
  const entries = Object.entries(row);
  for (const [key, value] of entries) {
    const nk = lower(key);
    if (candidates.some(c => nk === c || nk.includes(c))) {
      return value;
    }
  }
  return '';
}

const rows = items.map(i => i.json);
const grouped = new Map();
const issues = [];

for (const row of rows) {
  const login = lower(pickField(row, ['employee_login', 'login', 'логин']));
  const full_name = normStr(pickField(row, ['full_name', 'фио', 'name']));
  const roleRaw = normStr(pickField(row, ['role', 'роль']));
  const competencyName = normStr(pickField(row, ['competency', 'компетенция', 'skill']));
  const selectedLevelRaw = pickField(row, ['selected_level', 'level', 'уровень']);
  const comment = normStr(pickField(row, ['comment', 'комментарий']));
  const assessmentDate = normStr(pickField(row, ['assessment_date', 'date', 'дата'])) || '';

  if (!login && !full_name) continue;
  if (!competencyName) continue;

  const employee_id = login || slugify(full_name);
  const role = normalizeRole(roleRaw);
  const competency_id = slugify(competencyName);
  const selected_level = Number(selectedLevelRaw);

  if (!Number.isFinite(selected_level)) {
    issues.push({
      severity: 'warning',
      entity_type: 'self_assessment',
      entity_id: employee_id,
      issue_code: 'invalid_selected_level',
      message: `Некорректный уровень для компетенции ${competencyName}`
    });
    continue;
  }

  if (!grouped.has(employee_id)) {
    grouped.set(employee_id, {
      employee_id,
      role,
      assessment_date: assessmentDate,
      items: []
    });
  }

  grouped.get(employee_id).items.push({
    competency_id,
    selected_level,
    comment
  });

  if (!comment) {
    issues.push({
      severity: 'info',
      entity_type: 'self_assessment',
      entity_id: employee_id,
      issue_code: 'empty_comment',
      message: `Пустой комментарий по компетенции ${competencyName}`
    });
  }
}

const self_assessments = Array.from(grouped.values());

return [{
  json: {
    self_assessments,
    self_assessment_issues: issues
  }
}];
```

---

# 8. Как объединить результаты всех четырех веток

После каждого normalize-узла у тебя будет объект вида:

* employees + employee_issues
* matrices + matrix_issues
* learning_assets + learning_issues
* self_assessments + self_assessment_issues

Теперь надо их собрать.

---

## 8.1. `Merge :: Collect Normalized Data`

Удобнее не через один большой `Merge`, а через `Code`, куда сходятся 4 ветки.

Если n8n упрется в неудобную агрегацию, можно сделать проще:

* каждую ветку завершать в `Set` с уникальным ключом;
* потом сводить в одном `Code`.

---

## 8.2. `Code :: Validate Whole Dataset`

Это уже межтабличная проверка.

Что проверяем:

### По сотрудникам

* у каждого employee есть `role`
* у role есть матрица
* у employee есть self-assessment
* лучше, если есть login

### По self-assessment

* каждая competency есть в matrix соответствующей роли
* role из self-assessment совпадает с role сотрудника или пустая
* selected_level не выше максимального уровня матрицы

### По learning assets

* есть хотя бы часть материалов, привязанных к приоритетным компетенциям
* если mapping нет, просто warning

### Пример кода

```javascript
const input = items[0].json;

const employees = input.employees || [];
const matrices = input.matrices || [];
const learning_assets = input.learning_assets || [];
const self_assessments = input.self_assessments || [];

const issues = [
  ...(input.employee_issues || []),
  ...(input.matrix_issues || []),
  ...(input.learning_issues || []),
  ...(input.self_assessment_issues || []),
];

const employeeMap = new Map(employees.map(e => [e.employee_id, e]));
const matrixMap = new Map(matrices.map(m => [m.role, m]));
const selfMap = new Map(self_assessments.map(s => [s.employee_id, s]));

for (const employee of employees) {
  if (!employee.role) {
    issues.push({
      severity: 'error',
      entity_type: 'employee',
      entity_id: employee.employee_id,
      issue_code: 'missing_role',
      message: `У сотрудника ${employee.employee_id} отсутствует role`
    });
  }

  if (employee.role && !matrixMap.has(employee.role)) {
    issues.push({
      severity: 'error',
      entity_type: 'employee',
      entity_id: employee.employee_id,
      issue_code: 'missing_role_matrix',
      message: `Для role ${employee.role} не найдена матрица`
    });
  }

  if (!selfMap.has(employee.employee_id)) {
    issues.push({
      severity: 'warning',
      entity_type: 'employee',
      entity_id: employee.employee_id,
      issue_code: 'missing_self_assessment',
      message: `Для сотрудника ${employee.employee_id} не найдена самооценка`
    });
  }
}

for (const sa of self_assessments) {
  const employee = employeeMap.get(sa.employee_id);
  if (!employee) {
    issues.push({
      severity: 'warning',
      entity_type: 'self_assessment',
      entity_id: sa.employee_id,
      issue_code: 'self_assessment_without_employee',
      message: `Самооценка есть, но сотрудник не найден`
    });
    continue;
  }

  const matrix = matrixMap.get(employee.role);
  if (!matrix) continue;

  const competencyMap = new Map(
    (matrix.competencies || []).map(c => [c.competency_id, c])
  );

  for (const item of sa.items || []) {
    const mc = competencyMap.get(item.competency_id);

    if (!mc) {
      issues.push({
        severity: 'warning',
        entity_type: 'self_assessment',
        entity_id: sa.employee_id,
        issue_code: 'unknown_competency_in_self_assessment',
        message: `Компетенция ${item.competency_id} отсутствует в матрице роли ${employee.role}`
      });
      continue;
    }

    const maxLevel = Math.max(...(mc.levels || []).map(l => l.level));
    if (item.selected_level > maxLevel) {
      issues.push({
        severity: 'warning',
        entity_type: 'self_assessment',
        entity_id: sa.employee_id,
        issue_code: 'selected_level_above_matrix_max',
        message: `Уровень ${item.selected_level} выше максимального ${maxLevel} по ${item.competency_id}`
      });
    }
  }
}

return [{
  json: {
    employees,
    matrices,
    learning_assets,
    self_assessments,
    data_quality_issues: issues
  }
}];
```

---

# 9. Практический совет по реальным Excel

Почти наверняка файлы будут “грязные”. Поэтому сразу закладывай 3 слоя устойчивости:

## 9.1. Словарь синонимов колонок

Держи в одном месте mappings:

* `логин`, `login`, `ad_login`, `user`
* `компетенция`, `skill`, `competency`
* `уровень`, `selected_level`, `level`

Лучше вынести это в отдельный `Code` helper или в `Set` с конфигом.

---

## 9.2. Нормализация строк

Всегда:

* trim,
* collapse spaces,
* lowercase для matching,
* slugify для id.

---

## 9.3. Не валить весь pipeline

Если в одном employee ошибка:

* это warning/error в `data_quality_issues`,
* но остальные сотрудники должны пойти дальше.

---

# 10. Что считать “ошибкой”, а что “warning”

Я бы разделил так:

## Error

То, из-за чего нельзя строить анализ:

* нет матрицы для роли;
* нет employee_id;
* матрица пустая;
* self-assessment невозможно привязать ни к кому.

## Warning

То, что ухудшает качество, но не блокирует:

* нет комментария в самооценке;
* нет login;
* часть competency не найдена;
* нет привязки learning assets к competencies.

## Info

Низкоприоритетные замечания:

* нет duration_hours у курса;
* role выведена эвристикой;
* grade не определен.

---

# 11. Какой output должен вернуть `WF10`

Я бы возвращал так:

```json
{
  "employees": [...],
  "matrices": [...],
  "learning_assets": [...],
  "self_assessments": [...],
  "data_quality_issues": [...],
  "stats": {
    "employees_count": 125,
    "matrices_count": 6,
    "learning_assets_count": 320,
    "self_assessments_count": 112,
    "issues_count": 47
  }
}
```

Это потом удобно логировать и показывать в orchestrator.

---

# 12. Как тестировать `WF10`

Тестируй не на идеальных файлах, а на 5 кейсах:

## Кейс 1

Все файлы хорошие.

## Кейс 2

У сотрудника нет login.

## Кейс 3

В self-assessment есть competency, которой нет в matrix.

## Кейс 4

У learning assets нет маппинга на competencies.

## Кейс 5

В файле матрицы один role написан как `Backend`, другой как `backend engineer`.

Если этот workflow стабильно проходит эти 5 кейсов — база нормальная.

---

# 13. Что я бы сделал после сборки `WF10`

До перехода к Jira и LLM я бы сделал еще один маленький служебный workflow:

## `WF11_Prepare_Employee_Context`

Он берет output `WF10` и по одному сотруднику собирает:

```json
{
  "employee": {...},
  "self_assessment": {...},
  "role_matrix": {...},
  "learning_assets_pool": [...]
}
```

Это очень удобный промежуточный шаг перед аналитикой.

---

# 14. Где чаще всего ломается именно этот этап

Самые частые проблемы будут такие:

## Матрица не табличная

Если там merged cells, заголовки в несколько строк, декоративные блоки — надо сначала сделать pre-cleaning или отдельный parser именно под твой шаблон.

## Самооценка по-разному называет компетенции

Например:

* в матрице `System Design`
* в самооценке `Проектирование систем`

Тогда нужен alias mapping competencies.

## Один и тот же сотрудник по ФИО записан по-разному

Тогда нельзя полагаться только на ФИО — лучше login.

---

# 15. Что я предлагаю следующим шагом

Сейчас логичнее всего пойти в следующий уровень и собрать `WF11_Prepare_Employee_Context` и `WF30_Competency_Analysis` уже так же приземленно:

* какие ноды,
* какой payload,
* какой prompt,
* какой JSON schema,
* как валидировать ответ LLM.

Это уже будет переход от “данные подготовили” к “начали реально оценивать сотрудника”.





\\\\\\\\\\\\\\\\\\\\\\\\\\\\\




Тогда идем в следующий практический слой: `WF11_Prepare_Employee_Context` и `WF30_Competency_Analysis`.

Здесь уже начинается “мозг” системы:

* из общих нормализованных данных собрать контекст конкретного сотрудника;
* аккуратно подготовить данные для LLM;
* не отправлять в модель лишнее;
* получить структурированный результат по компетенциям;
* сделать сводку по сотруднику.

Я бы строил это именно в два workflow, а не одним:

1. `WF11_Prepare_Employee_Context`
2. `WF30_Competency_Analysis`

---

# 1. `WF11_Prepare_Employee_Context`

## Цель

Из общего normalized dataset собрать контекст одного сотрудника.

На вход:

```json
{
  "normalized_data": {
    "employees": [...],
    "matrices": [...],
    "learning_assets": [...],
    "self_assessments": [...],
    "data_quality_issues": [...]
  },
  "employee_id": "iivanov",
  "config": {
    "learning_assets_limit_per_competency": 5
  }
}
```

На выход:

```json
{
  "employee": {...},
  "self_assessment": {...},
  "role_matrix": {...},
  "learning_assets_pool": [...],
  "employee_data_quality_issues": [...]
}
```

---

## 1.1. Узлы workflow

### `Execute Workflow Trigger`

---

### `Code :: Extract Input`

Просто привести вход к удобному виду.

Пример:

```javascript
const normalized = $json.normalized_data || {};
const employee_id = $json.employee_id;
const config = $json.config || {};

return [{
  json: {
    employees: normalized.employees || [],
    matrices: normalized.matrices || [],
    learning_assets: normalized.learning_assets || [],
    self_assessments: normalized.self_assessments || [],
    data_quality_issues: normalized.data_quality_issues || [],
    employee_id,
    config
  }
}];
```

---

### `Code :: Build Employee Context`

Это ключевой узел.

Что делает:

* находит сотрудника;
* находит его матрицу по роли;
* находит его self-assessment;
* фильтрует learning assets по роли;
* собирает issues только по нему.

### Код

```javascript
const {
  employees = [],
  matrices = [],
  learning_assets = [],
  self_assessments = [],
  data_quality_issues = [],
  employee_id,
  config = {}
} = $json;

const employee = employees.find(e => e.employee_id === employee_id) || null;
if (!employee) {
  return [{
    json: {
      employee: null,
      self_assessment: null,
      role_matrix: null,
      learning_assets_pool: [],
      employee_data_quality_issues: [{
        severity: 'error',
        entity_type: 'employee',
        entity_id: employee_id,
        issue_code: 'employee_not_found',
        message: `Сотрудник ${employee_id} не найден`
      }]
    }
  }];
}

const role_matrix = matrices.find(m => m.role === employee.role) || null;
const self_assessment = self_assessments.find(s => s.employee_id === employee.employee_id) || null;

const learning_assets_pool = learning_assets.filter(asset => {
  if (!asset.recommended_for_roles || asset.recommended_for_roles.length === 0) return true;
  return asset.recommended_for_roles.includes(employee.role);
});

const employee_data_quality_issues = data_quality_issues.filter(issue =>
  !issue.entity_id ||
  issue.entity_id === employee.employee_id ||
  issue.entity_id === employee.role
);

return [{
  json: {
    employee,
    self_assessment,
    role_matrix,
    learning_assets_pool,
    employee_data_quality_issues,
    config
  }
}];
```

---

### `IF :: Has employee?`

Если сотрудник не найден — можно завершать с ошибкой.

---

### `IF :: Has role_matrix?`

Если нет матрицы — дальше нельзя.

---

### `Set :: Flags`

Добавь флаги, это потом сильно упрощает аналитику.

Пример:

```json
{
  "has_self_assessment": "={{!!$json.self_assessment}}",
  "has_role_matrix": "={{!!$json.role_matrix}}",
  "has_learning_assets_pool": "={{($json.learning_assets_pool || []).length > 0}}"
}
```

---

### `Return`

---

# 2. Что именно должно уходить в `WF30_Competency_Analysis`

Не весь employee context подряд.

Важный принцип: LLM должна получать только релевантный кусок.

Поэтому `WF30` я делю на этапы:

1. Подготовка competency items
2. Rule-based shortlist
3. LLM-анализ по каждой компетенции
4. Сводный LLM-анализ по сотруднику
5. Post-processing бизнес-правилами

---

# 3. `WF30_Competency_Analysis`

## Вход

```json
{
  "employee": {...},
  "self_assessment": {...},
  "role_matrix": {...},
  "learning_assets_pool": [...],
  "jira_summary": {...},
  "employee_data_quality_issues": [...],
  "config": {
    "max_competencies_for_llm": 12,
    "expected_target_level_by_grade": {
      "junior": 2,
      "middle": 3,
      "senior": 4,
      "lead": 4
    }
  }
}
```

---

# 4. Схема workflow по нодам

1. `Execute Workflow Trigger`
2. `Code :: Build Competency Items`
3. `Code :: Score Competencies`
4. `Code :: Shortlist Competencies`
5. `Split In Batches :: Competency Loop`
6. `Set :: Build Per-Competency LLM Payload`
7. `HTTP Request :: LLM Competency Analysis`
8. `Code :: Parse/Validate Competency Result`
9. `Merge :: Collect Competency Results`
10. `Code :: Build Employee Summary Payload`
11. `HTTP Request :: LLM Employee Summary`
12. `Code :: Parse/Validate Employee Summary`
13. `Code :: Apply Business Rules`
14. `Return`

---

# 5. Узел `Code :: Build Competency Items`

## Что делает

Из матрицы и самооценки собирает список компетенций сотрудника.

Каждый item должен содержать:

* competency из матрицы;
* self-assessment item;
* jira evidence для этой компетенции;
* расчетный target level.

### Выход

```json
{
  "competency_items": [
    {
      "competency": {...},
      "self_assessment_item": {...},
      "jira_evidence": [...],
      "target_level": 4
    }
  ]
}
```

### Код

```javascript
const {
  employee,
  self_assessment,
  role_matrix,
  jira_summary = {},
  config = {}
} = $json;

const expectedTargetByGrade = config.expected_target_level_by_grade || {
  junior: 2,
  middle: 3,
  senior: 4,
  lead: 4
};

const target_level = expectedTargetByGrade[employee.grade] || 3;

const selfMap = new Map(
  ((self_assessment?.items) || []).map(item => [item.competency_id, item])
);

const evidenceItems = jira_summary?.evidence_items || [];

const competency_items = (role_matrix?.competencies || []).map(comp => {
  const self_assessment_item = selfMap.get(comp.competency_id) || {
    competency_id: comp.competency_id,
    selected_level: null,
    comment: ''
  };

  const jira_evidence = evidenceItems.filter(e =>
    e.competency_hint === comp.competency_id ||
    e.competency_hint === comp.name ||
    (e.competency_hint || '').toLowerCase() === comp.competency_id.toLowerCase()
  );

  return {
    competency: comp,
    self_assessment_item,
    jira_evidence,
    target_level
  };
});

return [{
  json: {
    ...$json,
    competency_items
  }
}];
```

---

# 6. Узел `Code :: Score Competencies`

## Зачем

Не все компетенции одинаково важны для анализа.

Нужен приоритетный score, чтобы:

* если компетенций 40, не гонять все в LLM;
* сначала анализировать самые важные.

### Логика score

Я бы использовал такую эвристику:

* `priority_weight` компетенции из матрицы
* есть ли самооценка
* есть ли комментарий
* есть ли Jira evidence
* есть ли gap до target level
* soft skills чуть ниже приоритета, если есть критичные hard skills

### Код

```javascript
const competency_items = $json.competency_items || [];

function scoreItem(item) {
  const comp = item.competency || {};
  const self = item.self_assessment_item || {};
  const jira = item.jira_evidence || [];

  const priorityWeight = Number(comp.priority_weight || 0.5);
  const selfLevel = Number(self.selected_level || 0);
  const targetLevel = Number(item.target_level || 3);
  const gap = Math.max(0, targetLevel - selfLevel);

  const hasComment = self.comment && self.comment.trim().length > 20 ? 1 : 0;
  const jiraSignal = Math.min(jira.length, 3) / 3;

  let typeFactor = 1;
  if (comp.type === 'soft') typeFactor = 0.85;
  if (comp.type === 'management') typeFactor = 0.8;

  const score =
    priorityWeight * 0.35 +
    gap * 0.25 +
    hasComment * 0.15 +
    jiraSignal * 0.15 +
    typeFactor * 0.10;

  return Number(score.toFixed(4));
}

const scored = competency_items.map(item => ({
  ...item,
  candidate_score: scoreItem(item)
}));

return [{
  json: {
    ...$json,
    competency_items_scored: scored
  }
}];
```

---

# 7. Узел `Code :: Shortlist Competencies`

## Зачем

Ограничить число LLM-запросов.

### Логика

* сортируем по `candidate_score`
* берем top N
* но стараемся оставить хотя бы немного hard + soft, если оба типа есть

### Код

```javascript
const itemsScored = $json.competency_items_scored || [];
const maxCompetencies = $json.config?.max_competencies_for_llm || 12;

const sorted = [...itemsScored].sort((a, b) => b.candidate_score - a.candidate_score);
const shortlisted = sorted.slice(0, maxCompetencies);

return [{
  json: {
    ...$json,
    shortlisted_competencies: shortlisted
  }
}];
```

Для MVP можно без сложной балансировки типов.

---

# 8. `Split In Batches :: Competency Loop`

Batch size = 1.

На каждой итерации анализируется одна компетенция.

---

# 9. `Set :: Build Per-Competency LLM Payload`

Собираем чистый payload для модели.

### Что важно

Не пихать туда весь employee context.
Только то, что реально нужно.

### Структура

```json
{
  "employee": {
    "employee_id": "...",
    "full_name": "...",
    "role": "...",
    "position": "...",
    "team": "...",
    "grade": "..."
  },
  "competency": {
    "competency_id": "...",
    "name": "...",
    "type": "...",
    "category": "...",
    "description": "...",
    "levels": [...]
  },
  "target_level": 4,
  "self_assessment_item": {
    "selected_level": 2,
    "comment": "..."
  },
  "jira_evidence": [
    {
      "task_key": "PAY-123",
      "evidence": "..."
    }
  ]
}
```

В `Set` лучше собрать payload в поле `payload`.

---

# 10. `HTTP Request :: LLM Competency Analysis`

Я бы делал это через OpenAI-compatible HTTP Request.

## Пример body

```json
{
  "model": "gigachat-max",
  "temperature": 0.2,
  "messages": [
    {
      "role": "system",
      "content": "Ты анализируешь одну компетенцию инженера. Оценивай только на основе переданных данных. Не выдумывай evidence. Если данных недостаточно, прямо укажи это. Не путай 'нет данных' и 'низкий уровень'. Верни строго JSON."
    },
    {
      "role": "user",
      "content": "Проанализируй компетенцию и верни JSON по схеме:\n{\n  \"competency_id\": \"string\",\n  \"self_level\": 0,\n  \"estimated_level\": 0,\n  \"confidence\": \"low|medium|high\",\n  \"assessment\": \"string\",\n  \"evidence_for\": [\"string\"],\n  \"evidence_missing\": [\"string\"],\n  \"risk_flags\": [\"string\"],\n  \"priority\": \"low|medium|high\",\n  \"development_focus\": \"string\"\n}\n\nДанные:\n"
    },
    {
      "role": "user",
      "content": "={{JSON.stringify($json.payload)}}"
    }
  ],
  "response_format": {
    "type": "json_object"
  }
}
```

Если твой прокси не принимает `response_format`, убирай его.

---

# 11. Узел `Code :: Parse/Validate Competency Result`

Это обязательно. Нельзя слепо верить LLM-output.

## Что проверяем

* `competency_id` есть
* `self_level` — число или null
* `estimated_level` — число
* `confidence` входит в enum
* `priority` входит в enum
* массивы — массивы

### Код

```javascript
function safeParse(content) {
  if (typeof content === 'object' && content !== null) return content;
  try {
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
}

function normalizeEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

const raw =
  $json.choices?.[0]?.message?.content ??
  $json.message?.content ??
  $json.content ??
  $json;

const parsed = safeParse(raw);

if (!parsed) {
  return [{
    json: {
      valid: false,
      error: 'invalid_json_from_llm',
      competency_result: null
    }
  }];
}

const result = {
  competency_id: parsed.competency_id || '',
  self_level: Number.isFinite(Number(parsed.self_level)) ? Number(parsed.self_level) : null,
  estimated_level: Number.isFinite(Number(parsed.estimated_level)) ? Number(parsed.estimated_level) : null,
  confidence: normalizeEnum(parsed.confidence, ['low', 'medium', 'high'], 'low'),
  assessment: String(parsed.assessment || ''),
  evidence_for: Array.isArray(parsed.evidence_for) ? parsed.evidence_for : [],
  evidence_missing: Array.isArray(parsed.evidence_missing) ? parsed.evidence_missing : [],
  risk_flags: Array.isArray(parsed.risk_flags) ? parsed.risk_flags : [],
  priority: normalizeEnum(parsed.priority, ['low', 'medium', 'high'], 'medium'),
  development_focus: String(parsed.development_focus || '')
};

const valid = !!result.competency_id && result.estimated_level !== null;

return [{
  json: {
    valid,
    error: valid ? null : 'missing_required_fields',
    competency_result: result
  }
}];
```

---

# 12. Что делать, если LLM вернула мусор

Сразу закладывай fallback.

## Вариант MVP

Если ответ невалидный:

* не делать retry 10 раз;
* возвращать rule-based fallback.

### Пример fallback result

```javascript
const item = $input.first().json.payload || {};
const self = item.self_assessment_item || {};
const comp = item.competency || {};

return [{
  json: {
    valid: true,
    error: 'fallback_used',
    competency_result: {
      competency_id: comp.competency_id,
      self_level: self.selected_level ?? null,
      estimated_level: self.selected_level ?? 0,
      confidence: 'low',
      assessment: 'LLM-анализ недоступен, использована базовая интерпретация самооценки без качественного анализа.',
      evidence_for: [],
      evidence_missing: ['Недостаточно валидного LLM-анализа'],
      risk_flags: ['fallback_used'],
      priority: 'medium',
      development_focus: 'Требуется ручная проверка'
    }
  }
}];
```

Практически это лучше вынести в отдельную ветку `IF valid?`.

---

# 13. Сбор результатов цикла

После `Split In Batches` нужно собрать все `competency_result` обратно в массив.

Обычно:

* `Merge`/`Aggregate`
* или отдельный `Code`, если твоя сборка n8n так удобнее.

На выходе хочется получить:

```json
{
  "competency_results": [
    {
      "competency_id": "backend_architecture",
      ...
    }
  ]
}
```

---

# 14. `Code :: Build Employee Summary Payload`

Теперь у нас есть результаты по компетенциям.
Делаем сводный payload для второго LLM-запроса.

### Код

```javascript
const {
  employee,
  jira_summary = {},
  employee_data_quality_issues = []
} = $json;

const competency_results = $json.competency_results || [];

const payload = {
  employee: {
    employee_id: employee.employee_id,
    full_name: employee.full_name,
    role: employee.role,
    position: employee.position,
    team: employee.team,
    grade: employee.grade
  },
  jira_summary: {
    available: jira_summary.available ?? false,
    summary: jira_summary.summary || '',
    confidence: jira_summary.confidence || 'low',
    evidence_items: jira_summary.evidence_items || []
  },
  competency_results,
  data_quality_flags: employee_data_quality_issues.map(i => ({
    severity: i.severity,
    issue_code: i.issue_code,
    message: i.message
  }))
};

return [{
  json: {
    ...$json,
    employee_summary_payload: payload
  }
}];
```

---

# 15. `HTTP Request :: LLM Employee Summary`

Задача модели:

* не переоценивать человека;
* сделать сводный вывод;
* выделить сильные стороны, зоны роста, alignment self-assessment vs evidence;
* выбрать топ-приоритеты на 6 месяцев.

## Пример system prompt

```text
Ты анализируешь инженерный профиль сотрудника по результатам анализа компетенций.
Опирайся только на переданные данные.
Если есть слабое evidence, отмечай это явно.
Не путай отсутствие данных с отсутствием компетенции.
Верни строго JSON.
```

## Пример user prompt

```text
Верни JSON по схеме:
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
{{JSON.stringify($json.employee_summary_payload)}}
```

---

# 16. `Code :: Parse/Validate Employee Summary`

Та же идея: валидируем.

### Код

```javascript
function safeParse(content) {
  if (typeof content === 'object' && content !== null) return content;
  try {
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
}

function normArray(v) {
  return Array.isArray(v) ? v.map(x => String(x)) : [];
}

const raw =
  $json.choices?.[0]?.message?.content ??
  $json.message?.content ??
  $json.content ??
  $json;

const parsed = safeParse(raw);

if (!parsed) {
  return [{
    json: {
      valid: false,
      error: 'invalid_json_from_llm',
      employee_summary: null
    }
  }];
}

const employee_summary = {
  overall_summary: String(parsed.overall_summary || ''),
  strengths: normArray(parsed.strengths),
  growth_areas: normArray(parsed.growth_areas),
  alignment: {
    overestimated: normArray(parsed.alignment?.overestimated),
    underestimated: normArray(parsed.alignment?.underestimated),
    aligned: normArray(parsed.alignment?.aligned)
  },
  top_priorities_next_6m: normArray(parsed.top_priorities_next_6m),
  confidence: ['low', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : 'low'
};

return [{
  json: {
    valid: true,
    error: null,
    employee_summary
  }
}];
```

---

# 17. `Code :: Apply Business Rules`

Это очень важный пост-процессинг. Именно здесь ты переводишь LLM-вывод в управляемый результат.

## Что здесь делать

### 17.1. Ограничить top priorities

Например максимум 6.

### 17.2. Учитывать низкую уверенность

Если у большинства компетенций `confidence = low`, итоговый summary должен явно это отражать.

### 17.3. Не путать “нет Jira” и “плохой инженер”

Если `jira_summary.available = false`, просто добавляем флаг низкой полноты evidence.

### 17.4. Подготовить удобный итоговый объект

### Пример кода

```javascript
const competency_results = $json.competency_results || [];
const employee_summary = $json.employee_summary || {};
const jira_summary = $json.jira_summary || {};

const lowConfidenceCount = competency_results.filter(x => x.confidence === 'low').length;
const totalCount = competency_results.length || 1;

const analysis_quality = lowConfidenceCount / totalCount > 0.5 ? 'low' : 'medium';

const top_priority_competencies = competency_results
  .filter(x => x.priority === 'high' || x.priority === 'medium')
  .sort((a, b) => {
    const pr = { high: 3, medium: 2, low: 1 };
    return pr[b.priority] - pr[a.priority];
  })
  .slice(0, 8)
  .map(x => x.competency_id);

const flags = [];
if (!jira_summary.available) {
  flags.push('jira_unavailable');
}
if (analysis_quality === 'low') {
  flags.push('low_evidence_confidence');
}

return [{
  json: {
    competency_analysis: {
      competency_results,
      employee_summary,
      top_priority_competencies,
      analysis_quality,
      flags
    }
  }
}];
```

---

# 18. Какой итог должен вернуть `WF30`

```json
{
  "competency_analysis": {
    "competency_results": [
      {
        "competency_id": "backend_architecture",
        "self_level": 2,
        "estimated_level": 2,
        "confidence": "medium",
        "assessment": "...",
        "evidence_for": ["..."],
        "evidence_missing": ["..."],
        "risk_flags": [],
        "priority": "high",
        "development_focus": "..."
      }
    ],
    "employee_summary": {
      "overall_summary": "...",
      "strengths": ["..."],
      "growth_areas": ["..."],
      "alignment": {
        "overestimated": [],
        "underestimated": [],
        "aligned": []
      },
      "top_priorities_next_6m": ["system_design", "backend_architecture"],
      "confidence": "medium"
    },
    "top_priority_competencies": [
      "system_design",
      "backend_architecture"
    ],
    "analysis_quality": "medium",
    "flags": []
  }
}
```

---

# 19. Практические замечания по prompt-дизайну

## Делай temperature низкой

Для таких задач:

* `0.1–0.3`

## Проси только JSON

Без prose вокруг.

## Запрещай домыслы явно

Фразами типа:

* “не выдумывай evidence”
* “если данных недостаточно, укажи insufficient evidence”
* “не путай отсутствие данных с низким уровнем”

## Не отправляй модель на все компетенции сразу

Иначе качество сильно просядет.

---

# 20. Что я бы сделал как MVP прямо сейчас

Если хочешь быстро запустить:

1. `WF10` уже готовим
2. `WF11` собираем контекст
3. `WF30` делаем без Jira или с пустым `jira_summary`
4. получаем assessment по self-assessment + matrix
5. только потом добавляем Jira

Потому что это уже даст 70% ценности.

---

# 21. Где тут чаще всего будут проблемы

## Не совпадают `competency_id`

Матрица и самооценка по-разному называют одну и ту же компетенцию.

Решение:

* alias mapping таблица
* либо preprocessing LLM/classifier один раз

## Модель пишет невалидный JSON

Решение:

* validation node
* fallback
* при необходимости один retry

## Слишком много компетенций

Решение:

* shortlist

## Слишком слабые comments в самооценке

Решение:

* не скрывать это, а отражать в confidence

---

# 22. Что лучше сделать следующим сообщением

Теперь самый логичный следующий шаг — `WF40_Development_Plan` в том же стиле:

* как матчить компетенции с курсами,
* как строить план на Q1/Q2,
* как делать manager plan,
* как генерировать вопросы на one-to-one,
* с конкретными payload и prompt-структурой.

Это уже будет почти полный рабочий pipeline.








\\\\\\\\\\\\\\\\\\\\\\\







Погнали. Ниже распишу `WF40_Development_Plan` так же приземленно: по нодам, данным, правилам, prompt-ам и валидации. Это уже почти финальный “боевой” слой после оценки компетенций.

Здесь цель не просто “сгенерить красивый план”, а получить управляемый, реалистичный и проверяемый output:

* план развития на 6 месяцев;
* разбиение на 2 квартала;
* не больше 3–4 компетенций на квартал;
* привязка к конкретным материалам;
* план для руководителя;
* вопросы для one-to-one.

---

# 1. Что должно входить в `WF40_Development_Plan`

На вход workflow я бы подавал вот такой объект:

```json
{
  "employee": {
    "employee_id": "iivanov",
    "full_name": "Иванов Иван",
    "role": "backend_engineer",
    "position": "Senior Backend Engineer",
    "team": "Payments",
    "grade": "senior"
  },
  "role_matrix": {
    "role": "backend_engineer",
    "competencies": []
  },
  "learning_assets_pool": [],
  "jira_summary": {
    "available": true,
    "summary": "",
    "evidence_items": [],
    "confidence": "medium"
  },
  "competency_analysis": {
    "competency_results": [],
    "employee_summary": {},
    "top_priority_competencies": [],
    "analysis_quality": "medium",
    "flags": []
  },
  "config": {
    "plan_duration_months": 6,
    "quarters": 2,
    "max_competencies_per_quarter": 4,
    "max_assets_per_competency": 5
  }
}
```

---

# 2. Что должно выйти из `WF40`

На выходе я бы хотел получить 3 отдельных артефакта:

```json
{
  "development_plan": {
    "quarter_1": [],
    "quarter_2": [],
    "plan_summary": ""
  },
  "manager_plan": {
    "focus_areas": [],
    "support_actions": [],
    "assignment_recommendations": [],
    "risks": [],
    "checkpoints": []
  },
  "one2one_guide": {
    "conversation_goal": "",
    "sections": [],
    "closing_questions": [],
    "agreement_points": []
  }
}
```

---

# 3. Общая схема `WF40_Development_Plan`

Я бы строил workflow так:

1. `Execute Workflow Trigger`
2. `Code :: Extract Planning Inputs`
3. `Code :: Build Competency Metadata Map`
4. `Code :: Match Learning Assets`
5. `Code :: Build Planning Candidates`
6. `Code :: Shortlist Plan Candidates`
7. `Code :: Build LLM Planning Payload`
8. `HTTP Request :: LLM Development Plan`
9. `Code :: Parse/Validate Development Plan`
10. `Code :: Repair Plan Constraints`
11. `HTTP Request :: LLM Manager Plan`
12. `Code :: Parse/Validate Manager Plan`
13. `HTTP Request :: LLM One2One Guide`
14. `Code :: Parse/Validate One2One Guide`
15. `Return`

---

# 4. Узел `Code :: Extract Planning Inputs`

Это просто подготовка.

### Код

```javascript
const {
  employee,
  role_matrix,
  learning_assets_pool = [],
  jira_summary = {},
  competency_analysis = {},
  config = {}
} = $json;

return [{
  json: {
    employee,
    role_matrix,
    learning_assets_pool,
    jira_summary,
    competency_analysis,
    config: {
      plan_duration_months: config.plan_duration_months || 6,
      quarters: config.quarters || 2,
      max_competencies_per_quarter: config.max_competencies_per_quarter || 4,
      max_assets_per_competency: config.max_assets_per_competency || 5
    }
  }
}];
```

---

# 5. Узел `Code :: Build Competency Metadata Map`

Зачем:

* потом быстро обогащать `top_priority_competencies`;
* подтягивать описания компетенций и уровней из матрицы;
* знать `type`, `priority_weight`, `description`.

### Код

```javascript
const competencies = $json.role_matrix?.competencies || [];

const competency_map = {};
for (const c of competencies) {
  competency_map[c.competency_id] = c;
}

return [{
  json: {
    ...$json,
    competency_map
  }
}];
```

---

# 6. Узел `Code :: Match Learning Assets`

Это важный узел. Я бы не отдавал матчинг материалов полностью на LLM. Сначала делаем deterministic shortlist.

## Что должен делать

Для каждой приоритетной компетенции:

* найти релевантные материалы;
* учесть роль;
* учесть target/current level;
* ограничить количество.

## Источник приоритетов

Берем из:

* `competency_analysis.top_priority_competencies`
* или fallback: top `priority=high` из `competency_results`

---

## Код

```javascript
const {
  learning_assets_pool = [],
  competency_analysis = {},
  competency_map = {},
  config = {}
} = $json;

const maxAssetsPerCompetency = config.max_assets_per_competency || 5;

const topPriorityIds =
  competency_analysis.top_priority_competencies?.length
    ? competency_analysis.top_priority_competencies
    : (competency_analysis.competency_results || [])
        .filter(x => x.priority === 'high')
        .map(x => x.competency_id);

const result = [];

for (const competency_id of topPriorityIds) {
  const compMeta = competency_map[competency_id];
  if (!compMeta) continue;

  const matched = learning_assets_pool
    .filter(asset => Array.isArray(asset.competencies) && asset.competencies.includes(competency_id))
    .slice(0, maxAssetsPerCompetency);

  result.push({
    competency_id,
    competency_name: compMeta.name,
    competency_type: compMeta.type,
    matched_assets: matched
  });
}

return [{
  json: {
    ...$json,
    learning_matches: result
  }
}];
```

---

# 7. Что делать, если в learning assets слабый mapping

Это частый кейс. Тогда deterministic matching будет слабым.

Я бы делал 3 уровня зрелости:

## Уровень 1 — простой exact match

`asset.competencies includes competency_id`

## Уровень 2 — alias mapping

Например:

* `system_design` = `архитектура`, `design`, `system architecture`

## Уровень 3 — enrichment ассетов заранее через LLM

Один раз прогоняешь каталог и каждой записи проставляешь:

* competencies
* target_levels
* roles
* type of activity

Я бы очень рекомендовал именно это сделать отдельно позже. Это резко улучшит качество планов.

---

# 8. Узел `Code :: Build Planning Candidates`

Теперь надо построить кандидатов в план: по каждой приоритетной компетенции собрать полный контекст.

### Что включить

* `competency_id`
* `competency_name`
* `current estimated level`
* `self level`
* `target level`
* `assessment summary`
* `development_focus`
* `evidence_missing`
* `matched learning assets`

### Код

```javascript
const {
  competency_analysis = {},
  competency_map = {},
  learning_matches = []
} = $json;

const results = competency_analysis.competency_results || [];
const learningMap = new Map(
  learning_matches.map(x => [x.competency_id, x])
);

const planning_candidates = results
  .filter(r => competency_analysis.top_priority_competencies?.includes(r.competency_id))
  .map(r => {
    const meta = competency_map[r.competency_id] || {};
    const match = learningMap.get(r.competency_id);

    return {
      competency_id: r.competency_id,
      competency_name: meta.name || r.competency_id,
      competency_type: meta.type || 'hard',
      description: meta.description || '',
      levels: meta.levels || [],
      self_level: r.self_level,
      estimated_level: r.estimated_level,
      target_level: null,
      confidence: r.confidence,
      assessment: r.assessment,
      development_focus: r.development_focus,
      evidence_for: r.evidence_for || [],
      evidence_missing: r.evidence_missing || [],
      priority: r.priority,
      learning_assets: match?.matched_assets || []
    };
  });

return [{
  json: {
    ...$json,
    planning_candidates
  }
}];
```

Пока `target_level = null`, если не сохранил его раньше. Лучше тянуть target из предыдущего workflow, но на MVP можно считать его позже по уровням/грейду.

---

# 9. Узел `Code :: Shortlist Plan Candidates`

Нужен, чтобы:

* не перегружать план;
* отобрать максимум 6–8 кандидатов на 2 квартала;
* убрать то, что явно не нужно.

## Бизнес-правила

Я бы тут закладывал:

1. Берем в приоритет `priority = high`.
2. Потом `priority = medium`.
3. Компетенции с `confidence = low` не выбрасываем, но можем понизить.
4. Если estimated_level уже высокий и gap небольшой, не ставим это в основную зону развития без причины.
5. Мягко балансируем hard/soft.

### Код

```javascript
const candidates = $json.planning_candidates || [];
const maxTotal = ($json.config?.max_competencies_per_quarter || 4) * 2;

function scoreCandidate(c) {
  const priorityScore = c.priority === 'high' ? 3 : c.priority === 'medium' ? 2 : 1;
  const confidencePenalty = c.confidence === 'low' ? -0.5 : 0;
  const typeBonus = c.competency_type === 'hard' || c.competency_type === 'technology' ? 0.3 : 0;
  const hasAssets = (c.learning_assets || []).length > 0 ? 0.2 : 0;
  return priorityScore + confidencePenalty + typeBonus + hasAssets;
}

const shortlisted = [...candidates]
  .sort((a, b) => scoreCandidate(b) - scoreCandidate(a))
  .slice(0, maxTotal);

return [{
  json: {
    ...$json,
    shortlisted_plan_candidates: shortlisted
  }
}];
```

---

# 10. Узел `Code :: Build LLM Planning Payload`

Теперь собираем очень аккуратный payload для генерации плана.

## Структура payload

```json
{
  "employee": {...},
  "employee_summary": {...},
  "jira_summary": {...},
  "constraints": {
    "plan_duration_months": 6,
    "quarters": 2,
    "max_competencies_per_quarter": 4
  },
  "planning_candidates": [...]
}
```

### Код

```javascript
const {
  employee,
  jira_summary = {},
  competency_analysis = {},
  shortlisted_plan_candidates = [],
  config = {}
} = $json;

const payload = {
  employee: {
    employee_id: employee.employee_id,
    full_name: employee.full_name,
    role: employee.role,
    position: employee.position,
    team: employee.team,
    grade: employee.grade
  },
  employee_summary: competency_analysis.employee_summary || {},
  jira_summary: {
    available: jira_summary.available ?? false,
    summary: jira_summary.summary || '',
    confidence: jira_summary.confidence || 'low'
  },
  constraints: {
    plan_duration_months: config.plan_duration_months || 6,
    quarters: config.quarters || 2,
    max_competencies_per_quarter: config.max_competencies_per_quarter || 4,
    max_total_competencies: (config.max_competencies_per_quarter || 4) * (config.quarters || 2)
  },
  planning_candidates: shortlisted_plan_candidates
};

return [{
  json: {
    ...$json,
    development_plan_payload: payload
  }
}];
```

---

# 11. `HTTP Request :: LLM Development Plan`

Это центральный запрос workflow.

## Что должна сделать модель

* выбрать разумные фокусы на 2 квартала;
* не распихать одинаковые компетенции без логики;
* использовать только переданные материалы;
* дать измеримые шаги;
* разделить “обучение” и “практику”;
* не делать воду.

---

## System prompt

```text
Ты формируешь реалистичный полугодовой план развития IT-инженера.
Опирайся только на переданные данные.
Не выдумывай новые курсы, материалы и факты, которых нет во входных данных.
Если материалов недостаточно, делай упор на практику, менторинг, shadowing, design review, code review, internal knowledge sharing.
План должен быть реалистичным для работающего инженера.
Не включай больше допустимого числа компетенций на квартал.
Не дублируй одни и те же компетенции без явной причины.
Для каждой компетенции укажи конкретный фокус развития и измеримые критерии прогресса.
Верни строго JSON.
```

---

## User prompt

```text
Верни JSON по схеме:

{
  "development_plan": {
    "quarter_1": [
      {
        "competency_id": "string",
        "competency_name": "string",
        "reason": "string",
        "target_from": 0,
        "target_to": 0,
        "actions": [
          {
            "type": "course|program|practice|mentoring|reading|shadowing|project",
            "title": "string",
            "description": "string"
          }
        ],
        "success_criteria": ["string"],
        "manager_support": ["string"]
      }
    ],
    "quarter_2": [
      {
        "competency_id": "string",
        "competency_name": "string",
        "reason": "string",
        "target_from": 0,
        "target_to": 0,
        "actions": [
          {
            "type": "course|program|practice|mentoring|reading|shadowing|project",
            "title": "string",
            "description": "string"
          }
        ],
        "success_criteria": ["string"],
        "manager_support": ["string"]
      }
    ],
    "plan_summary": "string"
  }
}

Требования:
- не больше {{$json.development_plan_payload.constraints.max_competencies_per_quarter}} компетенций на квартал;
- использовать прежде всего переданные planning_candidates;
- предпочитать не более 6-8 компетенций на все полугодие;
- в каждом квартале должен быть баланс: не только обучение, но и практика;
- не придумывать learning assets, которых нет во входных данных;
- если конкретных материалов мало, используй практические активности на рабочем месте.

Данные:
={{JSON.stringify($json.development_plan_payload)}}
```

---

# 12. Узел `Code :: Parse/Validate Development Plan`

Это обязательно.

## Что проверять

* есть `development_plan`
* `quarter_1` и `quarter_2` — массивы
* в каждом квартале не больше allowed limit
* у каждого item есть `competency_id`, `actions`, `success_criteria`

### Код

```javascript
function safeParse(content) {
  if (typeof content === 'object' && content !== null) return content;
  try {
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
}

const raw =
  $json.choices?.[0]?.message?.content ??
  $json.message?.content ??
  $json.content ??
  $json;

const parsed = safeParse(raw);

if (!parsed || !parsed.development_plan) {
  return [{
    json: {
      valid: false,
      error: 'invalid_development_plan_json',
      development_plan: null
    }
  }];
}

const dp = parsed.development_plan;

const result = {
  quarter_1: Array.isArray(dp.quarter_1) ? dp.quarter_1 : [],
  quarter_2: Array.isArray(dp.quarter_2) ? dp.quarter_2 : [],
  plan_summary: String(dp.plan_summary || '')
};

return [{
  json: {
    valid: true,
    error: null,
    development_plan: result
  }
}];
```

---

# 13. Узел `Code :: Repair Plan Constraints`

Даже если LLM старалась, она может нарушить ограничения. Тут правим.

## Что чинить

1. больше 4 компетенций в квартале — обрезать;
2. пустые actions — добавить fallback practice;
3. пустые success criteria — добавить базовые;
4. если весь квартал состоит только из курсов — добавить практику;
5. если quarter_2 пустой, а все запихнуто в quarter_1 — перераспределить хвост.

### Пример кода

```javascript
const plan = $json.development_plan || { quarter_1: [], quarter_2: [], plan_summary: '' };
const maxPerQuarter = $json.config?.max_competencies_per_quarter || 4;

function ensureItem(item) {
  const fixed = { ...item };

  fixed.actions = Array.isArray(fixed.actions) ? fixed.actions : [];
  fixed.success_criteria = Array.isArray(fixed.success_criteria) ? fixed.success_criteria : [];
  fixed.manager_support = Array.isArray(fixed.manager_support) ? fixed.manager_support : [];

  if (!fixed.actions.length) {
    fixed.actions.push({
      type: 'practice',
      title: 'Практическое применение в рабочих задачах',
      description: 'Выбрать рабочую задачу или инициативу, где можно целенаправленно развивать эту компетенцию'
    });
  }

  if (!fixed.success_criteria.length) {
    fixed.success_criteria.push('Есть наблюдаемый прогресс по компетенции в рабочих задачах');
  }

  const hasPractice = fixed.actions.some(a =>
    ['practice', 'project', 'shadowing', 'mentoring'].includes(a.type)
  );

  if (!hasPractice) {
    fixed.actions.push({
      type: 'practice',
      title: 'Применить знания в рабочем контексте',
      description: 'Закрепить изученное через рабочую задачу, review или внутреннюю инициативу'
    });
  }

  return fixed;
}

let q1 = (plan.quarter_1 || []).map(ensureItem);
let q2 = (plan.quarter_2 || []).map(ensureItem);

if (q1.length > maxPerQuarter) {
  const overflow = q1.slice(maxPerQuarter);
  q1 = q1.slice(0, maxPerQuarter);
  q2 = overflow.concat(q2);
}

if (q2.length > maxPerQuarter) {
  q2 = q2.slice(0, maxPerQuarter);
}

return [{
  json: {
    ...$json,
    development_plan: {
      quarter_1: q1,
      quarter_2: q2,
      plan_summary: plan.plan_summary || ''
    }
  }
}];
```

---

# 14. `HTTP Request :: LLM Manager Plan`

Теперь строим отдельный управленческий план. Это должен быть не пересказ development plan, а именно рекомендации руководителю.

## Что просить

* на что смотреть;
* какие задачи давать;
* где поддержать;
* какие риски;
* как проверять прогресс.

---

## System prompt

```text
Ты помогаешь руководителю провести развитие инженера на горизонте полугодия.
Опирайся только на предоставленный анализ и план развития.
Не переписывай план сотрудника дословно.
Сформируй управленческие рекомендации: какие условия создать, какие задачи давать, как отслеживать прогресс, какие риски учитывать.
Верни строго JSON.
```

---

## User prompt

```text
Верни JSON по схеме:

{
  "manager_plan": {
    "focus_areas": ["string"],
    "support_actions": ["string"],
    "assignment_recommendations": ["string"],
    "risks": ["string"],
    "checkpoints": ["string"]
  }
}

Данные:
{
  "employee": {{$json.employee ? JSON.stringify($json.employee) : "{}"}},
  "employee_summary": {{$json.competency_analysis?.employee_summary ? JSON.stringify($json.competency_analysis.employee_summary) : "{}"}},
  "development_plan": {{$json.development_plan ? JSON.stringify($json.development_plan) : "{}"}},
  "analysis_quality": "{{$json.competency_analysis?.analysis_quality || 'medium'}}",
  "flags": {{$json.competency_analysis?.flags ? JSON.stringify($json.competency_analysis.flags) : "[]"}}
}
```

---

# 15. Узел `Code :: Parse/Validate Manager Plan`

### Код

```javascript
function safeParse(content) {
  if (typeof content === 'object' && content !== null) return content;
  try {
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
}

function normArray(v) {
  return Array.isArray(v) ? v.map(x => String(x)) : [];
}

const raw =
  $json.choices?.[0]?.message?.content ??
  $json.message?.content ??
  $json.content ??
  $json;

const parsed = safeParse(raw);

if (!parsed || !parsed.manager_plan) {
  return [{
    json: {
      valid: false,
      error: 'invalid_manager_plan_json',
      manager_plan: null
    }
  }];
}

return [{
  json: {
    valid: true,
    error: null,
    manager_plan: {
      focus_areas: normArray(parsed.manager_plan.focus_areas),
      support_actions: normArray(parsed.manager_plan.support_actions),
      assignment_recommendations: normArray(parsed.manager_plan.assignment_recommendations),
      risks: normArray(parsed.manager_plan.risks),
      checkpoints: normArray(parsed.manager_plan.checkpoints)
    }
  }
}];
```

---

# 16. `HTTP Request :: LLM One2One Guide`

Теперь генерим сценарий one-to-one.

## Что надо получить

Не “10 общих вопросов”, а структуру беседы:

* цель встречи;
* секции;
* вопросы по самооценке;
* вопросы по реальному опыту;
* вопросы по мотивации и барьерам;
* как закрыть встречу договоренностями.

---

## System prompt

```text
Ты готовишь структуру one-to-one руководителя с инженером по итогам оценки компетенций и плана развития.
Разговор должен быть уважительным, конкретным и ориентированным на развитие, а не на оценочное давление.
Вопросы должны помогать:
- обсудить самооценку,
- сверить ее с рабочими примерами,
- выявить барьеры,
- согласовать фокусы развития,
- зафиксировать следующие шаги.
Верни строго JSON.
```

---

## User prompt

```text
Верни JSON по схеме:

{
  "one2one_guide": {
    "conversation_goal": "string",
    "sections": [
      {
        "title": "string",
        "questions": ["string"]
      }
    ],
    "closing_questions": ["string"],
    "agreement_points": ["string"]
  }
}

Данные:
{
  "employee": {{$json.employee ? JSON.stringify($json.employee) : "{}"}},
  "employee_summary": {{$json.competency_analysis?.employee_summary ? JSON.stringify($json.competency_analysis.employee_summary) : "{}"}},
  "development_plan": {{$json.development_plan ? JSON.stringify($json.development_plan) : "{}"}},
  "manager_plan": {{$json.manager_plan ? JSON.stringify($json.manager_plan) : "{}"}}
}
```

---

# 17. Узел `Code :: Parse/Validate One2One Guide`

### Код

```javascript
function safeParse(content) {
  if (typeof content === 'object' && content !== null) return content;
  try {
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
}

function normArray(v) {
  return Array.isArray(v) ? v.map(x => String(x)) : [];
}

const raw =
  $json.choices?.[0]?.message?.content ??
  $json.message?.content ??
  $json.content ??
  $json;

const parsed = safeParse(raw);

if (!parsed || !parsed.one2one_guide) {
  return [{
    json: {
      valid: false,
      error: 'invalid_one2one_json',
      one2one_guide: null
    }
  }];
}

const sections = Array.isArray(parsed.one2one_guide.sections)
  ? parsed.one2one_guide.sections.map(s => ({
      title: String(s.title || ''),
      questions: normArray(s.questions)
    }))
  : [];

return [{
  json: {
    valid: true,
    error: null,
    one2one_guide: {
      conversation_goal: String(parsed.one2one_guide.conversation_goal || ''),
      sections,
      closing_questions: normArray(parsed.one2one_guide.closing_questions),
      agreement_points: normArray(parsed.one2one_guide.agreement_points)
    }
  }
}];
```

---

# 18. Что я бы добавил как business rules уже здесь

Это очень полезно, чтобы план не выглядел как “магия LLM”.

## 18.1. Не больше 1–2 soft skills в квартал

Иначе можно уехать в “коммуникацию” вместо ключевых инженерных гэпов.

## 18.2. В каждом квартале хотя бы одна рабочая практика

Например:

* провести design review;
* взять ownership на модуль;
* подготовить техproposal;
* провести demo/knowledge-sharing;
* выступить reviewer в code review.

## 18.3. Не больше 2 крупных обучающих активностей на квартал

Иначе план будет нереалистичный.

## 18.4. Если confidence низкая — формулируй это в плане

Например:

* “Проверить гипотезу через практическую задачу и наблюдение”
  вместо
* “Поднимать с 1 до 3”.

## 18.5. Использовать Jira evidence не как приговор, а как контекст

Если по компетенции мало Jira evidence, руководителю можно рекомендовать дать наблюдаемую задачу.

---

# 19. Каким должен быть хороший item плана

Вот хороший формат одного элемента:

```json
{
  "competency_id": "system_design",
  "competency_name": "System Design",
  "reason": "Компетенция критична для следующего шага в роли, при этом текущие evidence показывают уверенную базу, но недостаток в проектировании end-to-end решений.",
  "target_from": 2,
  "target_to": 3,
  "actions": [
    {
      "type": "course",
      "title": "System Design Basics",
      "description": "Пройти курс и законспектировать ключевые trade-offs"
    },
    {
      "type": "practice",
      "title": "Подготовить design proposal",
      "description": "Сделать проектирование одного сервиса/подсистемы и пройти review с lead engineer"
    }
  ],
  "success_criteria": [
    "Может объяснить основные trade-offs выбранного решения",
    "Подготовил и защитил минимум один design proposal",
    "Получил подтверждение прогресса от руководителя/техлида"
  ],
  "manager_support": [
    "Дать задачу с архитектурной составляющей",
    "Организовать review design proposal"
  ]
}
```

---

# 20. Как бы я советовал выбирать активности

План должен содержать 4 типа активностей, а не только курсы:

## 1. Изучение

Курс, программа, чтение.

## 2. Практика

Рабочая задача, проект, техproposal, PoC.

## 3. Обратная связь

Review, shadowing, mentoring, разбор решения.

## 4. Демонстрация результата

Demo, knowledge sharing, защита решения, presentation.

Если в каждом квартале есть эти 4 слоя — план гораздо сильнее.

---

# 21. Частые ошибки в development plan

## Ошибка 1

План из одних курсов.

Исправление:

* форсить practice + manager support.

## Ошибка 2

Слишком много компетенций.

Исправление:

* жесткий cap в code node.

## Ошибка 3

Размытые success criteria.
Например:

* “улучшить коммуникацию”
* “лучше понимать архитектуру”

Исправление:

* требовать наблюдаемое поведение.

## Ошибка 4

Одинаковые задачи в Q1 и Q2.

Исправление:

* Q1 foundation, Q2 application/ownership.

## Ошибка 5

Игнор роли.
Например у backend engineer план из soft skills и тайм-менеджмента.

Исправление:

* использовать `priority_weight` и hard-skill bias.

---

# 22. Что я бы сделал после `WF40`

После этого уже логично делать `WF50_Report_Generation`, где всё красиво собирается:

* summary;
* competency analysis;
* Jira reconciliation;
* development plan;
* manager plan;
* one2one guide.

И параллельно стоит сделать еще один маленький workflow или кодовый слой:

* `WF41_Plan_Scoring`
  который ставит “качественную оценку” самому плану:
* realism score
* balance score
* evidence score

Это опционально, но полезно.

---

# 23. Как я бы собирал MVP по порядку

Если ты реально сейчас идешь руками в n8n, порядок такой:

1. `WF10_Ingestion_Normalization`
2. `WF11_Prepare_Employee_Context`
3. `WF30_Competency_Analysis`
4. `WF40_Development_Plan`
5. только потом `WF20_Jira_Enrichment`
6. потом `WF50_Report_Generation`

Причина простая: без Jira уже можно получить работающий MVP, а Jira добавишь как enrichment.

---

# 24. Что делать следующим сообщением

Теперь у нас почти закрыта вся “логика” решения. Дальше есть два самых полезных направления.

Первое — я могу расписать `WF50_Report_Generation` по нодам и сразу дать шаблон итогового markdown/json-отчета для сотрудника и руководителя.

Второе — могу дать тебе набор готовых prompt-ов целиком:

* для анализа одной компетенции,
* для employee summary,
* для development plan,
* для manager plan,
* для one-to-one,

уже в финальном виде, чтобы ты просто вставил их в `HTTP Request` ноды.







\\\\\\\\\\\\\\\\







Отлично. Тогда дам оба блока сразу:

1. `WF50_Report_Generation` по нодам;
2. готовые prompt-ы для всех LLM-этапов в финальном виде.

Сделаю так, чтобы ты мог почти копипастить в `n8n`.

---

# Часть 1. `WF50_Report_Generation`

## Цель workflow

Собрать все результаты по сотруднику в два формата:

* `machine-readable JSON` — для хранения, повторной обработки, BI, истории;
* `human-readable Markdown` — для руководителя, HRBP, one-to-one, отправки в Confluence/Notion/email.

---

## Что должно приходить на вход

```json
{
  "employee": {
    "employee_id": "iivanov",
    "full_name": "Иванов Иван",
    "role": "backend_engineer",
    "position": "Senior Backend Engineer",
    "team": "Payments",
    "grade": "senior"
  },
  "self_assessment": {},
  "role_matrix": {},
  "jira_summary": {},
  "competency_analysis": {},
  "development_plan": {},
  "manager_plan": {},
  "one2one_guide": {},
  "employee_data_quality_issues": [],
  "config": {
    "run_id": "2026-03-21T12:00:00Z",
    "assessment_date": "2026-03-21",
    "review_period_start": "2025-09-21",
    "review_period_end": "2026-03-21"
  }
}
```

---

## Что должно выйти

```json
{
  "employee_report_json": {...},
  "employee_report_markdown": "...",
  "report_meta": {
    "employee_id": "iivanov",
    "report_filename": "iivanov_2026-03-21.md"
  }
}
```

---

# Схема `WF50_Report_Generation`

Я бы сделал такие узлы:

1. `Execute Workflow Trigger`
2. `Code :: Build Final Report JSON`
3. `Code :: Build Derived View Models`
4. `Code :: Render Markdown Report`
5. `Code :: Render Compact Manager Summary`
6. `Optional :: Save JSON`
7. `Optional :: Save Markdown`
8. `Return`

---

# 1. `Code :: Build Final Report JSON`

Это канонический объект отчета.

### Код

```javascript
const {
  employee,
  self_assessment = null,
  role_matrix = null,
  jira_summary = {},
  competency_analysis = {},
  development_plan = {},
  manager_plan = {},
  one2one_guide = {},
  employee_data_quality_issues = [],
  config = {}
} = $json;

const employee_report_json = {
  meta: {
    run_id: config.run_id || '',
    assessment_date: config.assessment_date || '',
    review_period_start: config.review_period_start || '',
    review_period_end: config.review_period_end || '',
    generated_at: new Date().toISOString()
  },
  employee,
  self_assessment,
  role_matrix: role_matrix
    ? {
        role: role_matrix.role,
        competencies_count: (role_matrix.competencies || []).length
      }
    : null,
  jira_summary,
  competency_analysis,
  development_plan,
  manager_plan,
  one2one_guide,
  data_quality_issues: employee_data_quality_issues
};

return [{
  json: {
    ...$json,
    employee_report_json
  }
}];
```

---

# 2. `Code :: Build Derived View Models`

Это слой “удобных представлений” для markdown.

Чтобы не рендерить markdown на сыром JSON, лучше подготовить view-model.

### Что удобно подготовить

* strengths block
* growth areas block
* competency table rows
* q1/q2 plan blocks
* manager bullets
* one2one sections
* quality flags

### Код

```javascript
const report = $json.employee_report_json;

const employee = report.employee || {};
const summary = report.competency_analysis?.employee_summary || {};
const competencyResults = report.competency_analysis?.competency_results || [];
const developmentPlan = report.development_plan || {};
const managerPlan = report.manager_plan || {};
const one2oneGuide = report.one2one_guide || {};
const jiraSummary = report.jira_summary || {};
const issues = report.data_quality_issues || [];

const strengths = summary.strengths || [];
const growthAreas = summary.growth_areas || [];
const topPriorities = summary.top_priorities_next_6m || [];
const alignment = summary.alignment || {
  overestimated: [],
  underestimated: [],
  aligned: []
};

const competencyRows = competencyResults.map(r => ({
  competency_id: r.competency_id,
  self_level: r.self_level,
  estimated_level: r.estimated_level,
  confidence: r.confidence,
  priority: r.priority,
  assessment: r.assessment,
  development_focus: r.development_focus
}));

const q1 = developmentPlan.quarter_1 || [];
const q2 = developmentPlan.quarter_2 || [];

const highSeverityIssues = issues.filter(i => i.severity === 'error' || i.severity === 'warning');

return [{
  json: {
    ...$json,
    report_view: {
      employee,
      summary,
      strengths,
      growthAreas,
      topPriorities,
      alignment,
      competencyRows,
      q1,
      q2,
      managerPlan,
      one2oneGuide,
      jiraSummary,
      issues,
      highSeverityIssues
    }
  }
}];
```

---

# 3. `Code :: Render Markdown Report`

Это главный человеческий отчет.

Я бы делал его в markdown, потому что:

* легко сохранить;
* легко отправить;
* легко конвертировать в HTML/PDF;
* удобно класть в Notion/Confluence.

---

## Рекомендуемая структура markdown

```md
# Отчет по оценке компетенций и плану развития

## 1. Профиль сотрудника
## 2. Общий вывод
## 3. Сильные стороны
## 4. Зоны роста
## 5. Сопоставление самооценки и evidence
## 6. Jira summary
## 7. Детализация по компетенциям
## 8. План развития Q1
## 9. План развития Q2
## 10. Рекомендации руководителю
## 11. Вопросы и структура one-to-one
## 12. Ограничения и качество данных
```

---

## Код рендера markdown

```javascript
function bulletList(items) {
  if (!items || !items.length) return '- Нет данных';
  return items.map(x => `- ${x}`).join('\n');
}

function safe(v) {
  return v === null || v === undefined || v === '' ? '—' : String(v);
}

function renderPlanQuarter(items, quarterTitle) {
  if (!items || !items.length) {
    return `### ${quarterTitle}\n\nНет запланированных компетенций.\n`;
  }

  let out = `### ${quarterTitle}\n\n`;
  items.forEach((item, idx) => {
    out += `#### ${idx + 1}. ${safe(item.competency_name)} \`${safe(item.competency_id)}\`\n\n`;
    out += `**Почему выбрано:** ${safe(item.reason)}\n\n`;
    out += `**Целевой переход:** ${safe(item.target_from)} → ${safe(item.target_to)}\n\n`;

    out += `**Действия:**\n`;
    if (Array.isArray(item.actions) && item.actions.length) {
      item.actions.forEach(a => {
        out += `- [${safe(a.type)}] **${safe(a.title)}** — ${safe(a.description)}\n`;
      });
    } else {
      out += `- Нет действий\n`;
    }
    out += `\n`;

    out += `**Критерии прогресса:**\n`;
    out += `${bulletList(item.success_criteria)}\n\n`;

    out += `**Поддержка руководителя:**\n`;
    out += `${bulletList(item.manager_support)}\n\n`;
  });

  return out;
}

function renderCompetencyTable(rows) {
  if (!rows || !rows.length) return 'Нет данных по компетенциям.\n';

  let out = '| Competency | Self | Estimated | Confidence | Priority | Focus |\n';
  out += '|---|---:|---:|---|---|---|\n';

  for (const r of rows) {
    out += `| ${safe(r.competency_id)} | ${safe(r.self_level)} | ${safe(r.estimated_level)} | ${safe(r.confidence)} | ${safe(r.priority)} | ${safe(r.development_focus)} |\n`;
  }

  return out;
}

const view = $json.report_view;
const meta = $json.employee_report_json?.meta || {};

const md = `# Отчет по оценке компетенций и плану развития

## 1. Профиль сотрудника

- **ФИО:** ${safe(view.employee.full_name)}
- **Employee ID:** ${safe(view.employee.employee_id)}
- **Роль:** ${safe(view.employee.role)}
- **Должность:** ${safe(view.employee.position)}
- **Команда:** ${safe(view.employee.team)}
- **Грейд:** ${safe(view.employee.grade)}
- **Дата оценки:** ${safe(meta.assessment_date)}
- **Период review:** ${safe(meta.review_period_start)} — ${safe(meta.review_period_end)}

## 2. Общий вывод

${safe(view.summary.overall_summary)}

## 3. Сильные стороны

${bulletList(view.strengths)}

## 4. Зоны роста

${bulletList(view.growthAreas)}

## 5. Сопоставление самооценки и evidence

**Совпадает с evidence:**
${bulletList(view.alignment.aligned)}

**Возможное завышение:**
${bulletList(view.alignment.overestimated)}

**Возможное занижение:**
${bulletList(view.alignment.underestimated)}

## 6. Jira summary

- **Доступность Jira-данных:** ${safe(view.jiraSummary.available)}
- **Уверенность:** ${safe(view.jiraSummary.confidence)}
- **Вывод:** ${safe(view.jiraSummary.summary)}

## 7. Детализация по компетенциям

${renderCompetencyTable(view.competencyRows)}

## 8. План развития на полугодие

${renderPlanQuarter(view.q1, 'Q1')}
${renderPlanQuarter(view.q2, 'Q2')}

## 9. Приоритеты на ближайшие 6 месяцев

${bulletList(view.topPriorities)}

## 10. Рекомендации руководителю

**Фокусы внимания:**
${bulletList(view.managerPlan.focus_areas)}

**Поддерживающие действия:**
${bulletList(view.managerPlan.support_actions)}

**Какие задачи и возможности давать:**
${bulletList(view.managerPlan.assignment_recommendations)}

**Риски:**
${bulletList(view.managerPlan.risks)}

**Контрольные точки:**
${bulletList(view.managerPlan.checkpoints)}

## 11. One-to-one: структура и вопросы

**Цель разговора:** ${safe(view.one2oneGuide.conversation_goal)}

${Array.isArray(view.one2oneGuide.sections) && view.one2oneGuide.sections.length
  ? view.one2oneGuide.sections.map(section => {
      return `### ${safe(section.title)}\n\n${bulletList(section.questions)}`;
    }).join('\n\n')
  : 'Нет данных по секциям разговора.'}

### Вопросы на завершение

${bulletList(view.one2oneGuide.closing_questions)}

### Что важно зафиксировать по итогам встречи

${bulletList(view.one2oneGuide.agreement_points)}

## 12. Ограничения и качество данных

${view.highSeverityIssues.length
  ? bulletList(view.highSeverityIssues.map(i => `[${i.severity}] ${i.issue_code}: ${i.message}`))
  : 'Существенных проблем качества данных не выявлено.'}
`;

return [{
  json: {
    ...$json,
    employee_report_markdown: md
  }
}];
```

---

# 4. `Code :: Render Compact Manager Summary`

Это короткая версия для быстрого чтения руководителем. Часто очень полезно иметь не только большой отчет, но и короткую выжимку.

### Код

```javascript
function bulletList(items) {
  if (!items || !items.length) return '- Нет данных';
  return items.map(x => `- ${x}`).join('\n');
}

const view = $json.report_view;

const compact = `# Краткая выжимка для руководителя

## Сотрудник
- ${view.employee.full_name}
- ${view.employee.position}
- ${view.employee.team}

## Общий вывод
${view.summary.overall_summary || '—'}

## Сильные стороны
${bulletList(view.strengths)}

## Главные зоны роста
${bulletList(view.growthAreas)}

## Приоритеты на 6 месяцев
${bulletList(view.topPriorities)}

## Что делать руководителю
${bulletList(view.managerPlan.support_actions)}

## Какие задачи стоит давать
${bulletList(view.managerPlan.assignment_recommendations)}

## На что смотреть на one-to-one
${bulletList((view.one2oneGuide.sections || []).flatMap(s => s.questions).slice(0, 8))}
`;

return [{
  json: {
    ...$json,
    manager_compact_markdown: compact
  }
}];
```

---

# 5. Сохранение результатов

На MVP достаточно одного из этих вариантов:

## Вариант A

Сохранять в БД:

* `employee_report_json`
* `employee_report_markdown`

## Вариант B

Сохранять как файлы:

* `${employee_id}_${assessment_date}.json`
* `${employee_id}_${assessment_date}.md`

## Вариант C

Отправлять в Confluence/Notion/Google Docs

Я бы на первом этапе сохранял и JSON, и markdown.

---

# 6. Финальный output `WF50`

Я бы возвращал так:

```json
{
  "employee_report_json": {...},
  "employee_report_markdown": "...",
  "manager_compact_markdown": "...",
  "report_meta": {
    "employee_id": "iivanov",
    "report_filename": "iivanov_2026-03-21.md",
    "json_filename": "iivanov_2026-03-21.json"
  }
}
```

---

---

# Часть 2. Готовые prompt-ы для всех LLM-этапов

Ниже даю финальные тексты. Их лучше хранить отдельно:

* либо в `Set` node,
* либо в environment/config,
* либо в отдельной таблице.

Так будет проще версионировать.

---

# Prompt 1. `LLM Jira Summarizer`

## System

```text
Ты анализируешь Jira-задачи инженера за заданный период.

Твоя задача:
- не оценивать человека в целом;
- не делать психологических выводов;
- не придумывать факты;
- извлечь только наблюдаемые рабочие сигналы и evidence, которые могут быть полезны для анализа компетенций.

Правила:
- опирайся только на переданные данные;
- если данных недостаточно, прямо укажи это;
- не путай отсутствие данных с отсутствием компетенции;
- evidence должно быть кратким, конкретным и опираться на содержимое задач;
- если задача не дает сигнала по компетенциям, не выдумывай сигнал.

Верни строго JSON без пояснений вокруг.
```

## User

```text
Верни JSON по схеме:

{
  "available": true,
  "summary": "string",
  "evidence_items": [
    {
      "task_key": "string",
      "competency_hint": "string",
      "evidence": "string"
    }
  ],
  "confidence": "low|medium|high",
  "data_coverage": "low|medium|high"
}

Данные:
{{PAYLOAD_JSON}}
```

---

# Prompt 2. `LLM Competency Analysis`

## System

```text
Ты анализируешь одну компетенцию IT-инженера.

Твоя задача:
- сопоставить самооценку сотрудника, описание уровней компетенции и рабочие evidence;
- оценить текущий уровень только на основе переданных данных;
- указать уверенность оценки;
- явно отметить, если evidence недостаточно.

Правила:
- не выдумывай evidence;
- не делай выводов, которых нет в данных;
- не путай "нет данных" и "низкий уровень";
- не переоценивай и не занижай уровень без оснований;
- assessment должен быть кратким, деловым и конкретным;
- development_focus должен быть полезен для построения плана развития.

Верни строго JSON без пояснений вокруг.
```

## User

```text
Верни JSON по схеме:

{
  "competency_id": "string",
  "self_level": 0,
  "estimated_level": 0,
  "confidence": "low|medium|high",
  "assessment": "string",
  "evidence_for": ["string"],
  "evidence_missing": ["string"],
  "risk_flags": ["string"],
  "priority": "low|medium|high",
  "development_focus": "string"
}

Дополнительные правила:
- если selected_level отсутствует, self_level верни как null;
- если данных явно мало, confidence должен быть low;
- priority определяй с учетом важности компетенции для роли и наблюдаемого gap;
- risk_flags используй только если реально есть риск: например, завышение самооценки, нехватка evidence, слабая подтверждаемость.

Данные:
{{PAYLOAD_JSON}}
```

---

# Prompt 3. `LLM Employee Summary`

## System

```text
Ты готовишь сводный вывод по инженерному профилю сотрудника на основе уже выполненного анализа компетенций.

Твоя задача:
- выделить сильные стороны;
- выделить зоны роста;
- сопоставить самооценку и evidence;
- определить приоритеты развития на ближайшие 6 месяцев.

Правила:
- опирайся только на переданные данные;
- не повторяй все компетенции подряд, выделяй главное;
- не путай отсутствие evidence и отсутствие компетенции;
- если много low-confidence сигналов, отрази это в выводе;
- top_priorities_next_6m должны быть списком competency_id или кратких названий фокусов, пригодных для дальнейшего планирования.

Верни строго JSON без пояснений вокруг.
```

## User

```text
Верни JSON по схеме:

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

Требования:
- strengths и growth_areas должны быть короткими, конкретными и без воды;
- overall_summary должен быть в 3-6 предложениях;
- не включай больше 6 приоритетов в top_priorities_next_6m.

Данные:
{{PAYLOAD_JSON}}
```

---

# Prompt 4. `LLM Development Plan`

## System

```text
Ты формируешь реалистичный полугодовой план развития IT-инженера.

Твоя задача:
- выбрать наиболее важные и реалистичные фокусы развития;
- разложить их по двум кварталам;
- для каждой компетенции предложить конкретные действия;
- опираться только на предоставленные learning assets и факты анализа.

Правила:
- не придумывай новые курсы, программы, книги и материалы, которых нет во входных данных;
- если материалов мало, делай акцент на практику, mentoring, shadowing, design review, code review, knowledge sharing, ownership-задачи;
- не включай больше допустимого числа компетенций на квартал;
- план должен быть реалистичным для работающего инженера;
- в каждом квартале должны быть не только обучающие активности, но и практические;
- success_criteria должны быть наблюдаемыми;
- manager_support должен быть конкретным и применимым.

Верни строго JSON без пояснений вокруг.
```

## User

```text
Верни JSON по схеме:

{
  "development_plan": {
    "quarter_1": [
      {
        "competency_id": "string",
        "competency_name": "string",
        "reason": "string",
        "target_from": 0,
        "target_to": 0,
        "actions": [
          {
            "type": "course|program|practice|mentoring|reading|shadowing|project",
            "title": "string",
            "description": "string"
          }
        ],
        "success_criteria": ["string"],
        "manager_support": ["string"]
      }
    ],
    "quarter_2": [
      {
        "competency_id": "string",
        "competency_name": "string",
        "reason": "string",
        "target_from": 0,
        "target_to": 0,
        "actions": [
          {
            "type": "course|program|practice|mentoring|reading|shadowing|project",
            "title": "string",
            "description": "string"
          }
        ],
        "success_criteria": ["string"],
        "manager_support": ["string"]
      }
    ],
    "plan_summary": "string"
  }
}

Требования:
- не больше {{MAX_COMPETENCIES_PER_QUARTER}} компетенций на квартал;
- суммарно желательно не больше 6-8 компетенций на полугодие;
- используй прежде всего planning_candidates;
- не создавай активности без явной логики;
- если confidence по компетенции низкая, допускается формулировать цель как проверку и калибровку через практику;
- quarter_1 должен чаще содержать foundation и калибровку;
- quarter_2 — закрепление, применение, ownership.

Данные:
{{PAYLOAD_JSON}}
```

---

# Prompt 5. `LLM Manager Plan`

## System

```text
Ты готовишь рекомендации руководителю по развитию инженера на полугодие.

Твоя задача:
- не пересказывать план сотрудника;
- дать управленческие рекомендации;
- указать, какие условия создать, какие задачи давать, какие риски учитывать и как отслеживать прогресс.

Правила:
- опирайся только на предоставленные данные;
- рекомендации должны быть конкретными;
- избегай общих фраз вроде "поддерживать развитие" без конкретизации;
- assignment_recommendations должны описывать типы задач или зон ответственности;
- checkpoints должны быть наблюдаемыми и пригодными для one-to-one.

Верни строго JSON без пояснений вокруг.
```

## User

```text
Верни JSON по схеме:

{
  "manager_plan": {
    "focus_areas": ["string"],
    "support_actions": ["string"],
    "assignment_recommendations": ["string"],
    "risks": ["string"],
    "checkpoints": ["string"]
  }
}

Требования:
- в каждом массиве желательно 3-6 пунктов;
- focus_areas — на чем руководителю держать внимание;
- support_actions — что конкретно сделать;
- assignment_recommendations — какие типы задач/инициатив давать;
- risks — где развитие может застопориться;
- checkpoints — как понять, что есть прогресс.

Данные:
{{PAYLOAD_JSON}}
```

---

# Prompt 6. `LLM One-to-One Guide`

## System

```text
Ты готовишь структуру one-to-one руководителя с инженером по итогам оценки компетенций и плана развития.

Твоя задача:
- помочь провести разговор уважительно, конкретно и развивающе;
- сверить самооценку с рабочими примерами;
- обсудить мотивацию, барьеры и фокусы развития;
- помочь завершить разговор понятными договоренностями.

Правила:
- вопросы должны быть открытыми и полезными;
- не делать разговор оценочным или обвиняющим;
- не повторять один и тот же вопрос разными словами;
- sections должны логично идти от обсуждения текущего состояния к договоренностям;
- agreement_points должны быть пригодны для фиксации по итогам встречи.

Верни строго JSON без пояснений вокруг.
```

## User

```text
Верни JSON по схеме:

{
  "one2one_guide": {
    "conversation_goal": "string",
    "sections": [
      {
        "title": "string",
        "questions": ["string"]
      }
    ],
    "closing_questions": ["string"],
    "agreement_points": ["string"]
  }
}

Требования:
- sections должно быть 4-6;
- в каждой секции желательно 2-5 вопросов;
- conversation_goal — 1-2 предложения;
- closing_questions — вопросы, которые помогают закрепить фокус и договоренности;
- agreement_points — что стоит явно зафиксировать после встречи.

Данные:
{{PAYLOAD_JSON}}
```

---

# Prompt 7. `LLM Learning Asset Enrichment` — очень рекомендую на будущее

Это не обязательно для MVP, но очень полезно один раз прогнать каталог материалов.

## System

```text
Ты классифицируешь обучающий материал для каталога развития IT-инженеров.

Твоя задача:
- определить, какие компетенции покрывает материал;
- для каких ролей он подходит;
- на какие уровни он ориентирован;
- какой это тип развития: theory, practice, mentoring, reading, project, workshop и т.д.

Правила:
- опирайся только на переданное описание материала;
- не выдумывай узкоспециальные компетенции без оснований;
- выбирай только релевантные роли и компетенции;
- если данных мало, укажи это в confidence.

Верни строго JSON без пояснений вокруг.
```

## User

```text
Верни JSON по схеме:

{
  "asset_id": "string",
  "competencies": ["string"],
  "recommended_for_roles": ["string"],
  "target_levels": [1,2,3],
  "development_modes": ["theory|practice|mentoring|reading|project|workshop"],
  "difficulty": "beginner|intermediate|advanced",
  "confidence": "low|medium|high"
}

Данные:
{{PAYLOAD_JSON}}
```

---

# Как лучше вставлять prompt-ы в `n8n`

Я бы делал так:

## Вариант 1

В `Set` node хранить:

* `system_prompt`
* `user_prompt_template`

Потом в `HTTP Request` подставлять значения.

## Вариант 2

Хранить prompt-ы в отдельной таблице/JSON-конфиге, чтобы версионировать.

Например:

```json
{
  "prompts": {
    "competency_analysis_v1": {
      "system": "...",
      "user": "..."
    }
  }
}
```

Это сильно упростит поддержку.

---

# Какой payload placeholder использовать

Во всех prompt-ах, где я написал `{{PAYLOAD_JSON}}`, в `n8n` лучше подставлять:

```javascript
={{JSON.stringify($json.payload)}}
```

или конкретное поле:

```javascript
={{JSON.stringify($json.development_plan_payload)}}
```

---

# Практический совет по response parsing

У тебя почти везде один и тот же паттерн:

* `HTTP Request`
* `Code :: Parse JSON`
* `IF :: valid?`
* fallback или retry

Я бы даже сделал маленький reusable sub-workflow:
`WF99_Parse_Validate_LLM_JSON`

Чтобы не копировать одинаковый код 6 раз.

---

# Что логичнее делать дальше

Следующий полезный шаг — собрать это уже в “боевой” skeleton главного workflow:

* `WF00_Orchestrator`
* какие именно `Execute Workflow` ноды,
* какие поля передавать между workflow,
* в каком порядке мерджить данные,
* где делать retries/fallbacks,
* где хранить артефакты в БД.

И это уже будет практически полная blueprint-схема всей системы.







\\\\\\\\\\\







Давай соберем это в полный `WF00_Orchestrator` — как каркас всей системы, чтобы у тебя сложилась целостная схема production-пайплайна в `n8n`.

Я опишу:

* главный orchestration workflow;
* какие поля передавать между дочерними workflow;
* где делать retries;
* где делать fallbacks;
* где хранить результаты;
* как запускать по одному сотруднику и по пачке;
* как потом расширить Jira и approval.

---

# 1. Главная идея orchestration

У тебя уже логически есть такие блоки:

* `WF10_Ingestion_Normalization`
* `WF11_Prepare_Employee_Context`
* `WF20_Jira_Enrichment`
* `WF30_Competency_Analysis`
* `WF40_Development_Plan`
* `WF50_Report_Generation`

Главный workflow должен:

1. загрузить и нормализовать входные данные;
2. выбрать сотрудников для обработки;
3. по каждому сотруднику пройти pipeline;
4. сохранить результат;
5. собрать run-summary.

---

# 2. Целевая схема `WF00_Orchestrator`

Я бы сделал такие узлы:

1. `Manual Trigger` / `Webhook` / `Cron`
2. `Set :: Run Config`
3. `Execute Workflow :: WF10_Ingestion_Normalization`
4. `Code :: Build Employee Run List`
5. `Split In Batches :: Employee Loop`
6. `Execute Workflow :: WF11_Prepare_Employee_Context`
7. `IF :: Employee Context Valid?`
8. `IF :: Use Jira?`
9. `Execute Workflow :: WF20_Jira_Enrichment`
10. `Set :: Empty Jira Summary Fallback`
11. `Merge :: Context + Jira`
12. `Execute Workflow :: WF30_Competency_Analysis`
13. `IF :: Competency Analysis Valid?`
14. `Execute Workflow :: WF40_Development_Plan`
15. `IF :: Development Plan Valid?`
16. `Execute Workflow :: WF50_Report_Generation`
17. `Code / DB :: Save Employee Result`
18. `Code :: Build Employee Run Result`
19. `Merge/Aggregate :: Collect Run Results`
20. `Code :: Build Final Run Summary`
21. `Optional :: Save Run Summary`

---

# 3. `Set :: Run Config`

Это главный конфиг запуска. Советую делать его максимально явным.

## Пример полей

```json
{
  "run_id": "={{$now}}",
  "assessment_date": "={{$now.format('yyyy-MM-dd')}}",
  "review_period_months": 6,
  "review_period_start": "",
  "review_period_end": "",
  "target_employee_ids": [],
  "exclude_employee_ids": [],
  "target_roles": [],
  "use_jira": true,
  "generate_reports": true,
  "store_json_report": true,
  "store_markdown_report": true,
  "max_competencies_for_llm": 12,
  "max_competencies_per_quarter": 4,
  "max_assets_per_competency": 5,
  "llm_retry_count": 1,
  "stop_on_employee_error": false
}
```

---

# 4. Как считать `review_period_start` и `review_period_end`

Лучше сразу в отдельном `Code` node после `Run Config`.

## `Code :: Resolve Dates`

```javascript
const now = new Date();
const reviewMonths = Number($json.review_period_months || 6);

const reviewEnd = $json.review_period_end
  ? new Date($json.review_period_end)
  : now;

const reviewStart = $json.review_period_start
  ? new Date($json.review_period_start)
  : new Date(new Date(reviewEnd).setMonth(reviewEnd.getMonth() - reviewMonths));

function toDateOnly(d) {
  return new Date(d).toISOString().slice(0, 10);
}

return [{
  json: {
    ...$json,
    review_period_start: toDateOnly(reviewStart),
    review_period_end: toDateOnly(reviewEnd)
  }
}];
```

---

# 5. `Execute Workflow :: WF10_Ingestion_Normalization`

На вход туда передаешь:

* пути к файлам или binary source;
* config с дефолтами.

## Пример payload

```json
{
  "files": {
    "employees_path": "/data/employees.xlsx",
    "matrices_path": "/data/matrices.xlsx",
    "learning_path": "/data/learning_assets.xlsx",
    "self_assessments_path": "/data/self_assessments.xlsx"
  },
  "config": {
    "default_competency_priority_weight": 0.5,
    "default_assessment_date": "={{$json.assessment_date}}"
  }
}
```

## Что вернется

Нормализованный dataset:

```json
{
  "employees": [...],
  "matrices": [...],
  "learning_assets": [...],
  "self_assessments": [...],
  "data_quality_issues": [...],
  "stats": {...}
}
```

---

# 6. `Code :: Build Employee Run List`

Это очень важный шаг. Он определяет, кого реально считать в этом запуске.

## Логика

* берем всех `employees` из normalized data;
* если `target_employee_ids` не пустой — фильтруем только их;
* если `exclude_employee_ids` не пустой — исключаем их;
* если `target_roles` не пустой — фильтруем по ролям;
* желательно не обрабатывать сотрудников без матрицы, но можно оставлять с ошибкой.

## Код

```javascript
const normalized = $json;
const employees = normalized.employees || [];

const targetEmployeeIds = $json.target_employee_ids || [];
const excludeEmployeeIds = $json.exclude_employee_ids || [];
const targetRoles = $json.target_roles || [];

let runEmployees = [...employees];

if (Array.isArray(targetEmployeeIds) && targetEmployeeIds.length) {
  runEmployees = runEmployees.filter(e => targetEmployeeIds.includes(e.employee_id));
}

if (Array.isArray(excludeEmployeeIds) && excludeEmployeeIds.length) {
  runEmployees = runEmployees.filter(e => !excludeEmployeeIds.includes(e.employee_id));
}

if (Array.isArray(targetRoles) && targetRoles.length) {
  runEmployees = runEmployees.filter(e => targetRoles.includes(e.role));
}

return runEmployees.map(employee => ({
  json: {
    run_id: $json.run_id,
    assessment_date: $json.assessment_date,
    review_period_start: $json.review_period_start,
    review_period_end: $json.review_period_end,
    use_jira: $json.use_jira,
    generate_reports: $json.generate_reports,
    store_json_report: $json.store_json_report,
    store_markdown_report: $json.store_markdown_report,
    max_competencies_for_llm: $json.max_competencies_for_llm,
    max_competencies_per_quarter: $json.max_competencies_per_quarter,
    max_assets_per_competency: $json.max_assets_per_competency,
    llm_retry_count: $json.llm_retry_count,
    stop_on_employee_error: $json.stop_on_employee_error,
    employee_id: employee.employee_id,
    normalized_data: {
      employees: normalized.employees || [],
      matrices: normalized.matrices || [],
      learning_assets: normalized.learning_assets || [],
      self_assessments: normalized.self_assessments || [],
      data_quality_issues: normalized.data_quality_issues || []
    }
  }
}));
```

---

# 7. `Split In Batches :: Employee Loop`

Для начала:

* `batch size = 1`

Так проще:

* дебажить,
* логировать,
* ретраить,
* не смешивать данные сотрудников.

---

# 8. `Execute Workflow :: WF11_Prepare_Employee_Context`

## Вход

```json
{
  "normalized_data": "...",
  "employee_id": "iivanov",
  "config": {
    "learning_assets_limit_per_competency": 5
  }
}
```

## Выход

```json
{
  "employee": {...},
  "self_assessment": {...},
  "role_matrix": {...},
  "learning_assets_pool": [...],
  "employee_data_quality_issues": [...]
}
```

---

# 9. `IF :: Employee Context Valid?`

Если:

* нет `employee`
* нет `role_matrix`

то лучше не тащить дальше весь pipeline.

## Что делать в error-ветке

Сформировать минимальный employee result:

```json
{
  "employee_id": "iivanov",
  "status": "failed",
  "stage": "prepare_context",
  "errors": [
    "employee_not_found",
    "missing_role_matrix"
  ]
}
```

Если `stop_on_employee_error = true`, можно валить run.
Для production я бы держал `false`.

---

# 10. `IF :: Use Jira?`

Если `use_jira = true` — идем в `WF20_Jira_Enrichment`.

Иначе сразу готовим fallback.

---

# 11. `Execute Workflow :: WF20_Jira_Enrichment`

## Вход

```json
{
  "employee": {...},
  "config": {
    "review_period_start": "2025-09-21",
    "review_period_end": "2026-03-21"
  }
}
```

## Выход

```json
{
  "jira_summary": {
    "available": true,
    "summary": "...",
    "evidence_items": [...],
    "confidence": "medium",
    "data_coverage": "medium"
  },
  "jira_tasks_normalized": [...]
}
```

---

# 12. `Set :: Empty Jira Summary Fallback`

Если Jira отключена или недоступна, возвращай единый контракт.

## Пример

```json
{
  "jira_summary": {
    "available": false,
    "summary": "Jira enrichment отключен или недоступен для этого запуска.",
    "evidence_items": [],
    "confidence": "low",
    "data_coverage": "low"
  },
  "jira_tasks_normalized": []
}
```

Это важно, чтобы downstream workflow не делали `if (jira exists)` на каждом шаге.

---

# 13. `Merge :: Context + Jira`

После этого у тебя должен получиться единый employee payload:

```json
{
  "employee": {...},
  "self_assessment": {...},
  "role_matrix": {...},
  "learning_assets_pool": [...],
  "employee_data_quality_issues": [...],
  "jira_summary": {...},
  "run_id": "...",
  "assessment_date": "...",
  "review_period_start": "...",
  "review_period_end": "...",
  "max_competencies_for_llm": 12,
  "max_competencies_per_quarter": 4,
  "max_assets_per_competency": 5
}
```

---

# 14. `Execute Workflow :: WF30_Competency_Analysis`

## Вход

```json
{
  "employee": {...},
  "self_assessment": {...},
  "role_matrix": {...},
  "learning_assets_pool": [...},
  "jira_summary": {...},
  "employee_data_quality_issues": [...],
  "config": {
    "max_competencies_for_llm": 12,
    "expected_target_level_by_grade": {
      "junior": 2,
      "middle": 3,
      "senior": 4,
      "lead": 4
    }
  }
}
```

## Выход

```json
{
  "competency_analysis": {
    "competency_results": [...],
    "employee_summary": {...},
    "top_priority_competencies": [...],
    "analysis_quality": "medium",
    "flags": []
  }
}
```

---

# 15. `IF :: Competency Analysis Valid?`

Проверка простая:

* есть `competency_analysis`
* есть `competency_results`
* есть `employee_summary`

Если workflow вернул пусто или мусор:

* формируешь fallback с пометкой `analysis_failed`.

## Fallback idea

```json
{
  "competency_analysis": {
    "competency_results": [],
    "employee_summary": {
      "overall_summary": "Анализ компетенций не был корректно построен, требуется ручная проверка.",
      "strengths": [],
      "growth_areas": [],
      "alignment": {
        "overestimated": [],
        "underestimated": [],
        "aligned": []
      },
      "top_priorities_next_6m": [],
      "confidence": "low"
    },
    "top_priority_competencies": [],
    "analysis_quality": "low",
    "flags": ["analysis_failed"]
  }
}
```

---

# 16. `Execute Workflow :: WF40_Development_Plan`

## Вход

```json
{
  "employee": {...},
  "role_matrix": {...},
  "learning_assets_pool": [...],
  "jira_summary": {...},
  "competency_analysis": {...},
  "config": {
    "plan_duration_months": 6,
    "quarters": 2,
    "max_competencies_per_quarter": 4,
    "max_assets_per_competency": 5
  }
}
```

## Выход

```json
{
  "development_plan": {...},
  "manager_plan": {...},
  "one2one_guide": {...}
}
```

---

# 17. `IF :: Development Plan Valid?`

Проверяешь:

* есть `development_plan`
* есть хотя бы `quarter_1` или `quarter_2`
* есть `manager_plan`
* есть `one2one_guide`

Если что-то невалидно — можно:

* либо fallback;
* либо сохранить отчет с частичной готовностью.

Я бы шел во второй вариант.

## Partial fallback

Если сломался только `one2one_guide`, не надо заново пересчитывать весь план.

---

# 18. `Execute Workflow :: WF50_Report_Generation`

Это уже финальная упаковка.

## Вход

```json
{
  "employee": {...},
  "self_assessment": {...},
  "role_matrix": {...},
  "jira_summary": {...},
  "competency_analysis": {...},
  "development_plan": {...},
  "manager_plan": {...},
  "one2one_guide": {...},
  "employee_data_quality_issues": [...],
  "config": {
    "run_id": "...",
    "assessment_date": "...",
    "review_period_start": "...",
    "review_period_end": "..."
  }
}
```

## Выход

```json
{
  "employee_report_json": {...},
  "employee_report_markdown": "...",
  "manager_compact_markdown": "...",
  "report_meta": {...}
}
```

---

# 19. `Code / DB :: Save Employee Result`

Я бы советовал сохранять результаты по сотруднику сразу после генерации отчета, а не ждать окончания всего run.

Так безопаснее:

* если run упал на 47-м сотруднике, первые 46 уже сохранены.

## Что сохранять минимум

* `run_id`
* `employee_id`
* `status`
* `employee_report_json`
* `employee_report_markdown`
* `manager_compact_markdown`
* `analysis_quality`
* `flags`
* timestamp

---

# 20. Рекомендуемая схема хранения

Если Postgres, сделал бы таблицы:

## `assessment_runs`

Один запуск пайплайна.

Поля:

* `run_id`
* `started_at`
* `finished_at`
* `status`
* `config_json`
* `employees_total`
* `employees_succeeded`
* `employees_failed`

## `employee_assessment_results`

Один сотрудник в одном run.

Поля:

* `run_id`
* `employee_id`
* `employee_name`
* `role`
* `team`
* `status`
* `analysis_quality`
* `flags_json`
* `report_json`
* `report_markdown`
* `manager_summary_markdown`
* `created_at`

## `employee_run_errors`

Ошибки по этапам.

Поля:

* `run_id`
* `employee_id`
* `stage`
* `error_code`
* `error_message`
* `payload_snapshot_optional`

---

# 21. `Code :: Build Employee Run Result`

После сохранения полезно вернуть компактный technical result.

## Пример

```javascript
const employee = $json.employee || {};
const reportMeta = $json.report_meta || {};
const analysis = $json.competency_analysis || {};

return [{
  json: {
    run_id: $json.config?.run_id || '',
    employee_id: employee.employee_id || '',
    employee_name: employee.full_name || '',
    role: employee.role || '',
    status: 'success',
    analysis_quality: analysis.analysis_quality || 'unknown',
    flags: analysis.flags || [],
    report_filename: reportMeta.report_filename || '',
    generated_at: new Date().toISOString()
  }
}];
```

Если был fail — аналогичный result со `status: failed`.

---

# 22. `Merge/Aggregate :: Collect Run Results`

В конце собираешь все results сотрудников.

Нужен итоговый массив:

```json
{
  "employee_results": [
    {
      "employee_id": "iivanov",
      "status": "success"
    },
    {
      "employee_id": "ppetrov",
      "status": "failed"
    }
  ]
}
```

---

# 23. `Code :: Build Final Run Summary`

Это финальный отчет по запуску.

## Код

```javascript
const results = items.map(i => i.json);

const total = results.length;
const succeeded = results.filter(r => r.status === 'success').length;
const failed = results.filter(r => r.status === 'failed').length;

return [{
  json: {
    run_summary: {
      run_id: results[0]?.run_id || '',
      total_employees: total,
      succeeded,
      failed,
      success_rate: total ? Number((succeeded / total).toFixed(4)) : 0,
      employees_failed: results
        .filter(r => r.status === 'failed')
        .map(r => ({
          employee_id: r.employee_id,
          employee_name: r.employee_name,
          role: r.role
        })),
      generated_at: new Date().toISOString()
    },
    employee_results: results
  }
}];
```

---

# 24. Где ставить retries

Это очень важно. Я бы ставил retries не везде, а только там, где это реально помогает.

## Retry нужен:

### LLM-вызовы

* 1 retry обычно достаточно
* если невалидный JSON или timeout

### Jira API

* 1–2 retries
* особенно на сетевые ошибки / 429 / 5xx

## Retry не нужен:

### Data normalization

Если Excel кривой, retry не поможет.

### Validation steps

Там deterministic logic.

---

# 25. Где ставить fallbacks

## Обязательно fallback:

### Jira enrichment

Если Jira упала — идем дальше без нее.

### Competency analysis parse

Если модель вернула мусор — делаем fallback result.

### Development plan missing sections

Если one2one не собрался — можно fallback-структуру.

---

# 26. Рекомендуемые fallback-объекты

## One2One fallback

```json
{
  "one2one_guide": {
    "conversation_goal": "Сверить текущее состояние, обсудить зоны роста и согласовать ближайшие шаги развития.",
    "sections": [
      {
        "title": "Рефлексия сотрудника",
        "questions": [
          "Как ты сам оцениваешь последние месяцы с точки зрения роста?",
          "Какие задачи ты считаешь самыми показательными для своего текущего уровня?"
        ]
      },
      {
        "title": "Зоны развития",
        "questions": [
          "Где ты чувствуешь ограничения в текущих задачах?",
          "Какие компетенции тебе самому хотелось бы усилить в ближайшие полгода?"
        ]
      },
      {
        "title": "Поддержка и барьеры",
        "questions": [
          "Что может помочь тебе развиваться быстрее?",
          "Какие барьеры могут помешать выполнить план?"
        ]
      }
    ],
    "closing_questions": [
      "Какие 2-3 фокуса мы берем в работу в первую очередь?",
      "Как поймем через квартал, что есть прогресс?"
    ],
    "agreement_points": [
      "Согласованные фокусы развития",
      "Поддержка со стороны руководителя",
      "Контрольные точки на квартал"
    ]
  }
}
```

---

# 27. Как передавать config между workflow

Очень советую в каждый дочерний workflow передавать только нужный кусок config, а не весь огромный объект.

## Плохо

Передавать все подряд и потом разбираться внутри.

## Хорошо

В каждый workflow явный input contract.

Например:

### Для `WF30`

```json
{
  "employee": {...},
  "self_assessment": {...},
  "role_matrix": {...},
  "jira_summary": {...},
  "config": {
    "max_competencies_for_llm": 12,
    "expected_target_level_by_grade": {...}
  }
}
```

### Для `WF40`

```json
{
  "employee": {...},
  "competency_analysis": {...},
  "learning_assets_pool": [...],
  "config": {
    "plan_duration_months": 6,
    "quarters": 2,
    "max_competencies_per_quarter": 4
  }
}
```

Это сильно облегчает поддержку.

---

# 28. Как бы я организовал naming workflow и версионирование

Советую сразу с версиями:

* `WF00_Orchestrator_v1`
* `WF10_Ingestion_Normalization_v1`
* `WF11_Prepare_Employee_Context_v1`
* `WF20_Jira_Enrichment_v1`
* `WF30_Competency_Analysis_v1`
* `WF40_Development_Plan_v1`
* `WF50_Report_Generation_v1`

Потом, когда начнешь улучшать prompts и rules, можно спокойно делать `v2` без боли.

---

# 29. Как запускать по одному сотруднику и массово

Сразу сделай поддержку обоих режимов.

## Режим 1 — One employee debug

Указываешь:

```json
{
  "target_employee_ids": ["iivanov"]
}
```

И гоняешь pipeline только на нем.

## Режим 2 — Batch

Пустой список — считаешь всех.

## Режим 3 — Role-limited batch

```json
{
  "target_roles": ["backend_engineer"]
}
```

Очень полезно для rollout по ролям.

---

# 30. Как я бы вводил human-in-the-loop

Это не обязательно для MVP, но очень рекомендую дальше.

После `WF40` и до `WF50` можно добавить approval step:

* руководитель/HR проверяет draft plan;
* при необходимости редактирует;
* потом только финальная генерация отчета.

То есть иметь два режима:

* `draft`
* `approved`

---

# 31. Как бы я расширял систему после MVP

После того как основной pipeline заработает, я бы добавлял в таком порядке:

## 1. Улучшение каталога learning assets

Через отдельный enrichment pipeline.

## 2. Jira-participation signals

Не только assignee, но и reviewer/commenter/worklog.

## 3. История оценки

Сравнение с прошлым полугодием.

## 4. Manager override layer

Например:

* форс-приоритет компетенции
* исключить компетенцию из плана
* добавить бизнес-фокус

## 5. Calibration mode

Сравнение нескольких сотрудников одной роли.

---

# 32. Минимальный production-ready набор защит

Вот что я бы считал минимумом:

* явные input/output contracts;
* валидация LLM-output;
* fallback на критичных местах;
* сохранение результата по сотруднику сразу;
* run summary;
* logging по этапам;
* batch size = 1;
* retries только на LLM/Jira;
* не падать всем run из-за одного сотрудника.

---

# 33. Что у тебя теперь уже есть как blueprint

По сути, после нашей переписки у тебя уже должна складываться такая карта:

## Data layer

* `WF10`
* `WF11`

## Enrichment layer

* `WF20`

## Analysis layer

* `WF30`

## Planning layer

* `WF40`

## Reporting layer

* `WF50`

## Orchestration layer

* `WF00`

Это уже полноценная архитектура.

---

# 34. Что я бы советовал сделать прямо следующим шагом

Теперь самый практичный следующий шаг — перейти от архитектуры к сборке первого рабочего среза.

Я бы предложил такой порядок сборки руками в `n8n`:

1. собрать `WF10` и проверить на реальных Excel;
2. собрать `WF11`;
3. собрать `WF30` без Jira;
4. собрать `WF40`;
5. собрать `WF50`;
6. только потом `WF00`;
7. потом добавить `WF20 Jira`.

Так ты очень быстро получишь живой MVP, а не утонешь в интеграциях.

Следующим сообщением я могу дать тебе прям чеклист сборки MVP на 2–3 дня: в каком порядке создавать workflow, какие тестовые кейсы прогонять, и какие артефакты считать “готовностью этапа”.









\\\\\\\\\\\\\\







Давай. Ниже — практический чеклист сборки MVP на 2–3 дня, без лишней теории. Цель: быстро получить рабочий end-to-end pipeline без Jira, а потом аккуратно добавить Jira как enrichment.

---

# План сборки MVP

## День 1

Собрать:

* `WF10_Ingestion_Normalization`
* `WF11_Prepare_Employee_Context`

## День 2

Собрать:

* `WF30_Competency_Analysis`
* `WF40_Development_Plan`

## День 3

Собрать:

* `WF50_Report_Generation`
* `WF00_Orchestrator`
* smoke test всего пайплайна
* потом начать `WF20_Jira_Enrichment`

---

# День 1. Данные и нормализация

## Шаг 1. Подготовить тестовый набор файлов

Сделай маленький, но реалистичный dataset:

### `employees.xlsx`

5–10 сотрудников:

* 2 backend
* 1 frontend
* 1 qa
* 1 devops

Обязательно:

* один сотрудник без login
* один с нестандартным названием роли
* один с пустой командой

### `matrices.xlsx`

Минимум 2 роли:

* backend_engineer
* frontend_engineer

По 6–10 компетенций на роль:

* hard
* technology
* soft

### `learning_assets.xlsx`

20–30 материалов:

* курсы
* программы
* практические задания

Важно:

* у части материалов должен быть хороший mapping на competencies
* у части — пустой, чтобы проверить warning

### `self_assessments.xlsx`

Для 3–5 сотрудников.
Каждая строка = одна компетенция.

Обязательно:

* у одной записи пустой comment
* у одной competency имя слегка отличается от матрицы
* у одного сотрудника нет self-assessment вообще

---

## Шаг 2. Собрать `WF10_Ingestion_Normalization`

Готовность этапа:

* workflow запускается;
* возвращает 4 нормализованных массива;
* собирает `data_quality_issues`;
* не падает на грязных строках.

### Что проверить руками

После запуска открой output и проверь:

#### employees

* есть `employee_id`
* роли нормализованы
* grade определился ожидаемо

#### matrices

* компетенции сгруппированы по роли
* уровни лежат как массив `levels`
* `competency_id` нормальные

#### learning_assets

* есть `asset_id`
* `competencies` — массив
* `recommended_for_roles` — массив

#### self_assessments

* сгруппированы по `employee_id`
* `items` — массив
* `selected_level` — число

#### data_quality_issues

* есть warnings/errors на тестовых кривых кейсах

---

## Шаг 3. Критерии готовности `WF10`

Считай этап готовым, если выполняется все ниже:

1. На хорошем наборе файлов workflow проходит без errors.
2. На грязном наборе workflow не падает, а пишет issues.
3. Для каждого сотрудника из employees можно найти:

   * `employee_id`
   * `role`
4. Для каждой роли из сотрудников находится матрица или создается error.
5. Нормализованные данные выглядят стабильно от запуска к запуску.

---

## Шаг 4. Собрать `WF11_Prepare_Employee_Context`

Подавай:

* output `WF10`
* один `employee_id`

На выходе должен быть:

```json
{
  "employee": {...},
  "self_assessment": {...},
  "role_matrix": {...},
  "learning_assets_pool": [...],
  "employee_data_quality_issues": [...]
}
```

### Что проверить

Для 3 разных сотрудников:

* с полной самооценкой
* без самооценки
* с нестандартной ролью

Workflow должен:

* корректно найти сотрудника;
* корректно найти матрицу;
* корректно отфильтровать learning assets по роли;
* не падать, если self-assessment нет.

---

## Готовность дня 1

У тебя должны быть 2 рабочих workflow:

* `WF10`
* `WF11`

И тестовый dataset, на котором они стабильно работают.

---

# День 2. Анализ и план

## Шаг 5. Собрать `WF30_Competency_Analysis` без Jira

На вход временно подавай пустой `jira_summary`:

```json
{
  "available": false,
  "summary": "Jira enrichment отключен на этапе MVP",
  "evidence_items": [],
  "confidence": "low",
  "data_coverage": "low"
}
```

Это нормально. Самое главное сейчас — научиться:

* анализировать self-assessment + matrix;
* получать structured JSON;
* валидировать output;
* строить employee summary.

---

## Шаг 6. Сначала прогоняй `WF30` только на одном сотруднике

Не надо сразу batch.

### Тест-кейсы

#### Кейс A

Нормальный backend сотрудник с comments по большинству компетенций.

#### Кейс B

Сотрудник почти без comments.

#### Кейс C

Сотрудник с самооценкой, где есть 1–2 несовпадающих competency.

---

## Что смотреть в результате `WF30`

### По каждой компетенции

Проверь:

* есть `competency_id`
* есть `estimated_level`
* `confidence` выглядит разумно
* `assessment` не слишком общий
* `priority` не у всех одинаковый
* `development_focus` осмысленный

### По employee summary

Проверь:

* `overall_summary` не повторяет весь input
* `strengths` и `growth_areas` не из 20 пунктов
* `top_priorities_next_6m` не длиннее 5–6
* `confidence` падает, если данных мало

---

## Шаг 7. Собрать `WF40_Development_Plan`

Пока без Jira это уже работает.

### На вход

* `employee`
* `role_matrix`
* `learning_assets_pool`
* `competency_analysis`

### Проверки результата

#### `development_plan`

* в квартале не больше 4 компетенций;
* есть `actions`;
* есть `success_criteria`;
* есть `manager_support`;
* не только курсы, есть практика.

#### `manager_plan`

* рекомендации не абстрактные;
* есть идеи, какие задачи давать;
* есть checkpoints.

#### `one2one_guide`

* 4–6 секций;
* вопросы не повторяются;
* есть closing questions;
* есть agreement points.

---

## Шаг 8. Критерии готовности дня 2

Считай день успешным, если:

1. `WF30` стабильно отдает валидный JSON по 3 тестовым сотрудникам.
2. `WF40` генерирует реалистичный план хотя бы для 2 сотрудников.
3. План не состоит только из курсов.
4. План соблюдает ограничение 3–4 компетенции на квартал.
5. Руководительские рекомендации и one-to-one выглядят пригодными к использованию.

---

# День 3. Отчет и orchestration

## Шаг 9. Собрать `WF50_Report_Generation`

Сначала на одном employee payload.

### Что проверить

Markdown должен содержать:

* профиль сотрудника;
* общий вывод;
* сильные стороны;
* зоны роста;
* competency table;
* план Q1/Q2;
* manager recommendations;
* one-to-one questions;
* data quality issues.

### Важно

Проверь читабельность markdown:

* нет огромных JSON-вставок;
* таблица по компетенциям не ломается;
* пустые секции отображаются аккуратно.

---

## Шаг 10. Собрать минимальный `WF00_Orchestrator`

Сначала без Jira.

Поток:

1. `WF10`
2. построить employee run list
3. loop по сотрудникам
4. `WF11`
5. `WF30`
6. `WF40`
7. `WF50`
8. сохранить результат

---

## Шаг 11. Сначала запускай `WF00` только на 1 сотруднике

Не сразу на всех.

### Smoke test

Убедись, что:

* данные проходят от `WF10` до `WF50`;
* в каждом шаге input/output контракты совпадают;
* ничего не теряется при merge;
* `employee_id` на всех этапах один и тот же.

---

## Шаг 12. Потом запускай `WF00` на 3–5 сотрудниках

Только после одиночного теста.

### Проверки batch run

* один плохой сотрудник не валит весь run;
* хорошие сотрудники доходят до конца;
* итоговый run summary корректный;
* результаты по сотрудникам сохраняются независимо.

---

# Что считать “MVP готов”

MVP можно считать готовым, если есть:

## Функционально

* загрузка и нормализация Excel;
* анализ сотрудника по матрице и self-assessment;
* полугодовой план развития;
* manager plan;
* one-to-one guide;
* markdown/json отчет;
* batch processing по нескольким сотрудникам.

## По качеству

* пайплайн не падает на умеренно грязных данных;
* LLM-output валидируется;
* есть fallback хотя бы на ключевых местах;
* один плохой employee не ломает run.

## По продуктовой ценности

* результат можно реально показать руководителю;
* рекомендации выглядят конкретно;
* план развития не выглядит “генерик HR-текстом”.

---

# Что делать сразу после MVP

После того как MVP без Jira работает, переходи к `WF20_Jira_Enrichment`.

Порядок такой:

## Этап 1

Подключить только задачи, где сотрудник `assignee`.

## Этап 2

Сделать rule-based summary без LLM.

## Этап 3

Добавить LLM Jira summarizer.

## Этап 4

Включить reconciliation:

* self-assessment vs Jira evidence.

---

# Практический список артефактов, которые у тебя должны появиться

К концу 2–3 дней у тебя должно быть:

## Workflow

* `WF10_Ingestion_Normalization_v1`
* `WF11_Prepare_Employee_Context_v1`
* `WF30_Competency_Analysis_v1`
* `WF40_Development_Plan_v1`
* `WF50_Report_Generation_v1`
* `WF00_Orchestrator_v1`

## Тестовые данные

* `employees_test.xlsx`
* `matrices_test.xlsx`
* `learning_assets_test.xlsx`
* `self_assessments_test.xlsx`

## Артефакты результата

* 3–5 markdown отчетов
* 3–5 JSON отчетов
* один `run_summary`

---

# Самые частые причины, почему MVP тормозит

## 1. Плохая матрица

Если matrix.xlsx слишком “человеческий”, ты застрянешь в парсинге.
Решение: сначала руками привести матрицу к tabular виду.

## 2. Слишком рано подключили Jira

Jira добавляет много интеграционной сложности.
Решение: сначала без нее.

## 3. Слишком много сотрудников сразу

Сложно дебажить.
Решение: 1 сотрудник → 3 сотрудника → batch.

## 4. Нет строгой валидации LLM-output

Потом все ломается ниже по цепочке.
Решение: parse/validate после каждого LLM-вызова.

## 5. Нет test fixtures

Без тестовых файлов сложно стабильно двигаться.
Решение: собрать небольшой эталонный набор и использовать его в каждом прогоне.

---

# Как бы я сам шел в твоей ситуации

Мой практический порядок был бы таким:

Сегодня:

* добить `WF10`
* добить `WF11`

Потом:

* поднять `WF30` на одном backend engineer
* добиться хорошего качества summary

Потом:

* подключить `WF40`
* получить первый реальный development plan

Потом:

* собрать `WF50`
* показать 1 готовый отчет пользователю/руководителю

Потом:

* обернуть в `WF00`
* только затем лезть в Jira

---

# Определение done для каждого workflow

## `WF10`

Done, если нормализует все 4 источника и не падает на грязных строках.

## `WF11`

Done, если стабильно собирает контекст одного сотрудника.

## `WF30`

Done, если дает разумный structured analysis по 3 тестовым сотрудникам.

## `WF40`

Done, если план развития реалистичный и ограничение по кварталам соблюдается.

## `WF50`

Done, если markdown-отчет можно реально отправить руководителю без стыда.

## `WF00`

Done, если 1 плохой сотрудник не ломает batch run.

---

# Самый полезный следующий шаг

Теперь лучше всего перейти в совсем практику: я могу дать тебе “боевой стартовый пакет” для n8n в формате набора JSON contracts и payload examples по каждому workflow, чтобы ты не придумывал руками структуру входов/выходов.








\\\\\\\\\\\\\\\\\\\\






Ниже — “боевой стартовый пакет”: контракты входа/выхода по каждому workflow + примеры payload. Это удобно держать как reference рядом с n8n.

---

# Общие принципы

* Во всех workflow держи один ключевой идентификатор: `employee_id`.
* На меж-workflow границах передавай уже нормализованные поля, не сырые Excel-строки.
* Везде, где есть LLM, возвращай только структурированный JSON.
* Каждый workflow должен уметь жить с частично пустыми данными.

---

# 1) `WF10_Ingestion_Normalization_v1`

## Input contract

```json
{
  "files": {
    "employees_path": "/data/employees.xlsx",
    "matrices_path": "/data/matrices.xlsx",
    "learning_path": "/data/learning_assets.xlsx",
    "self_assessments_path": "/data/self_assessments.xlsx"
  },
  "config": {
    "default_competency_priority_weight": 0.5,
    "default_assessment_date": "2026-03-21"
  }
}
```

## Output contract

```json
{
  "employees": [
    {
      "employee_id": "iivanov",
      "login": "iivanov",
      "full_name": "Иванов Иван",
      "position": "Senior Backend Engineer",
      "team": "Payments",
      "role": "backend_engineer",
      "grade": "senior"
    }
  ],
  "matrices": [
    {
      "role": "backend_engineer",
      "competencies": [
        {
          "competency_id": "backend_architecture",
          "name": "Backend Architecture",
          "type": "hard",
          "category": "engineering",
          "description": "Проектирование backend-сервисов",
          "levels": [
            { "level": 1, "description": "..." },
            { "level": 2, "description": "..." },
            { "level": 3, "description": "..." },
            { "level": 4, "description": "..." }
          ],
          "priority_weight": 0.8
        }
      ]
    }
  ],
  "learning_assets": [
    {
      "asset_id": "course_system_design_basics",
      "title": "System Design Basics",
      "type": "course",
      "format": "video",
      "provider": "internal",
      "duration_hours": 8,
      "competencies": ["system_design"],
      "recommended_for_roles": ["backend_engineer"],
      "target_levels": [2, 3],
      "difficulty": "intermediate",
      "url": "https://internal/course/system-design",
      "description": "..."
    }
  ],
  "self_assessments": [
    {
      "employee_id": "iivanov",
      "role": "backend_engineer",
      "assessment_date": "2026-03-01",
      "items": [
        {
          "competency_id": "backend_architecture",
          "selected_level": 2,
          "comment": "Проектировал API и участвовал в ревью решений"
        }
      ]
    }
  ],
  "data_quality_issues": [
    {
      "severity": "warning",
      "entity_type": "self_assessment",
      "entity_id": "iivanov",
      "issue_code": "empty_comment",
      "message": "Пустой комментарий по компетенции debugging"
    }
  ],
  "stats": {
    "employees_count": 5,
    "matrices_count": 2,
    "learning_assets_count": 24,
    "self_assessments_count": 4,
    "issues_count": 6
  }
}
```

## Minimal sample payload for testing

```json
{
  "files": {
    "employees_path": "/data/test/employees_test.xlsx",
    "matrices_path": "/data/test/matrices_test.xlsx",
    "learning_path": "/data/test/learning_assets_test.xlsx",
    "self_assessments_path": "/data/test/self_assessments_test.xlsx"
  },
  "config": {
    "default_competency_priority_weight": 0.5,
    "default_assessment_date": "2026-03-21"
  }
}
```

---

# 2) `WF11_Prepare_Employee_Context_v1`

## Input contract

```json
{
  "normalized_data": {
    "employees": [],
    "matrices": [],
    "learning_assets": [],
    "self_assessments": [],
    "data_quality_issues": []
  },
  "employee_id": "iivanov",
  "config": {
    "learning_assets_limit_per_competency": 5
  }
}
```

## Output contract

```json
{
  "employee": {
    "employee_id": "iivanov",
    "login": "iivanov",
    "full_name": "Иванов Иван",
    "position": "Senior Backend Engineer",
    "team": "Payments",
    "role": "backend_engineer",
    "grade": "senior"
  },
  "self_assessment": {
    "employee_id": "iivanov",
    "role": "backend_engineer",
    "assessment_date": "2026-03-01",
    "items": [
      {
        "competency_id": "backend_architecture",
        "selected_level": 2,
        "comment": "Проектировал API и участвовал в ревью решений"
      }
    ]
  },
  "role_matrix": {
    "role": "backend_engineer",
    "competencies": []
  },
  "learning_assets_pool": [
    {
      "asset_id": "course_system_design_basics",
      "title": "System Design Basics",
      "competencies": ["system_design"],
      "recommended_for_roles": ["backend_engineer"]
    }
  ],
  "employee_data_quality_issues": [
    {
      "severity": "warning",
      "entity_type": "self_assessment",
      "entity_id": "iivanov",
      "issue_code": "empty_comment",
      "message": "Пустой комментарий по компетенции debugging"
    }
  ],
  "config": {
    "learning_assets_limit_per_competency": 5
  }
}
```

## Error-ish output example

```json
{
  "employee": {
    "employee_id": "unknown_employee"
  },
  "self_assessment": null,
  "role_matrix": null,
  "learning_assets_pool": [],
  "employee_data_quality_issues": [
    {
      "severity": "error",
      "entity_type": "employee",
      "entity_id": "unknown_employee",
      "issue_code": "employee_not_found",
      "message": "Сотрудник unknown_employee не найден"
    }
  ],
  "config": {
    "learning_assets_limit_per_competency": 5
  }
}
```

---

# 3) `WF20_Jira_Enrichment_v1`

## Input contract

```json
{
  "employee": {
    "employee_id": "iivanov",
    "login": "iivanov",
    "full_name": "Иванов Иван",
    "role": "backend_engineer",
    "grade": "senior"
  },
  "config": {
    "review_period_start": "2025-09-21",
    "review_period_end": "2026-03-21"
  }
}
```

## Output contract

```json
{
  "jira_summary": {
    "available": true,
    "summary": "Сотрудник в основном работал над backend-задачами в домене payments и billing, участвовал в исправлении production bugs и доработках API.",
    "stats": {
      "total_tasks": 24,
      "done_tasks": 18,
      "bugs": 5,
      "stories": 11,
      "top_components": ["billing", "api"],
      "top_labels": ["backend", "payments"]
    },
    "evidence_items": [
      {
        "task_key": "PAY-123",
        "competency_hint": "backend_architecture",
        "evidence": "Участвовал в проектировании механизма retry/idempotency"
      },
      {
        "task_key": "PAY-130",
        "competency_hint": "debugging",
        "evidence": "Исправил production bug в модуле billing"
      }
    ],
    "confidence": "medium",
    "data_coverage": "medium"
  },
  "jira_tasks_normalized": [
    {
      "key": "PAY-123",
      "summary": "Implement idempotency for payment retries",
      "issue_type": "Story",
      "status": "Done",
      "assignee": "iivanov",
      "created": "2025-12-10",
      "updated": "2025-12-20",
      "resolved": "2025-12-20",
      "labels": ["backend", "payments"],
      "components": ["billing"],
      "priority": "High",
      "description_text": "...",
      "comment_texts": ["..."]
    }
  ]
}
```

## Jira disabled fallback output

```json
{
  "jira_summary": {
    "available": false,
    "summary": "Jira enrichment отключен или недоступен для этого запуска.",
    "stats": {},
    "evidence_items": [],
    "confidence": "low",
    "data_coverage": "low"
  },
  "jira_tasks_normalized": []
}
```

---

# 4) `WF30_Competency_Analysis_v1`

## Input contract

```json
{
  "employee": {
    "employee_id": "iivanov",
    "login": "iivanov",
    "full_name": "Иванов Иван",
    "position": "Senior Backend Engineer",
    "team": "Payments",
    "role": "backend_engineer",
    "grade": "senior"
  },
  "self_assessment": {
    "employee_id": "iivanov",
    "role": "backend_engineer",
    "assessment_date": "2026-03-01",
    "items": [
      {
        "competency_id": "backend_architecture",
        "selected_level": 2,
        "comment": "Проектировал API и участвовал в ревью решений"
      }
    ]
  },
  "role_matrix": {
    "role": "backend_engineer",
    "competencies": [
      {
        "competency_id": "backend_architecture",
        "name": "Backend Architecture",
        "type": "hard",
        "category": "engineering",
        "description": "Проектирование backend-сервисов",
        "levels": [
          { "level": 1, "description": "..." },
          { "level": 2, "description": "..." },
          { "level": 3, "description": "..." },
          { "level": 4, "description": "..." }
        ],
        "priority_weight": 0.8
      }
    ]
  },
  "learning_assets_pool": [],
  "jira_summary": {
    "available": false,
    "summary": "Jira enrichment отключен на этапе MVP",
    "evidence_items": [],
    "confidence": "low",
    "data_coverage": "low"
  },
  "employee_data_quality_issues": [],
  "config": {
    "max_competencies_for_llm": 12,
    "expected_target_level_by_grade": {
      "junior": 2,
      "middle": 3,
      "senior": 4,
      "lead": 4
    }
  }
}
```

## Output contract

```json
{
  "competency_analysis": {
    "competency_results": [
      {
        "competency_id": "backend_architecture",
        "self_level": 2,
        "estimated_level": 2,
        "confidence": "medium",
        "assessment": "Сотрудник уверенно работает на уровне проектирования отдельных компонентов, но недостаточно подтверждений для системного проектирования end-to-end.",
        "evidence_for": [
          "Комментарий сотрудника о проектировании API",
          "Участие в ревью решений"
        ],
        "evidence_missing": [
          "Нет подтверждений ownership архитектуры end-to-end"
        ],
        "risk_flags": [],
        "priority": "high",
        "development_focus": "Развивать навыки архитектурных trade-offs и системного проектирования"
      }
    ],
    "employee_summary": {
      "overall_summary": "Сотрудник демонстрирует уверенную базу в backend-разработке и компонентном проектировании. Основная зона роста — переход от проектирования отдельных решений к более целостному системному дизайну. Из-за ограниченности evidence часть выводов требует калибровки на рабочих задачах.",
      "strengths": [
        "Уверенная backend-база",
        "Способность описывать и аргументировать отдельные технические решения"
      ],
      "growth_areas": [
        "System design",
        "Архитектурные trade-offs"
      ],
      "alignment": {
        "overestimated": [],
        "underestimated": [],
        "aligned": ["backend_architecture"]
      },
      "top_priorities_next_6m": [
        "system_design",
        "backend_architecture"
      ],
      "confidence": "medium"
    },
    "top_priority_competencies": [
      "system_design",
      "backend_architecture"
    ],
    "analysis_quality": "medium",
    "flags": []
  }
}
```

## Fallback output example

```json
{
  "competency_analysis": {
    "competency_results": [],
    "employee_summary": {
      "overall_summary": "Анализ компетенций не был корректно построен, требуется ручная проверка.",
      "strengths": [],
      "growth_areas": [],
      "alignment": {
        "overestimated": [],
        "underestimated": [],
        "aligned": []
      },
      "top_priorities_next_6m": [],
      "confidence": "low"
    },
    "top_priority_competencies": [],
    "analysis_quality": "low",
    "flags": ["analysis_failed"]
  }
}
```

---

# 5) `WF40_Development_Plan_v1`

## Input contract

```json
{
  "employee": {
    "employee_id": "iivanov",
    "full_name": "Иванов Иван",
    "role": "backend_engineer",
    "position": "Senior Backend Engineer",
    "team": "Payments",
    "grade": "senior"
  },
  "role_matrix": {
    "role": "backend_engineer",
    "competencies": []
  },
  "learning_assets_pool": [
    {
      "asset_id": "course_system_design_basics",
      "title": "System Design Basics",
      "type": "course",
      "format": "video",
      "provider": "internal",
      "duration_hours": 8,
      "competencies": ["system_design"],
      "recommended_for_roles": ["backend_engineer"],
      "target_levels": [2, 3],
      "difficulty": "intermediate",
      "url": "https://internal/course/system-design",
      "description": "..."
    }
  ],
  "jira_summary": {
    "available": false,
    "summary": "Jira enrichment отключен на этапе MVP",
    "evidence_items": [],
    "confidence": "low"
  },
  "competency_analysis": {
    "competency_results": [],
    "employee_summary": {
      "overall_summary": "..."
    },
    "top_priority_competencies": [
      "system_design",
      "backend_architecture"
    ],
    "analysis_quality": "medium",
    "flags": []
  },
  "config": {
    "plan_duration_months": 6,
    "quarters": 2,
    "max_competencies_per_quarter": 4,
    "max_assets_per_competency": 5
  }
}
```

## Output contract

```json
{
  "development_plan": {
    "quarter_1": [
      {
        "competency_id": "system_design",
        "competency_name": "System Design",
        "reason": "Компетенция критична для следующего шага в роли и имеет заметный потенциал роста.",
        "target_from": 2,
        "target_to": 3,
        "actions": [
          {
            "type": "course",
            "title": "System Design Basics",
            "description": "Пройти курс и зафиксировать ключевые trade-offs"
          },
          {
            "type": "practice",
            "title": "Подготовить design proposal",
            "description": "Сделать проектирование одного сервиса или подсистемы и пройти review с lead engineer"
          }
        ],
        "success_criteria": [
          "Может объяснить основные trade-offs выбранного решения",
          "Подготовил и защитил минимум один design proposal"
        ],
        "manager_support": [
          "Дать задачу с архитектурной составляющей",
          "Организовать review design proposal"
        ]
      }
    ],
    "quarter_2": [
      {
        "competency_id": "backend_architecture",
        "competency_name": "Backend Architecture",
        "reason": "Нужно закрепить переход от локальных решений к более системному уровню проектирования.",
        "target_from": 2,
        "target_to": 3,
        "actions": [
          {
            "type": "project",
            "title": "Ownership для технической инициативы",
            "description": "Взять ownership на изменение или развитие backend-модуля"
          }
        ],
        "success_criteria": [
          "Продемонстрировал более целостный подход к проектированию",
          "Есть подтвержденный прогресс от руководителя или техлида"
        ],
        "manager_support": [
          "Дать зону ownership",
          "Провести разбор архитектурных решений"
        ]
      }
    ],
    "plan_summary": "План сфокусирован на развитии системного мышления и архитектурного уровня через сочетание обучения и практики."
  },
  "manager_plan": {
    "focus_areas": [
      "Наблюдать за качеством технических решений и аргументацией trade-offs",
      "Отслеживать способность брать ownership на более крупные куски системы"
    ],
    "support_actions": [
      "Давать задачи с проектной неопределенностью и архитектурной составляющей",
      "Организовывать регулярные design review"
    ],
    "assignment_recommendations": [
      "Задачи на проектирование и изменение контрактов между сервисами",
      "Инициативы с необходимостью выбора архитектурных компромиссов"
    ],
    "risks": [
      "Развитие останется теоретическим без рабочей практики",
      "Недостаток качественной обратной связи от lead/manager"
    ],
    "checkpoints": [
      "Через 6-8 недель обсудить один конкретный design proposal",
      "В конце квартала оценить качество решений на рабочем примере"
    ]
  },
  "one2one_guide": {
    "conversation_goal": "Сверить самооценку с рабочими примерами, выделить зоны роста и согласовать реалистичный план развития на полугодие.",
    "sections": [
      {
        "title": "Рефлексия по текущему состоянию",
        "questions": [
          "Какие задачи за последние месяцы лучше всего показали твой текущий уровень?",
          "Какие компетенции ты сам считаешь своими сильными сторонами и почему?"
        ]
      }
    ],
    "closing_questions": [
      "Какие 2-3 фокуса мы берем в работу в первую очередь?",
      "Как поймем через квартал, что есть прогресс?"
    ],
    "agreement_points": [
      "Приоритетные компетенции на квартал",
      "Поддержка со стороны руководителя",
      "Контрольные точки и критерии прогресса"
    ]
  }
}
```

---

# 6) `WF50_Report_Generation_v1`

## Input contract

```json
{
  "employee": {
    "employee_id": "iivanov",
    "full_name": "Иванов Иван",
    "role": "backend_engineer",
    "position": "Senior Backend Engineer",
    "team": "Payments",
    "grade": "senior"
  },
  "self_assessment": {
    "employee_id": "iivanov",
    "role": "backend_engineer",
    "assessment_date": "2026-03-01",
    "items": []
  },
  "role_matrix": {
    "role": "backend_engineer",
    "competencies": []
  },
  "jira_summary": {
    "available": false,
    "summary": "Jira enrichment отключен на этапе MVP",
    "evidence_items": [],
    "confidence": "low"
  },
  "competency_analysis": {
    "competency_results": [],
    "employee_summary": {},
    "top_priority_competencies": [],
    "analysis_quality": "medium",
    "flags": []
  },
  "development_plan": {
    "quarter_1": [],
    "quarter_2": [],
    "plan_summary": ""
  },
  "manager_plan": {
    "focus_areas": [],
    "support_actions": [],
    "assignment_recommendations": [],
    "risks": [],
    "checkpoints": []
  },
  "one2one_guide": {
    "conversation_goal": "",
    "sections": [],
    "closing_questions": [],
    "agreement_points": []
  },
  "employee_data_quality_issues": [],
  "config": {
    "run_id": "run_2026_03_21_001",
    "assessment_date": "2026-03-21",
    "review_period_start": "2025-09-21",
    "review_period_end": "2026-03-21"
  }
}
```

## Output contract

```json
{
  "employee_report_json": {
    "meta": {
      "run_id": "run_2026_03_21_001",
      "assessment_date": "2026-03-21",
      "review_period_start": "2025-09-21",
      "review_period_end": "2026-03-21",
      "generated_at": "2026-03-21T12:00:00.000Z"
    },
    "employee": {},
    "self_assessment": {},
    "role_matrix": {
      "role": "backend_engineer",
      "competencies_count": 10
    },
    "jira_summary": {},
    "competency_analysis": {},
    "development_plan": {},
    "manager_plan": {},
    "one2one_guide": {},
    "data_quality_issues": []
  },
  "employee_report_markdown": "# Отчет по оценке компетенций и плану развития\n...",
  "manager_compact_markdown": "# Краткая выжимка для руководителя\n...",
  "report_meta": {
    "employee_id": "iivanov",
    "report_filename": "iivanov_2026-03-21.md",
    "json_filename": "iivanov_2026-03-21.json"
  }
}
```

---

# 7) `WF00_Orchestrator_v1`

## Input contract

```json
{
  "files": {
    "employees_path": "/data/test/employees_test.xlsx",
    "matrices_path": "/data/test/matrices_test.xlsx",
    "learning_path": "/data/test/learning_assets_test.xlsx",
    "self_assessments_path": "/data/test/self_assessments_test.xlsx"
  },
  "config": {
    "run_id": "run_2026_03_21_001",
    "assessment_date": "2026-03-21",
    "review_period_months": 6,
    "review_period_start": "",
    "review_period_end": "",
    "target_employee_ids": ["iivanov"],
    "exclude_employee_ids": [],
    "target_roles": [],
    "use_jira": false,
    "generate_reports": true,
    "store_json_report": true,
    "store_markdown_report": true,
    "max_competencies_for_llm": 12,
    "max_competencies_per_quarter": 4,
    "max_assets_per_competency": 5,
    "llm_retry_count": 1,
    "stop_on_employee_error": false
  }
}
```

## Output contract

```json
{
  "run_summary": {
    "run_id": "run_2026_03_21_001",
    "total_employees": 1,
    "succeeded": 1,
    "failed": 0,
    "success_rate": 1,
    "employees_failed": [],
    "generated_at": "2026-03-21T12:10:00.000Z"
  },
  "employee_results": [
    {
      "run_id": "run_2026_03_21_001",
      "employee_id": "iivanov",
      "employee_name": "Иванов Иван",
      "role": "backend_engineer",
      "status": "success",
      "analysis_quality": "medium",
      "flags": [],
      "report_filename": "iivanov_2026-03-21.md",
      "generated_at": "2026-03-21T12:09:59.000Z"
    }
  ]
}
```

## Failed employee result example

```json
{
  "run_id": "run_2026_03_21_001",
  "employee_id": "broken_user",
  "employee_name": "Петров Петр",
  "role": "unknown_role",
  "status": "failed",
  "stage": "prepare_context",
  "analysis_quality": "unknown",
  "flags": ["missing_role_matrix"],
  "report_filename": "",
  "generated_at": "2026-03-21T12:05:00.000Z"
}
```

---

# 8) Внутренние payload для LLM-нод

## A. Payload для анализа одной компетенции

```json
{
  "employee": {
    "employee_id": "iivanov",
    "full_name": "Иванов Иван",
    "role": "backend_engineer",
    "position": "Senior Backend Engineer",
    "team": "Payments",
    "grade": "senior"
  },
  "competency": {
    "competency_id": "backend_architecture",
    "name": "Backend Architecture",
    "type": "hard",
    "category": "engineering",
    "description": "Проектирование backend-сервисов",
    "levels": [
      { "level": 1, "description": "..." },
      { "level": 2, "description": "..." },
      { "level": 3, "description": "..." },
      { "level": 4, "description": "..." }
    ]
  },
  "target_level": 4,
  "self_assessment_item": {
    "selected_level": 2,
    "comment": "Проектировал API и участвовал в ревью решений"
  },
  "jira_evidence": []
}
```

## B. Payload для employee summary

```json
{
  "employee": {
    "employee_id": "iivanov",
    "full_name": "Иванов Иван",
    "role": "backend_engineer",
    "position": "Senior Backend Engineer",
    "team": "Payments",
    "grade": "senior"
  },
  "jira_summary": {
    "available": false,
    "summary": "Jira enrichment отключен на этапе MVP",
    "confidence": "low",
    "evidence_items": []
  },
  "competency_results": [
    {
      "competency_id": "backend_architecture",
      "self_level": 2,
      "estimated_level": 2,
      "confidence": "medium",
      "assessment": "...",
      "evidence_for": ["..."],
      "evidence_missing": ["..."],
      "risk_flags": [],
      "priority": "high",
      "development_focus": "..."
    }
  ],
  "data_quality_flags": [
    {
      "severity": "warning",
      "issue_code": "empty_comment",
      "message": "Пустой комментарий по компетенции debugging"
    }
  ]
}
```

## C. Payload для development plan

```json
{
  "employee": {
    "employee_id": "iivanov",
    "full_name": "Иванов Иван",
    "role": "backend_engineer",
    "position": "Senior Backend Engineer",
    "team": "Payments",
    "grade": "senior"
  },
  "employee_summary": {
    "overall_summary": "...",
    "strengths": ["..."],
    "growth_areas": ["..."],
    "alignment": {
      "overestimated": [],
      "underestimated": [],
      "aligned": ["backend_architecture"]
    },
    "top_priorities_next_6m": ["system_design", "backend_architecture"],
    "confidence": "medium"
  },
  "jira_summary": {
    "available": false,
    "summary": "Jira enrichment отключен на этапе MVP",
    "confidence": "low"
  },
  "constraints": {
    "plan_duration_months": 6,
    "quarters": 2,
    "max_competencies_per_quarter": 4,
    "max_total_competencies": 8
  },
  "planning_candidates": [
    {
      "competency_id": "system_design",
      "competency_name": "System Design",
      "competency_type": "hard",
      "description": "...",
      "levels": [
        { "level": 1, "description": "..." },
        { "level": 2, "description": "..." },
        { "level": 3, "description": "..." }
      ],
      "self_level": 2,
      "estimated_level": 2,
      "target_level": 3,
      "confidence": "medium",
      "assessment": "...",
      "development_focus": "...",
      "evidence_for": ["..."],
      "evidence_missing": ["..."],
      "priority": "high",
      "learning_assets": [
        {
          "asset_id": "course_system_design_basics",
          "title": "System Design Basics",
          "type": "course",
          "description": "...",
          "url": "https://internal/course/system-design"
        }
      ]
    }
  ]
}
```

## D. Payload для manager plan

```json
{
  "employee": {
    "employee_id": "iivanov",
    "full_name": "Иванов Иван",
    "role": "backend_engineer",
    "position": "Senior Backend Engineer",
    "team": "Payments",
    "grade": "senior"
  },
  "employee_summary": {
    "overall_summary": "...",
    "strengths": ["..."],
    "growth_areas": ["..."],
    "alignment": {
      "overestimated": [],
      "underestimated": [],
      "aligned": ["backend_architecture"]
    },
    "top_priorities_next_6m": ["system_design", "backend_architecture"],
    "confidence": "medium"
  },
  "development_plan": {
    "quarter_1": [],
    "quarter_2": [],
    "plan_summary": "..."
  },
  "analysis_quality": "medium",
  "flags": []
}
```

## E. Payload для one-to-one guide

```json
{
  "employee": {
    "employee_id": "iivanov",
    "full_name": "Иванов Иван",
    "role": "backend_engineer",
    "position": "Senior Backend Engineer",
    "team": "Payments",
    "grade": "senior"
  },
  "employee_summary": {
    "overall_summary": "...",
    "strengths": ["..."],
    "growth_areas": ["..."],
    "alignment": {
      "overestimated": [],
      "underestimated": [],
      "aligned": ["backend_architecture"]
    },
    "top_priorities_next_6m": ["system_design", "backend_architecture"],
    "confidence": "medium"
  },
  "development_plan": {
    "quarter_1": [],
    "quarter_2": [],
    "plan_summary": "..."
  },
  "manager_plan": {
    "focus_areas": [],
    "support_actions": [],
    "assignment_recommendations": [],
    "risks": [],
    "checkpoints": []
  }
}
```

---

# 9) Рекомендуемый стандарт полей ошибок/флагов

Держи единый формат везде.

## Issue object

```json
{
  "severity": "warning",
  "entity_type": "self_assessment",
  "entity_id": "iivanov",
  "issue_code": "empty_comment",
  "message": "Пустой комментарий по компетенции debugging"
}
```

## Flag examples

```json
[
  "analysis_failed",
  "jira_unavailable",
  "low_evidence_confidence",
  "fallback_used",
  "missing_role_matrix"
]
```

---

# 10) Рекомендуемый стандарт статусов по сотруднику

```json
{
  "status": "success"
}
```

или

```json
{
  "status": "failed",
  "stage": "prepare_context"
}
```

Допустимые `stage`:

* `ingestion`
* `prepare_context`
* `jira_enrichment`
* `competency_analysis`
* `development_plan`
* `report_generation`
* `storage`

---

# 11) Минимальный тестовый прогон

Вот payload, с которого я бы стартовал `WF00_Orchestrator_v1`:

```json
{
  "files": {
    "employees_path": "/data/test/employees_test.xlsx",
    "matrices_path": "/data/test/matrices_test.xlsx",
    "learning_path": "/data/test/learning_assets_test.xlsx",
    "self_assessments_path": "/data/test/self_assessments_test.xlsx"
  },
  "config": {
    "run_id": "run_2026_03_21_debug_001",
    "assessment_date": "2026-03-21",
    "review_period_months": 6,
    "review_period_start": "",
    "review_period_end": "",
    "target_employee_ids": ["iivanov"],
    "exclude_employee_ids": [],
    "target_roles": [],
    "use_jira": false,
    "generate_reports": true,
    "store_json_report": true,
    "store_markdown_report": true,
    "max_competencies_for_llm": 10,
    "max_competencies_per_quarter": 4,
    "max_assets_per_competency": 5,
    "llm_retry_count": 1,
    "stop_on_employee_error": false
  }
}
```

---

# 12) Что сделать прямо сейчас

С этого момента твоя лучшая следующая практическая задача — собрать один “debug path” на одного сотрудника:

* `WF10`
* `WF11`
* `WF30`
* `WF40`
* `WF50`

и гонять только `target_employee_ids = ["iivanov"]`.

Когда это стабильно заработает, уже оборачивать в полноценный `WF00` и потом добавлять `WF20 Jira`.

Следующим сообщением я могу дать тебе уже совсем прикладную вещь: структуру `HTTP Request` ноды для OpenAI-compatible прокси в n8n, с готовыми body templates для всех LLM-вызовов.








\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\






Ниже — готовые шаблоны `HTTP Request` для `n8n`, если у тебя OpenAI-compatible прокси, который под капотом маршрутизирует в `GigaChat Max`.

Я дам:

1. базовый шаблон ноды;
2. 6 готовых body для разных LLM-вызовов;
3. как парсить ответ;
4. как делать retry/fallback;
5. на что смотреть, если прокси ведет себя не совсем как OpenAI.

---

# 1. Базовый шаблон `HTTP Request` ноды

Для всех LLM-шагов логика одна и та же.

## Рекомендуемые настройки ноды

**Method:** `POST`
**URL:** `https://<your-proxy>/v1/chat/completions`

**Authentication:**

* если через bearer token, удобнее в headers
* либо через credential, если у тебя так настроено

**Send Headers:** `true`

### Headers

```json
{
  "Authorization": "Bearer {{$env.OPENAI_PROXY_API_KEY}}",
  "Content-Type": "application/json"
}
```

Если токен не через env, можно временно так:

```json
{
  "Authorization": "Bearer {{ $json.api_key }}",
  "Content-Type": "application/json"
}
```

---

# 2. Общий body-шаблон

Во всех нодах body будет примерно такой:

```json
{
  "model": "gigachat-max",
  "temperature": 0.2,
  "messages": [
    {
      "role": "system",
      "content": "SYSTEM_PROMPT"
    },
    {
      "role": "user",
      "content": "USER_PROMPT"
    }
  ]
}
```

Если твой прокси поддерживает OpenAI-style structured output, можно добавить:

```json
"response_format": {
  "type": "json_object"
}
```

Но я бы сначала проверил без этого, потому что некоторые прокси декларируют OpenAI-совместимость, но не полностью поддерживают этот параметр.

---

# 3. Как удобнее собирать prompt в n8n

Я бы перед `HTTP Request` всегда ставил `Set` или `Code` node, который готовит:

* `system_prompt`
* `user_prompt`
* `payload`

Тогда body будет очень чистым.

Пример полей перед `HTTP Request`:

```json
{
  "system_prompt": "Ты анализируешь одну компетенцию...",
  "user_prompt": "Верни JSON по схеме ... Данные: {...}",
  "payload": {...}
}
```

---

# 4. Универсальный body template для `HTTP Request`

В `Body Parameters` или `JSON Body` можно вставлять так:

```json
{
  "model": "gigachat-max",
  "temperature": 0.2,
  "messages": [
    {
      "role": "system",
      "content": "={{$json.system_prompt}}"
    },
    {
      "role": "user",
      "content": "={{$json.user_prompt}}"
    }
  ]
}
```

Если хочешь жестче требовать JSON:

```json
{
  "model": "gigachat-max",
  "temperature": 0.2,
  "messages": [
    {
      "role": "system",
      "content": "={{$json.system_prompt}}"
    },
    {
      "role": "user",
      "content": "={{$json.user_prompt}}"
    }
  ],
  "response_format": {
    "type": "json_object"
  }
}
```

---

# 5. Шаблон для `LLM Competency Analysis`

Это главный вызов.

## Узел перед ним: `Set :: Build Competency LLM Request`

Поля:

### `system_prompt`

```text
Ты анализируешь одну компетенцию IT-инженера.

Твоя задача:
- сопоставить самооценку сотрудника, описание уровней компетенции и рабочие evidence;
- оценить текущий уровень только на основе переданных данных;
- указать уверенность оценки;
- явно отметить, если evidence недостаточно.

Правила:
- не выдумывай evidence;
- не делай выводов, которых нет в данных;
- не путай "нет данных" и "низкий уровень";
- не переоценивай и не занижай уровень без оснований;
- assessment должен быть кратким, деловым и конкретным;
- development_focus должен быть полезен для построения плана развития.

Верни строго JSON без пояснений вокруг.
```

### `user_prompt`

```text
Верни JSON по схеме:

{
  "competency_id": "string",
  "self_level": 0,
  "estimated_level": 0,
  "confidence": "low|medium|high",
  "assessment": "string",
  "evidence_for": ["string"],
  "evidence_missing": ["string"],
  "risk_flags": ["string"],
  "priority": "low|medium|high",
  "development_focus": "string"
}

Дополнительные правила:
- если selected_level отсутствует, self_level верни как null;
- если данных явно мало, confidence должен быть low;
- priority определяй с учетом важности компетенции для роли и наблюдаемого gap;
- risk_flags используй только если реально есть риск: например, завышение самооценки, нехватка evidence, слабая подтверждаемость.

Данные:
={{JSON.stringify($json.payload)}}
```

## `HTTP Request :: Competency Analysis`

Body:

```json
{
  "model": "gigachat-max",
  "temperature": 0.2,
  "messages": [
    {
      "role": "system",
      "content": "={{$json.system_prompt}}"
    },
    {
      "role": "user",
      "content": "={{$json.user_prompt}}"
    }
  ]
}
```

---

# 6. Шаблон для `LLM Employee Summary`

## Узел `Set :: Build Employee Summary Request`

### `system_prompt`

```text
Ты готовишь сводный вывод по инженерному профилю сотрудника на основе уже выполненного анализа компетенций.

Твоя задача:
- выделить сильные стороны;
- выделить зоны роста;
- сопоставить самооценку и evidence;
- определить приоритеты развития на ближайшие 6 месяцев.

Правила:
- опирайся только на переданные данные;
- не повторяй все компетенции подряд, выделяй главное;
- не путай отсутствие evidence и отсутствие компетенции;
- если много low-confidence сигналов, отрази это в выводе;
- top_priorities_next_6m должны быть списком competency_id или кратких названий фокусов, пригодных для дальнейшего планирования.

Верни строго JSON без пояснений вокруг.
```

### `user_prompt`

```text
Верни JSON по схеме:

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

Требования:
- strengths и growth_areas должны быть короткими, конкретными и без воды;
- overall_summary должен быть в 3-6 предложениях;
- не включай больше 6 приоритетов в top_priorities_next_6m.

Данные:
={{JSON.stringify($json.employee_summary_payload)}}
```

## `HTTP Request :: Employee Summary`

Body тот же:

```json
{
  "model": "gigachat-max",
  "temperature": 0.2,
  "messages": [
    {
      "role": "system",
      "content": "={{$json.system_prompt}}"
    },
    {
      "role": "user",
      "content": "={{$json.user_prompt}}"
    }
  ]
}
```

---

# 7. Шаблон для `LLM Development Plan`

## Узел `Set :: Build Development Plan Request`

### `system_prompt`

```text
Ты формируешь реалистичный полугодовой план развития IT-инженера.

Твоя задача:
- выбрать наиболее важные и реалистичные фокусы развития;
- разложить их по двум кварталам;
- для каждой компетенции предложить конкретные действия;
- опираться только на предоставленные learning assets и факты анализа.

Правила:
- не придумывай новые курсы, программы, книги и материалы, которых нет во входных данных;
- если материалов мало, делай акцент на практику, mentoring, shadowing, design review, code review, knowledge sharing, ownership-задачи;
- не включай больше допустимого числа компетенций на квартал;
- план должен быть реалистичным для работающего инженера;
- в каждом квартале должны быть не только обучающие активности, но и практические;
- success_criteria должны быть наблюдаемыми;
- manager_support должен быть конкретным и применимым.

Верни строго JSON без пояснений вокруг.
```

### `user_prompt`

```text
Верни JSON по схеме:

{
  "development_plan": {
    "quarter_1": [
      {
        "competency_id": "string",
        "competency_name": "string",
        "reason": "string",
        "target_from": 0,
        "target_to": 0,
        "actions": [
          {
            "type": "course|program|practice|mentoring|reading|shadowing|project",
            "title": "string",
            "description": "string"
          }
        ],
        "success_criteria": ["string"],
        "manager_support": ["string"]
      }
    ],
    "quarter_2": [
      {
        "competency_id": "string",
        "competency_name": "string",
        "reason": "string",
        "target_from": 0,
        "target_to": 0,
        "actions": [
          {
            "type": "course|program|practice|mentoring|reading|shadowing|project",
            "title": "string",
            "description": "string"
          }
        ],
        "success_criteria": ["string"],
        "manager_support": ["string"]
      }
    ],
    "plan_summary": "string"
  }
}

Требования:
- не больше {{$json.development_plan_payload.constraints.max_competencies_per_quarter}} компетенций на квартал;
- суммарно желательно не больше 6-8 компетенций на полугодие;
- используй прежде всего planning_candidates;
- не создавай активности без явной логики;
- если confidence по компетенции низкая, допускается формулировать цель как проверку и калибровку через практику;
- quarter_1 должен чаще содержать foundation и калибровку;
- quarter_2 — закрепление, применение, ownership.

Данные:
={{JSON.stringify($json.development_plan_payload)}}
```

## `HTTP Request :: Development Plan`

```json
{
  "model": "gigachat-max",
  "temperature": 0.2,
  "messages": [
    {
      "role": "system",
      "content": "={{$json.system_prompt}}"
    },
    {
      "role": "user",
      "content": "={{$json.user_prompt}}"
    }
  ]
}
```

---

# 8. Шаблон для `LLM Manager Plan`

## Узел `Set :: Build Manager Plan Request`

### `system_prompt`

```text
Ты готовишь рекомендации руководителю по развитию инженера на полугодие.

Твоя задача:
- не пересказывать план сотрудника;
- дать управленческие рекомендации;
- указать, какие условия создать, какие задачи давать, какие риски учитывать и как отслеживать прогресс.

Правила:
- опирайся только на предоставленные данные;
- рекомендации должны быть конкретными;
- избегай общих фраз вроде "поддерживать развитие" без конкретизации;
- assignment_recommendations должны описывать типы задач или зон ответственности;
- checkpoints должны быть наблюдаемыми и пригодными для one-to-one.

Верни строго JSON без пояснений вокруг.
```

### `user_prompt`

```text
Верни JSON по схеме:

{
  "manager_plan": {
    "focus_areas": ["string"],
    "support_actions": ["string"],
    "assignment_recommendations": ["string"],
    "risks": ["string"],
    "checkpoints": ["string"]
  }
}

Требования:
- в каждом массиве желательно 3-6 пунктов;
- focus_areas — на чем руководителю держать внимание;
- support_actions — что конкретно сделать;
- assignment_recommendations — какие типы задач/инициатив давать;
- risks — где развитие может застопориться;
- checkpoints — как понять, что есть прогресс.

Данные:
={{JSON.stringify($json.manager_plan_payload)}}
```

## `HTTP Request :: Manager Plan`

```json
{
  "model": "gigachat-max",
  "temperature": 0.2,
  "messages": [
    {
      "role": "system",
      "content": "={{$json.system_prompt}}"
    },
    {
      "role": "user",
      "content": "={{$json.user_prompt}}"
    }
  ]
}
```

---

# 9. Шаблон для `LLM One-to-One Guide`

## Узел `Set :: Build One2One Request`

### `system_prompt`

```text
Ты готовишь структуру one-to-one руководителя с инженером по итогам оценки компетенций и плана развития.

Твоя задача:
- помочь провести разговор уважительно, конкретно и развивающе;
- сверить самооценку с рабочими примерами;
- обсудить мотивацию, барьеры и фокусы развития;
- помочь завершить разговор понятными договоренностями.

Правила:
- вопросы должны быть открытыми и полезными;
- не делать разговор оценочным или обвиняющим;
- не повторять один и тот же вопрос разными словами;
- sections должны логично идти от обсуждения текущего состояния к договоренностям;
- agreement_points должны быть пригодны для фиксации по итогам встречи.

Верни строго JSON без пояснений вокруг.
```

### `user_prompt`

```text
Верни JSON по схеме:

{
  "one2one_guide": {
    "conversation_goal": "string",
    "sections": [
      {
        "title": "string",
        "questions": ["string"]
      }
    ],
    "closing_questions": ["string"],
    "agreement_points": ["string"]
  }
}

Требования:
- sections должно быть 4-6;
- в каждой секции желательно 2-5 вопросов;
- conversation_goal — 1-2 предложения;
- closing_questions — вопросы, которые помогают закрепить фокус и договоренности;
- agreement_points — что стоит явно зафиксировать после встречи.

Данные:
={{JSON.stringify($json.one2one_payload)}}
```

## `HTTP Request :: One2One Guide`

```json
{
  "model": "gigachat-max",
  "temperature": 0.2,
  "messages": [
    {
      "role": "system",
      "content": "={{$json.system_prompt}}"
    },
    {
      "role": "user",
      "content": "={{$json.user_prompt}}"
    }
  ]
}
```

---

# 10. Шаблон для `LLM Jira Summarizer`

Когда дойдешь до Jira, используй этот формат.

## Узел `Set :: Build Jira Summary Request`

### `system_prompt`

```text
Ты анализируешь Jira-задачи инженера за заданный период.

Твоя задача:
- не оценивать человека в целом;
- не делать психологических выводов;
- не придумывать факты;
- извлечь только наблюдаемые рабочие сигналы и evidence, которые могут быть полезны для анализа компетенций.

Правила:
- опирайся только на переданные данные;
- если данных недостаточно, прямо укажи это;
- не путай отсутствие данных с отсутствием компетенции;
- evidence должно быть кратким, конкретным и опираться на содержимое задач;
- если задача не дает сигнала по компетенциям, не выдумывай сигнал.

Верни строго JSON без пояснений вокруг.
```

### `user_prompt`

```text
Верни JSON по схеме:

{
  "available": true,
  "summary": "string",
  "evidence_items": [
    {
      "task_key": "string",
      "competency_hint": "string",
      "evidence": "string"
    }
  ],
  "confidence": "low|medium|high",
  "data_coverage": "low|medium|high"
}

Данные:
={{JSON.stringify($json.jira_payload)}}
```

## `HTTP Request :: Jira Summarizer`

```json
{
  "model": "gigachat-max",
  "temperature": 0.1,
  "messages": [
    {
      "role": "system",
      "content": "={{$json.system_prompt}}"
    },
    {
      "role": "user",
      "content": "={{$json.user_prompt}}"
    }
  ]
}
```

---

# 11. Как парсить ответ `HTTP Request`

После каждой LLM-ноды ставь `Code :: Parse LLM JSON`.

Вот универсальный вариант:

```javascript
function extractContent(input) {
  return (
    input?.choices?.[0]?.message?.content ??
    input?.message?.content ??
    input?.content ??
    input
  );
}

function safeParse(raw) {
  if (typeof raw === 'object' && raw !== null) return raw;
  if (typeof raw !== 'string') return null;

  try {
    return JSON.parse(raw);
  } catch (e) {}

  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch (e) {}
  }

  return null;
}

const raw = extractContent($json);
const parsed = safeParse(raw);

return [{
  json: {
    raw_content: raw,
    parsed_json: parsed,
    valid_json: !!parsed
  }
}];
```

---

# 12. Как делать валидацию после парсинга

После универсального парсера ставь уже специализированный `Code` по конкретной схеме:

* competency result
* employee summary
* development plan
* manager plan
* one2one guide

То, что мы уже разбирали выше.

---

# 13. Как делать retry в n8n

Я бы делал так:

## Вариант 1: встроенный retry у ноды

Если используешь, достаточно:

* 1 retry
* small delay

## Вариант 2: через IF

После `Parse LLM JSON`:

* `IF valid_json == false`

  * идешь в `HTTP Request Retry`
* если снова false

  * идешь в fallback

---

# 14. Какой fallback держать рядом с каждой LLM-нодой

Минимум нужны fallback для:

* competency analysis
* employee summary
* development plan
* one2one

## Пример fallback для employee summary

`Set` node:

```json
{
  "employee_summary": {
    "overall_summary": "Сводный LLM-анализ не был корректно построен. Требуется ручная калибровка на основе самооценки и матрицы.",
    "strengths": [],
    "growth_areas": [],
    "alignment": {
      "overestimated": [],
      "underestimated": [],
      "aligned": []
    },
    "top_priorities_next_6m": [],
    "confidence": "low"
  }
}
```

---

# 15. На что смотреть, если прокси не совсем OpenAI-compatible

Самые частые расхождения:

## 1. Ответ не в `choices[0].message.content`

Иногда бывает:

* `message.content`
* `result`
* `data.answer`

Тогда поправишь `extractContent()` один раз.

## 2. Не поддерживается `response_format`

Тогда просто убираешь его.

## 3. Не нравится поле `model`

Тогда используй то имя, которое понимает прокси, например:

* `GigaChat-Max`
* `gigachat-max-preview`
* `giga-max`

## 4. Прокси возвращает JSON как строку с markdown fence

Например:

````json
```json
{ ... }
````

````
Тогда универсальный парсер выше спасет.

## 5. Падает на длинных prompt
Тогда:
- сокращай payload;
- убирай лишние поля;
- делай per-competency analysis только по shortlist.

---

# 16. Рекомендуемые температуры по шагам

Я бы ставил так:

- `Jira Summarizer`: `0.1`
- `Competency Analysis`: `0.2`
- `Employee Summary`: `0.2`
- `Development Plan`: `0.3`
- `Manager Plan`: `0.3`
- `One2One Guide`: `0.4`

Причина:
- там, где нужен строгий factual mapping, температура ниже;
- там, где допустима вариативность формулировок, можно чуть выше.

---

# 17. Готовый минимальный body для первого smoke test

Если хочешь прямо сейчас проверить прокси из n8n, вот самый простой body:

```json
{
  "model": "gigachat-max",
  "temperature": 0.1,
  "messages": [
    {
      "role": "system",
      "content": "Ты возвращаешь только JSON."
    },
    {
      "role": "user",
      "content": "Верни JSON вида {\"status\":\"ok\",\"message\":\"test successful\"}"
    }
  ]
}
````

Если это прошло и ты получил что-то вроде:

```json
{
  "choices": [
    {
      "message": {
        "content": "{\"status\":\"ok\",\"message\":\"test successful\"}"
      }
    }
  ]
}
```

значит базовая совместимость уже есть.

---

# 18. Практический порядок подключения LLM в n8n

Я бы делал так:

1. один тестовый `HTTP Request` smoke test;
2. один `Competency Analysis` на одном payload;
3. парсер;
4. валидация;
5. fallback;
6. только потом раскатывать на цикл по компетенциям;
7. затем employee summary;
8. затем development plan.

---

# 19. Самый полезный следующий шаг

Теперь уже можно переходить к полу-реализации: я могу дать тебе один цельный пример `debug chain` для одного сотрудника внутри n8n — какие ноды поставить подряд от `WF11` до `WF50`, в каком порядке, и что именно должно лежать в каждой ноде.








\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\




Ниже — цельный `debug chain` для одного сотрудника: от уже собранного контекста до финального отчета. Это лучший способ быстро оживить систему до полноценного batch-run.

Предположим, что у тебя уже есть:

* `WF10_Ingestion_Normalization_v1`
* `WF11_Prepare_Employee_Context_v1`

И ты хочешь собрать debug-поток для `employee_id = iivanov`.

---

# Debug chain для одного сотрудника

## Общая последовательность

1. `Manual Trigger`
2. `Set :: Debug Input`
3. `Execute Workflow :: WF10_Ingestion_Normalization_v1`
4. `Execute Workflow :: WF11_Prepare_Employee_Context_v1`
5. `Set :: Empty Jira Summary`
6. `Execute Workflow :: WF30_Competency_Analysis_v1`
7. `Execute Workflow :: WF40_Development_Plan_v1`
8. `Execute Workflow :: WF50_Report_Generation_v1`
9. `Code :: Final Debug Output`

Это самый короткий end-to-end путь без Jira.

---

# 1. `Manual Trigger`

Просто стартовая нода.

---

# 2. `Set :: Debug Input`

Положи туда все, что нужно для одного прогона.

## Поля

```json
{
  "files": {
    "employees_path": "/data/test/employees_test.xlsx",
    "matrices_path": "/data/test/matrices_test.xlsx",
    "learning_path": "/data/test/learning_assets_test.xlsx",
    "self_assessments_path": "/data/test/self_assessments_test.xlsx"
  },
  "employee_id": "iivanov",
  "config": {
    "run_id": "run_debug_iivanov_001",
    "assessment_date": "2026-03-21",
    "review_period_start": "2025-09-21",
    "review_period_end": "2026-03-21",
    "default_competency_priority_weight": 0.5,
    "learning_assets_limit_per_competency": 5,
    "max_competencies_for_llm": 10,
    "max_competencies_per_quarter": 4,
    "max_assets_per_competency": 5,
    "expected_target_level_by_grade": {
      "junior": 2,
      "middle": 3,
      "senior": 4,
      "lead": 4
    }
  }
}
```

---

# 3. `Execute Workflow :: WF10_Ingestion_Normalization_v1`

## Что передать

```json
{
  "files": "={{$json.files}}",
  "config": {
    "default_competency_priority_weight": "={{$json.config.default_competency_priority_weight}}",
    "default_assessment_date": "={{$json.config.assessment_date}}"
  }
}
```

## Что должен вернуть

Нормализованный dataset.

---

# 4. `Execute Workflow :: WF11_Prepare_Employee_Context_v1`

## Что передать

```json
{
  "normalized_data": "={{$json}}",
  "employee_id": "={{$('Set :: Debug Input').item.json.employee_id}}",
  "config": {
    "learning_assets_limit_per_competency": "={{$('Set :: Debug Input').item.json.config.learning_assets_limit_per_competency}}"
  }
}
```

Если в твоем n8n неудобно ссылаться на ноду по имени, можно перед `WF11` вставить `Merge` или `Set`, который заново собирает input.

## Что должен вернуть

```json
{
  "employee": {...},
  "self_assessment": {...},
  "role_matrix": {...},
  "learning_assets_pool": [...],
  "employee_data_quality_issues": [...]
}
```

---

# 5. `Set :: Empty Jira Summary`

Пока Jira не подключена, добавляем единый fallback.

## Поля

```json
{
  "jira_summary": {
    "available": false,
    "summary": "Jira enrichment отключен на этапе debug/MVP",
    "stats": {},
    "evidence_items": [],
    "confidence": "low",
    "data_coverage": "low"
  }
}
```

---

# 6. `Merge :: Context + Empty Jira`

Склей:

* output `WF11`
* output `Set :: Empty Jira Summary`

Mode: merge by position / combine into single item.

После merge у тебя должен быть item такого вида:

```json
{
  "employee": {...},
  "self_assessment": {...},
  "role_matrix": {...},
  "learning_assets_pool": [...],
  "employee_data_quality_issues": [...],
  "jira_summary": {...}
}
```

---

# 7. `Set :: Build Input for WF30`

Очень рекомендую перед каждым дочерним workflow делать явный `Set`, чтобы вход был чистый и предсказуемый.

## Поля

```json
{
  "employee": "={{$json.employee}}",
  "self_assessment": "={{$json.self_assessment}}",
  "role_matrix": "={{$json.role_matrix}}",
  "learning_assets_pool": "={{$json.learning_assets_pool}}",
  "jira_summary": "={{$json.jira_summary}}",
  "employee_data_quality_issues": "={{$json.employee_data_quality_issues}}",
  "config": {
    "max_competencies_for_llm": "={{$('Set :: Debug Input').item.json.config.max_competencies_for_llm}}",
    "expected_target_level_by_grade": "={{$('Set :: Debug Input').item.json.config.expected_target_level_by_grade}}"
  }
}
```

---

# 8. `Execute Workflow :: WF30_Competency_Analysis_v1`

## Что должен вернуть

```json
{
  "competency_analysis": {
    "competency_results": [...],
    "employee_summary": {...},
    "top_priority_competencies": [...],
    "analysis_quality": "medium",
    "flags": []
  }
}
```

---

# 9. `Merge :: Context + Competency Analysis`

Склей:

* item после `Set :: Build Input for WF30`
* output `WF30`

После этого у тебя должно быть:

```json
{
  "employee": {...},
  "self_assessment": {...},
  "role_matrix": {...},
  "learning_assets_pool": [...],
  "jira_summary": {...},
  "employee_data_quality_issues": [...],
  "config": {...},
  "competency_analysis": {...}
}
```

---

# 10. `Set :: Build Input for WF40`

## Поля

```json
{
  "employee": "={{$json.employee}}",
  "role_matrix": "={{$json.role_matrix}}",
  "learning_assets_pool": "={{$json.learning_assets_pool}}",
  "jira_summary": "={{$json.jira_summary}}",
  "competency_analysis": "={{$json.competency_analysis}}",
  "config": {
    "plan_duration_months": 6,
    "quarters": 2,
    "max_competencies_per_quarter": "={{$('Set :: Debug Input').item.json.config.max_competencies_per_quarter}}",
    "max_assets_per_competency": "={{$('Set :: Debug Input').item.json.config.max_assets_per_competency}}"
  }
}
```

---

# 11. `Execute Workflow :: WF40_Development_Plan_v1`

## Что должен вернуть

```json
{
  "development_plan": {...},
  "manager_plan": {...},
  "one2one_guide": {...}
}
```

---

# 12. `Merge :: Context + Plan`

Склей:

* context + competency_analysis
* output `WF40`

После merge структура будет примерно такой:

```json
{
  "employee": {...},
  "self_assessment": {...},
  "role_matrix": {...},
  "learning_assets_pool": [...],
  "jira_summary": {...},
  "employee_data_quality_issues": [...],
  "competency_analysis": {...},
  "development_plan": {...},
  "manager_plan": {...},
  "one2one_guide": {...}
}
```

---

# 13. `Set :: Build Input for WF50`

## Поля

```json
{
  "employee": "={{$json.employee}}",
  "self_assessment": "={{$json.self_assessment}}",
  "role_matrix": "={{$json.role_matrix}}",
  "jira_summary": "={{$json.jira_summary}}",
  "competency_analysis": "={{$json.competency_analysis}}",
  "development_plan": "={{$json.development_plan}}",
  "manager_plan": "={{$json.manager_plan}}",
  "one2one_guide": "={{$json.one2one_guide}}",
  "employee_data_quality_issues": "={{$json.employee_data_quality_issues}}",
  "config": {
    "run_id": "={{$('Set :: Debug Input').item.json.config.run_id}}",
    "assessment_date": "={{$('Set :: Debug Input').item.json.config.assessment_date}}",
    "review_period_start": "={{$('Set :: Debug Input').item.json.config.review_period_start}}",
    "review_period_end": "={{$('Set :: Debug Input').item.json.config.review_period_end}}"
  }
}
```

---

# 14. `Execute Workflow :: WF50_Report_Generation_v1`

## Что должен вернуть

```json
{
  "employee_report_json": {...},
  "employee_report_markdown": "...",
  "manager_compact_markdown": "...",
  "report_meta": {...}
}
```

---

# 15. `Code :: Final Debug Output`

Сделай финальный компактный вывод, чтобы удобно смотреть в execution.

## Код

```javascript
return [{
  json: {
    status: 'success',
    employee_id: $json.report_meta?.employee_id || '',
    report_filename: $json.report_meta?.report_filename || '',
    json_filename: $json.report_meta?.json_filename || '',
    markdown_preview: ($json.employee_report_markdown || '').slice(0, 1500),
    manager_preview: ($json.manager_compact_markdown || '').slice(0, 1000),
    report_json_meta: $json.employee_report_json?.meta || {}
  }
}];
```

---

# Как должен выглядеть весь debug chain визуально

Прямо в n8n это будет выглядеть примерно так:

`Manual Trigger`
→ `Set :: Debug Input`
→ `Execute Workflow :: WF10`
→ `Execute Workflow :: WF11`
→ `Set :: Empty Jira Summary`
→ `Merge :: Context + Empty Jira`
→ `Set :: Build Input for WF30`
→ `Execute Workflow :: WF30`
→ `Merge :: Context + Competency Analysis`
→ `Set :: Build Input for WF40`
→ `Execute Workflow :: WF40`
→ `Merge :: Context + Plan`
→ `Set :: Build Input for WF50`
→ `Execute Workflow :: WF50`
→ `Code :: Final Debug Output`

---

# Что проверять после каждого шага

## После `WF10`

Проверь:

* есть employees
* есть matrices
* есть self_assessments
* есть learning_assets
* есть data_quality_issues

## После `WF11`

Проверь:

* employee найден
* role_matrix не пустой
* self_assessment либо есть, либо null
* learning_assets_pool есть

## После `WF30`

Проверь:

* есть `competency_analysis.competency_results`
* есть `employee_summary`
* приоритеты не пустые хотя бы у нормального сотрудника

## После `WF40`

Проверь:

* `quarter_1` не пустой
* есть `manager_plan`
* есть `one2one_guide`

## После `WF50`

Проверь:

* markdown читается
* report_json полон
* report_meta корректный

---

# Минимальные IF-проверки, которые стоит добавить даже в debug chain

Чтобы быстрее отлавливать проблемы, я бы вставил 3 проверки.

## IF 1: после `WF11`

Условие:

* `{{$json.role_matrix !== null}}`

Если false:

* в `Set :: Fail Context`
* завершить debug run

## IF 2: после `WF30`

Условие:

* `{{!!$json.competency_analysis}}`

Если false:

* fallback summary

## IF 3: после `WF40`

Условие:

* `{{!!$json.development_plan}}`

Если false:

* fallback minimal development plan

---

# Минимальный fallback plan для debug

Если `WF40` сломался, можно поставить `Set :: Fallback Plan`

```json
{
  "development_plan": {
    "quarter_1": [],
    "quarter_2": [],
    "plan_summary": "План развития не был автоматически построен, требуется ручная доработка."
  },
  "manager_plan": {
    "focus_areas": [],
    "support_actions": [],
    "assignment_recommendations": [],
    "risks": ["Автоматический план не был построен"],
    "checkpoints": []
  },
  "one2one_guide": {
    "conversation_goal": "Обсудить текущее состояние и вручную согласовать план развития.",
    "sections": [],
    "closing_questions": [],
    "agreement_points": []
  }
}
```

---

# Что получится в конце

Когда этот debug chain заработает, у тебя уже будет рабочий MVP на одного сотрудника.

Потом ты:

1. заменяешь `Set :: Empty Jira Summary` на `WF20_Jira_Enrichment`;
2. оборачиваешь цепочку в `Split In Batches`;
3. выносишь это в `WF00_Orchestrator`.

---

# Самый разумный следующий шаг

Теперь уже имеет смысл сделать одну из двух вещей:

* либо я дам тебе exact skeleton для `WF30` внутри одного workflow, включая внутренний цикл по компетенциям и ноды LLM;
* либо exact skeleton для `WF40`, включая матчинг learning assets и генерацию Q1/Q2.

Самым полезным сейчас будет `WF30`, потому что это самое сложное место и именно оно обычно ломает всю систему.







\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\









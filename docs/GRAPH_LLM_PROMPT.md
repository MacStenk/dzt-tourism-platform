# Neo4j Projekt-Graph - LLM System Prompt

Füge diesen Prompt zu deinem Claude/GPT System Prompt hinzu, wenn du auf den DZT Tourism Platform Graph zugreifst.

---

## Neo4j Projekt-Graph Zugriff

Du hast Zugriff auf einen Neo4j Knowledge Graph für das Projekt "DZT Tourism Platform". 
Nutze diesen Graph um Kontext zu laden, Entscheidungen zu dokumentieren und den Fortschritt zu tracken.

**Connection:**
```
URI: bolt://yamanote.proxy.rlwy.net:36570
User: neo4j
```

---

## Bei Session-Start ausführen:

```cypher
MATCH (c:Changelog)
WITH c ORDER BY c.version DESC LIMIT 1
MATCH (q:OpenQuestion {status: 'open'})
OPTIONAL MATCH (t:Task {status: 'in_progress'})
RETURN c AS aktuelleVersion, collect(DISTINCT q.question) AS offeneFragen, collect(DISTINCT t.name) AS laufendeTasks
```

---

## Workflows (automatisch ausführen):

### 1. User trifft Entscheidung → Decision erstellen:
```cypher
CREATE (d:Decision {name: $name, decision: $value, reasoning: $why, decidedAt: datetime()})
WITH d MATCH (p:Project {name: 'DZT Tourism Platform'}) CREATE (p)-[:MADE_DECISION]->(d)
```

### 2. Task/Feature fertig → Status updaten + Changelog:
```cypher
MATCH (t {name: $taskName}) SET t.status = 'completed', t.completedAt = datetime()
WITH t MATCH (c:Changelog {status: 'next'}) SET c.changes = c.changes + $changeDescription
```

### 3. Neue Frage/Unsicherheit → OpenQuestion erstellen:
```cypher
CREATE (q:OpenQuestion {question: $frage, status: 'open', createdAt: datetime()})
WITH q MATCH (p:Project {name: 'DZT Tourism Platform'}) CREATE (p)-[:HAS_QUESTION]->(q)
```

### 4. Version abgeschlossen → Changelog finalisieren:
```cypher
MATCH (c:Changelog {status: 'next'}) SET c.status = 'completed', c.date = date()
WITH c MATCH (next:Changelog {status: 'planned'}) WITH next ORDER BY next.version LIMIT 1 SET next.status = 'next'
```

---

## Node-Types:

| Label | Beschreibung | Key Properties |
|-------|--------------|----------------|
| Project | Hauptprojekt | name |
| Changelog | Versionshistorie | version, status, changes[] |
| Decision | Entscheidungen | name, decision, reasoning |
| OpenQuestion | Offene Fragen | question, status |
| Technology | Tech-Stack | name, role, status |
| Task | Aufgaben | name, status, priority |
| Bot | Automatisierungen | name, purpose, status |
| Repository | Code Repos | name, url |
| DataSource | Datenquellen | name, type, status |
| AffiliatePartner | Monetarisierung | name, commission |
| Competitor | Wettbewerber | name, weakness |
| SystemPrompt | LLM Prompts | name, content |

---

## Status-Werte:
- `planned` - Geplant
- `next` - Als nächstes dran
- `in_progress` - In Arbeit
- `completed` - Abgeschlossen
- `blocked` - Blockiert
- `cancelled` - Abgebrochen

---

## Konventionen:
- Immer `datetime()` für Timestamps
- Vor CREATE mit MATCH prüfen ob Node existiert
- Changelog bei jeder signifikanten Änderung updaten
- Alle Nodes mit Project verknüpfen via Relationship
- Labels in PascalCase, Properties in camelCase

---

## Hilfreiche Queries:

**Gesamtübersicht:**
```cypher
MATCH (p:Project {name: 'DZT Tourism Platform'})
OPTIONAL MATCH (p)-[:HAS_CHANGELOG]->(c:Changelog)
OPTIONAL MATCH (p)-[:USES_TECH]->(t:Technology)
OPTIONAL MATCH (p)-[:HAS_QUESTION]->(q:OpenQuestion {status: 'open'})
RETURN p.name, collect(DISTINCT c.version) AS versions, collect(DISTINCT t.name) AS tech, collect(DISTINCT q.question) AS openQuestions
```

**Tech-Stack:**
```cypher
MATCH (t:Technology)
RETURN t.name, t.role, t.status
ORDER BY t.status, t.name
```

**Offene Fragen:**
```cypher
MATCH (q:OpenQuestion {status: 'open'})
RETURN q.question, q.createdAt
ORDER BY q.createdAt
```

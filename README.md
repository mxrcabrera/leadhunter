# LeadHunter

AI-powered lead hunting system that scrapes multiple job sources, scores leads by tech stack and location fit, and generates personalized outreach messages using a local LLM.

## What It Does

- **Scrapes job leads** from HackerNews ("Who is Hiring?"), Reddit (r/forhire, r/remotejs, r/webdev, etc.), and RemoteOK
- **Classifies and scores leads** (0-100) based on tech match, location compatibility, job type, and domain relevance
- **Auto-discards** leads requiring US-only, on-site, or visa sponsorship — surfaces remote/LATAM-friendly opportunities
- **Generates personalized messages** via Ollama (local LLM) — 60-word max, experience-driven, no generic filler
- **Prospect hunting** for outbound B2B sales with web scraping and contact extraction
- **Agentic pipeline** — Scout, Analyst, and Writer agents that can scrape, evaluate, and draft messages autonomously

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js (ES Modules) |
| Server | Express.js |
| Database | SQLite (better-sqlite3) |
| AI/LLM | Ollama (local — qwen2.5-coder:14b) |
| Scraping | Cheerio + Axios |
| Frontend | Vanilla HTML/CSS/JS (single-page) |

## Getting Started

```bash
# Install dependencies
npm install

# Initialize the database
npm run db:init

# Start the server (localhost:3000)
npm start

# Scrape all sources
npm run scrape
```

### Prerequisites

- **Node.js** 18+
- **Ollama** running locally at `http://localhost:11434` with qwen2.5-coder:14b model pulled (`ollama pull qwen2.5-coder:14b`)

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start server on port 3000 |
| `npm run db:init` | Initialize or reset the database |
| `npm run scrape` | Scrape all sources (HN, Reddit, RemoteOK) |
| `npm run scrape:hn` | Scrape HackerNews only |
| `npm run scrape:reddit` | Scrape Reddit only |
| `npm run scrape:remoteok` | Scrape RemoteOK only |
| `npm run classify` | Reclassify all leads |

## Architecture

```
┌──────────────────────────────────────────────────┐
│                   Frontend (SPA)                  │
│  Tabs: Leads │ Prospects │ Products │ Agents │ Config  │
└──────────────────────┬───────────────────────────┘
                       │ REST API
┌──────────────────────┴───────────────────────────┐
│                  Express Server                   │
├──────────┬───────────┬───────────┬───────────────┤
│ Scrapers │ Classifier│  Agents   │ RAG/Messages  │
│          │           │           │               │
│ HN       │ Tech      │ Scout     │ Application   │
│ Reddit   │ Location  │ Analyst   │ generation    │
│ RemoteOK │ Type      │ Writer    │ Sales message │
│ Google   │ Domain    │ Orchestr. │ generation    │
└────┬─────┴─────┬─────┴─────┬─────┴───────┬───────┘
     │           │           │             │
     ▼           ▼           ▼             ▼
  SQLite    profile.json   Ollama    products.json
```

### Lead Scoring Breakdown

| Component | Range | What It Measures |
|-----------|-------|-----------------|
| Tech Score | 0-50 | Match against core tech (×15) and secondary tech (×5) with synonym support |
| Location Score | -100 to 20 | Remote/LATAM-friendly (+20), US-only/on-site (instant discard) |
| Type Score | 0-25 | Freelance/contract (25), agency (10), full-time (5) |
| Domain Score | 0-15 | Industry match (logistics, healthcare, fintech, SaaS, etc.) |

### Lead Categories

| Category | Description |
|----------|-------------|
| Freelance | Direct contract/freelance opportunities |
| Agency | Job boards and staffing platforms |
| Full-time | Permanent positions (backup) |
| Prospects | Outbound B2B targets for product sales |

### Agent System

Three specialized agents coordinate through an orchestrator:

- **Scout** — Scrapes sources, finds new leads, reports database stats
- **Analyst** — Evaluates lead quality, researches companies, recommends or discards
- **Writer** — Generates personalized application messages using profile + lead context

The orchestrator detects user intent from natural language and routes to the appropriate agent. A full pipeline mode runs all three sequentially: scrape → analyze → generate messages.

## Configuration

Edit `data/profile.json` to customize:
- `core_tech` / `secondary_tech` — technologies that drive scoring
- `domains` — industry experience for domain matching
- `experience` — work history used in message generation

Edit `data/products.json` to configure B2B products for outbound sales.

Google Custom Search API key can be set through the UI config tab (optional, for prospect search).

## License

MIT

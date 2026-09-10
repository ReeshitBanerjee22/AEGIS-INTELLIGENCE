# Dark-Web Threat Actor Identity Resolution Engine

A stylometric identity correlation system that ingests text posts across dark-web forums and marketplaces, extracts linguistic and semantic vector embeddings, computes pairwise similarity matrices, and renders an interactive force-directed intelligence graph.

---

## 📁 Project Structure

```
E:\SIH PROJECT
├── backend/
│   ├── app/
│   │   ├── data/
│   │   │   ├── personas.json            # Ground-truth synthetic dark-web dataset (20 personas)
│   │   │   └── similarity_matrix.json   # Precomputed embeddings & stylometric evidence
│   │   ├── routers/
│   │   │   ├── aliases.py               # GET /aliases, GET /aliases/{id}
│   │   │   └── graph.py                 # GET /graph, GET /resolve/{id}, POST /inject, POST /reset-demo
│   │   └── main.py                      # FastAPI app & in-memory dataset loader
│   ├── scripts/
│   │   └── embed_and_score.py           # Offline sentence-transformer embedding & scoring script
│   └── requirements.txt                 # Backend dependencies
│
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.js                # API fetch client
│   │   ├── components/
│   │   │   ├── Graph.jsx                # 2D Force Graph with collision avoidance & spotlight glow
│   │   │   ├── ThresholdSlider.jsx      # Dynamic resolution slider (0.30 - 0.95)
│   │   │   ├── EvidencePanel.jsx        # Right slide-in dossier & stylometric evidence panel
│   │   │   ├── InvestigationMode.jsx    # Analyst workflow (Selection, Candidates, Report)
│   │   │   ├── AliasDetail.jsx          # Alias profile & post timeline
│   │   │   ├── ClusterCards.jsx         # Bottom strip of resolved clusters with border-beam glow
│   │   │   └── InjectButton.jsx         # Live alias injection demo button
│   │   ├── App.jsx                      # Main SOC dashboard layout
│   │   └── index.css                    # Tailwind v4, dark theme palette & animations
│   ├── package.json                     # Frontend dependencies
│   └── vite.config.js                   # Vite configuration
│
├── .gitignore                           # Git ignore rules
└── README.md                            # Documentation
```

---

## 🚀 Quick Start Guide

### 1. Start Backend Server (FastAPI)
```powershell
cd "E:\SIH PROJECT\backend"
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000 --host 127.0.0.1
```
*Backend runs at `http://127.0.0.1:8000` (API Docs at `/docs`)*

### 2. Start Frontend Server (React + Vite)
```powershell
cd "E:\SIH PROJECT\frontend"
npm install
npm run dev
```
*Frontend opens at `http://127.0.0.1:5173`*

---

## ⚡ Key Capabilities
- **Zero Live Inference Latency**: Precomputed similarity matrices and stylometric features ensure instant, responsive filtering on stage.
- **Dynamic Threshold Slider**: Real-time connected-components clustering (`0.50` to `0.85`), with optimal resolution baseline at `0.62`.
- **Analyst Investigation Mode**: A dedicated, structured workflow for threat analysts to select an alias, generate high-confidence candidates, compare stylometric evidence side-by-side, and generate an intelligence report.
- **Comprehensive Intelligence Reports & PDF Export**: Instantly compile evidence into formal threat intelligence reports and export them as PDFs for offline distribution or subpoenas.
- **"Explain This Link" Pairwise Evidence**: Clicking any edge provides an explainable breakdown of the correlation using granular signals (Semantic, Lexical, Syntactic, Punctuation, Temporal), supporting vs. contradictory evidence, and pairwise statistics.
- **Threat Actor Evolution Timeline**: Automatically maps out historical post activity to visually determine if connected aliases operated concurrently or represent a sequential identity handover.
- **Confidence Scoring**: Translates raw mathematical similarity into actionable intelligence classifications (Weak, Possible, Probable, High-Confidence Linkage).
- **Staged Alias Injection**: Demonstrates real-time threat alias ingestion and automated cluster assignment on the fly.

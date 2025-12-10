# SyncForge

A tool for managing software integrations and automating synchronized updates across multiple GitHub repositories using cloud coding agents (powered by Cursor Cloud Agents).

<img width="705" height="807" alt="image" src="https://github.com/user-attachments/assets/bd90a064-df09-4336-9461-419669b37ee9" />


## Overview

SyncForge helps teams maintain consistency across multiple codebases by:

- Managing integrations linked to GitHub repositories
- Using an AI-powered wizard to understand update requirements
- Orchestrating Cursor Cloud Agents to implement changes automatically
- Creating pull requests across all affected repositories

<img width="1102" height="880" alt="Screenshot 2025-12-10 at 4 16 18 PM" src="https://github.com/user-attachments/assets/f1eae803-5dcf-4f5a-947d-0f4f8317a517" />

<img width="691" height="417" alt="image" src="https://github.com/user-attachments/assets/9c6dc424-dab6-4e1a-96c3-3fdea27f5e8c" />
<img width="756" height="878" alt="Screenshot 2025-12-10 at 4 15 27 PM" src="https://github.com/user-attachments/assets/3fefc4ca-7ae6-422a-8b10-671ed2a15cde" />


## Architecture

```
frontend/          React + TypeScript + Vite
backend/           FastAPI + SQLAlchemy + LangGraph
  agents/          LangGraph-based AI agents
  routes/          API endpoints
  services/        External service clients (Cursor API)
```

## Prerequisites

- Python 3.11+
- Node.js 18+
- OpenAI API key (for the update wizard agent)
- Cursor API key (for cloud agent automation)
- GitHub Personal Access Token (for repository access and PR creation)

## Installation

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file in the `backend/` directory:

```env
OPENAI_API_KEY=sk-...
```

### Frontend

```bash
cd frontend
npm install
```

## Running the Application

### Development

Start the backend:

```bash
cd backend
source venv/bin/activate
python application.py
```

The API runs at `http://localhost:8000`.

Start the frontend:

```bash
cd frontend
npm run dev
```

The UI runs at `http://localhost:5173`.

## Configuration

Configure API keys in the Settings modal within the application:

- **Cursor API Key**: Required for launching cloud agents to implement updates
- **GitHub PAT**: Required for accessing private repositories and creating PRs

## Usage

### 1. Add Integrations

Create integrations by providing:
- A name for the integration
- One or more GitHub repository URLs
- Optional custom instructions for the AI agent

### 2. Create an Update

Use the Update Wizard to describe the changes you want to make:
- Chat with the AI to clarify requirements
- Attach GitHub PRs as reference (diffs are automatically extracted)
- Upload relevant files or documentation
- Select which integrations to update

### 3. Execute Updates

Once an update is created:
- SyncForge launches Cursor Cloud Agents for each integration
- Agents implement the changes based on the implementation guide
- Monitor progress and interact with agents as needed
- Review and merge created PRs

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/integrations` | List all integrations |
| `POST /api/integrations` | Create an integration |
| `GET /api/updates` | List all updates |
| `POST /api/wizard/start` | Start the update wizard |
| `POST /api/wizard/chat` | Chat with the wizard agent |
| `POST /api/wizard/finalize` | Create an update from wizard session |
| `POST /api/agents/{id}/launch` | Launch a Cursor agent for an integration |
| `GET /api/agents/{id}/status` | Get agent status and conversation |

## Tech Stack

### Backend
- FastAPI - REST API framework
- SQLAlchemy - ORM and database management
- LangGraph - Agent orchestration framework
- LangChain - LLM integration
- httpx - Async HTTP client

### Frontend
- React 18 - UI framework
- TypeScript - Type safety
- Vite - Build tool
- TailwindCSS - Styling
- React Query - Server state management
- Framer Motion - Animations

## Database

SyncForge uses SQLite by default. The database file (`syncforge.db`) is created automatically in the backend directory.

### Models

- **Integration**: Represents a linked GitHub repository with custom instructions
- **Update**: A batch update request with implementation guide
- **UpdateIntegration**: Tracks the status of an update for each integration
- **UserSettings**: Stores API keys and user preferences

## License

MIT

# SyncForge

A tool for managing software integrations and automating synchronized updates across multiple GitHub repositories using cloud coding agents (powered by Cursor Cloud Agents). SyncForge remembers implementation techniques for each integration and becomes better at managing your rollouts over time. It integrates with GitHub, Linear, and Cursor to fit into your existing stack. 

---

## Who is SyncForge for?

SyncForge is built for teams and developers who maintain **multiple codebases that need to stay in sync**:

- **SDK maintainers** shipping libraries across multiple languages (JavaScript, Python, Go, etc.)
- **Platform teams** managing client integrations that must reflect API changes
- **Open source maintainers** coordinating updates across forks or related projects
- **Ecosystem managers** distributing changes to a network of platform partners (LangChain, n8n, etc.)

If you've ever spent hours copy-pasting the same change across repositories—or worse, forgotten one, SyncForge automates that process with cloud agents that understand your codebase conventions.

📍 **[View the Roadmap →](./ROADMAP.md)** — See what's coming next and how to contribute to future features.

---

## Part 1: What is SyncForge?

SyncForge helps teams maintain consistency across multiple codebases by:

- Managing integrations linked to GitHub repositories
- Using an update wizard to understand update requirements
- Orchestrating Cursor Cloud Agents to implement changes automatically
- Creating pull requests across all affected repositories

### Adding Integrations

Integrations represent codebases you want to keep synchronized. Each integration links to one or more GitHub repositories.

<img width="691" height="417" alt="image" src="https://github.com/user-attachments/assets/9c6dc424-dab6-4e1a-96c3-3fdea27f5e8c" />

**To add an integration:**

1. Click **"Add Integration"** from the main dashboard
2. Enter a descriptive name (e.g., "JavaScript SDK", "n8n")
3. Add GitHub repository URLs:
   - Paste URLs directly, or
   - Click **"Browse repositories"** to select from your GitHub account (requires GitHub PAT)
4. Add **Integration Instructions** to guide the AI agent:
   - Describe the codebase structure and conventions
   - Note any specific update patterns or constraints
   - Link to relevant documentation

**Repository validation:**
- Public repositories are validated automatically (green checkmark)
- Private repositories require a GitHub PAT configured in Settings (amber lock icon)
- Invalid URLs are flagged with an error message

**Tip:** Good integration instructions help the AI agent make more accurate changes. Include details about the tech stack, file organization, and coding conventions.

### Using the Update Wizard

The Update Wizard guides you through defining changes that will be applied across all selected integrations.

<img width="1102" height="880" alt="Screenshot 2025-12-10 at 4 16 18 PM" src="https://github.com/user-attachments/assets/f1eae803-5dcf-4f5a-947d-0f4f8317a517" />

**Starting the wizard:**

1. Click **"New Update"** from the main dashboard
2. The wizard opens with a chat interface and configuration panel

**Chat interface (left panel):**

- Describe the changes you want to make in natural language
- The AI assistant will ask clarifying questions to understand:
  - What functionality to add/modify
  - API changes or breaking changes
  - Testing requirements
  - Any edge cases to handle
- Continue the conversation until the AI indicates it's ready to proceed

**Attachments (right panel):**

Provide context to help the AI understand your requirements:

- **GitHub PRs**: Reference existing pull requests—diffs are automatically extracted and included as context
- **Linear Issues**: Attach Linear issues to provide requirements and acceptance criteria as context
- **Files**: Upload documentation, specs, or example code
- **URLs**: Link to API docs, design specs, or reference implementations

**Integration selection:**

- By default, all integrations are selected
- Click integrations to toggle them on/off
- Click the gear icon to add **per-integration instructions** for this specific update
- Use per-integration instructions to handle differences between codebases

**Options:**

- **Auto Create PR**: When enabled, SyncForge automatically creates a pull request when the agent completes its work

**Finalizing:**

Once the AI indicates it's ready (the "Start Update" button becomes enabled), click it to begin the rollout.

### Monitoring a Rollout

After creating an update, SyncForge launches Cursor Cloud Agents to implement changes across your integrations. The dashboard provides real-time monitoring.

<img width="514" height="627" alt="image" src="https://github.com/user-attachments/assets/b7f86d04-a3f1-486d-ae83-b475ff09680a" />

**Update card:**

Each update shows:
- Title and creation time
- Overall progress (e.g., "2 of 5 complete")
- Individual integration status

**Integration statuses:**

| Status | Description |
|--------|-------------|
| **Pending** | Agent not yet started |
| **Running** | Agent is actively coding |
| **Needs Review** | Agent has a question or needs input |
| **Ready to Merge** | Changes complete, PR ready |
| **Complete** | Update merged or finalized |
| **Cancelled** | Agent was stopped |

**Agent panel:**

Click an integration to expand its agent panel:

- **Update Plan**: View the full implementation guide sent to the agent
- **Conversation**: See the agent's progress and any messages
- **Branch link**: Direct link to the working branch on GitHub
- **PR link**: Link to the created pull request (if auto-create is enabled)

<img width="1150" height="786" alt="image" src="https://github.com/user-attachments/assets/cf607cf5-8162-4611-bf40-59f7dd8fae06" />

**Interacting with agents:**

- **Send follow-up messages**: Provide additional guidance or answer agent questions
- **Stop agent**: Cancel the agent if needed
- **View on Cursor**: Open the agent directly in Cursor's cloud agent interface

**Agent questions:**

When an agent needs clarification, an amber alert appears with the question. Type your response in the message input to continue the agent's work.

**Automatic polling:**

SyncForge automatically polls for updates:
- Branch creation detection
- New commits from agents
- Conversation updates

No manual refresh needed—the UI updates automatically as agents make progress.

---

## Part 2: Installation & Running

### Prerequisites

- Python 3.11+
- Node.js 18+
- OpenAI API key (for the update wizard agent)
- Cursor API key (for cloud agent automation)
- GitHub Personal Access Token (for repository access and PR creation)
- Linear API key (optional, for attaching Linear issues as context)

### Backend Setup

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

### Frontend Setup

```bash
cd frontend
npm install
```

### Running the Application

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

### Configuration

Configure API keys in the Settings modal within the application:

- **Cursor API Key**: Required for launching cloud agents to implement updates
- **GitHub PAT**: Required for accessing private repositories and creating PRs
- **Linear API Key**: Optional—enables attaching Linear issues to updates for additional context

---

## Part 3: Tech Stack

### Architecture

```
frontend/          React + TypeScript + Vite
backend/           FastAPI + SQLAlchemy + LangGraph
  agents/          LangGraph-based AI agents
  routes/          API endpoints
  services/        External service clients (Cursor API)
```

### Backend

- **FastAPI** - REST API framework
- **SQLAlchemy** - ORM and database management
- **LangGraph** - Agent orchestration framework
- **LangChain** - LLM integration
- **httpx** - Async HTTP client

### Frontend

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **TailwindCSS** - Styling
- **React Query** - Server state management
- **Framer Motion** - Animations

### Database

SyncForge uses SQLite by default. The database file (`syncforge.db`) is created automatically in the backend directory.

**Models:**

- **Integration**: Represents a linked GitHub repository with custom instructions
- **Update**: A batch update request with implementation guide
- **UpdateIntegration**: Tracks the status of an update for each integration
- **UserSettings**: Stores API keys and user preferences

### API Endpoints

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

---

## Part 4: Contributing

We welcome contributions! Here's how to get started.

### Development Setup

1. Fork the repository
2. Clone your fork locally
3. Follow the installation steps in Part 2
4. Create a new branch for your feature or fix

### Code Style

**Backend (Python):**
- Follow PEP 8 conventions
- Use type hints for function signatures
- Keep functions focused and well-documented

**Frontend (TypeScript):**
- Use functional components with hooks
- Follow the existing component patterns
- Use TypeScript types/interfaces for props and state

### Pull Request Guidelines

1. **Create focused PRs**: One feature or fix per PR
2. **Write descriptive commit messages**: Explain what and why
3. **Test your changes**: Ensure the app runs without errors
4. **Update documentation**: If your change affects usage, update the README

### Areas for Contribution

- **Bug fixes**: Check the issues for reported bugs
- **New features**: Discuss larger features in an issue first
- **Documentation**: Improve guides, add examples
- **UI/UX improvements**: Enhance the user experience

### Running Tests

```bash
# Backend
cd backend
pytest

# Frontend
cd frontend
npm run lint
```

### Questions?

Open an issue for questions or to discuss ideas before starting work.

---

## License

AGPL

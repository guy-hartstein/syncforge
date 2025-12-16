from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from database import Base, engine
import models  # noqa: F401 - Import models to register them with Base before create_all
from routes.github import router as github_router
from routes.integrations import router as integrations_router
from routes.linear import router as linear_router
from routes.update_wizard import router as wizard_router
from routes.updates import router as updates_router
from routes.agents import router as agents_router
from routes.settings import router as settings_router

# Load environment variables
load_dotenv()

# Create database tables
Base.metadata.create_all(bind=engine)


def run_migrations():
    """Run any necessary schema migrations."""
    with engine.connect() as conn:
        # Add preferred_model column to user_settings if it doesn't exist
        result = conn.execute(text("PRAGMA table_info(user_settings)"))
        columns = [row[1] for row in result.fetchall()]
        if "preferred_model" not in columns:
            conn.execute(text("ALTER TABLE user_settings ADD COLUMN preferred_model VARCHAR(100)"))
            conn.commit()
        if "linear_api_key" not in columns:
            conn.execute(text("ALTER TABLE user_settings ADD COLUMN linear_api_key TEXT"))
            conn.commit()
        
        # Add pr_merged and pr_merged_at columns to update_integrations if they don't exist
        result = conn.execute(text("PRAGMA table_info(update_integrations)"))
        columns = [row[1] for row in result.fetchall()]
        if "pr_merged" not in columns:
            conn.execute(text("ALTER TABLE update_integrations ADD COLUMN pr_merged BOOLEAN DEFAULT 0"))
            conn.commit()
        if "pr_merged_at" not in columns:
            conn.execute(text("ALTER TABLE update_integrations ADD COLUMN pr_merged_at DATETIME"))
            conn.commit()


run_migrations()

app = FastAPI(
    title="SyncForge API",
    description="API for managing integrations",
    version="1.0.0",
)

# Configure CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(integrations_router)
app.include_router(github_router)
app.include_router(linear_router)
app.include_router(wizard_router)
app.include_router(updates_router)
app.include_router(agents_router)
app.include_router(settings_router)


@app.get("/health")
def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

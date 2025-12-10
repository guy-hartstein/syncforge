from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine
from routes.github import router as github_router
from routes.integrations import router as integrations_router
from routes.update_wizard import router as wizard_router
from routes.updates import router as updates_router
from routes.agents import router as agents_router
from routes.settings import router as settings_router

# Load environment variables
load_dotenv()

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="SyncForge API",
    description="API for managing integrations",
    version="1.0.0",
)

# Configure CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(integrations_router)
app.include_router(github_router)
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

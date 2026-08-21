from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    POSTGRES_DB: str
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_HOST: str
    POSTGRES_PORT: int

    # Auth — access token em 30 dias enquanto o delogar automático está
    # desabilitado (o front ainda não usa o refresh token; ao implementar o
    # fluxo de refresh, voltar para 30 minutos). Env var em produção
    # sobrescreve este default.
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=43200)
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default=7)

    # App
    ENVIRONMENT: str = "development"
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # Ingestão: "inline" executa na thread da API (default); "worker" só
    # enfileira — o processo `python -m app.worker` reivindica e executa.
    INGESTAO_EXECUTOR: str = "inline"

    # AI
    ANTHROPIC_API_KEY: str = ""

    class Config:
        env_file = (".env", ".env.local")  # .env.local overrides .env for local dev
        # Tolerate unknown env vars so a stale .env (e.g. legacy ALGORITHM=HS256
        # after the JWT helper was hardcoded) doesn't crash Settings load.
        # Pydantic v2 defaults to "forbid", which broke alembic / pytest / the
        # whole API after that auth refactor.
        extra = "ignore"


settings = Settings()
